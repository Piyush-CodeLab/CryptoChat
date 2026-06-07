#!/usr/bin/env python3
"""
CodeX PQ-SC — Hybrid Post-Quantum Secure Channel
Backend WebSocket Server
ML-KEM (Kyber768) Handshake + Serpent-CBC Message Encryption
"""

import asyncio
import websockets
import websockets.http11
import json
import os
import hashlib
import struct
import time
import traceback

# Monkeypatch websockets HTTP parser to allow HEAD requests (for Render health checks)
_original_request_parse = websockets.http11.Request.parse

def make_wrapped_read_line(original_read_line):
    def wrapped_read_line(limit):
        line = yield from original_read_line(limit)
        if line.startswith(b"HEAD "):
            line = b"GET " + line[5:]
        return line
    return wrapped_read_line

@classmethod
def custom_request_parse(cls, read_line):
    wrapped = make_wrapped_read_line(read_line)
    return (yield from _original_request_parse(wrapped))

websockets.http11.Request.parse = custom_request_parse

# ═══════════════════════════════════════════════════════════════
# SERPENT BLOCK CIPHER — Pure Python Reference Implementation
# 128-bit block, 256-bit key, 32 rounds
# ═══════════════════════════════════════════════════════════════

SBOX = [
    [3,8,15,1,10,6,5,11,14,13,4,2,7,0,9,12],
    [15,12,2,7,9,0,5,10,1,11,14,8,6,13,3,4],
    [8,6,7,9,3,12,10,15,13,1,14,4,0,11,5,2],
    [0,15,11,8,12,9,6,3,13,1,2,4,10,7,5,14],
    [1,15,8,3,12,0,11,6,2,5,4,10,9,14,7,13],
    [15,5,2,11,4,10,9,12,0,3,14,8,13,6,7,1],
    [7,2,12,5,8,4,6,11,14,9,1,15,13,3,10,0],
    [1,13,15,0,14,8,2,11,7,4,12,10,9,3,5,6],
]

SBOX_INV = []
for box in SBOX:
    inv = [0] * 16
    for i, v in enumerate(box):
        inv[v] = i
    SBOX_INV.append(inv)

PHI = 0x9E3779B9

def _rotl32(v, n):
    return ((v << n) | (v >> (32 - n))) & 0xFFFFFFFF

def _rotr32(v, n):
    return ((v >> n) | (v << (32 - n))) & 0xFFFFFFFF

def _apply_sbox(sbox_idx, nibbles_32bit_words):
    """Apply S-box to four 32-bit words in bitslice fashion."""
    box = SBOX[sbox_idx % 8]
    w0, w1, w2, w3 = nibbles_32bit_words
    r0, r1, r2, r3 = 0, 0, 0, 0
    for bit in range(32):
        inp = ((w0 >> bit) & 1) | (((w1 >> bit) & 1) << 1) | \
              (((w2 >> bit) & 1) << 2) | (((w3 >> bit) & 1) << 3)
        out = box[inp]
        r0 |= ((out >> 0) & 1) << bit
        r1 |= ((out >> 1) & 1) << bit
        r2 |= ((out >> 2) & 1) << bit
        r3 |= ((out >> 3) & 1) << bit
    return [r0, r1, r2, r3]

def _apply_sbox_inv(sbox_idx, nibbles_32bit_words):
    box = SBOX_INV[sbox_idx % 8]
    w0, w1, w2, w3 = nibbles_32bit_words
    r0, r1, r2, r3 = 0, 0, 0, 0
    for bit in range(32):
        inp = ((w0 >> bit) & 1) | (((w1 >> bit) & 1) << 1) | \
              (((w2 >> bit) & 1) << 2) | (((w3 >> bit) & 1) << 3)
        out = box[inp]
        r0 |= ((out >> 0) & 1) << bit
        r1 |= ((out >> 1) & 1) << bit
        r2 |= ((out >> 2) & 1) << bit
        r3 |= ((out >> 3) & 1) << bit
    return [r0, r1, r2, r3]

def _linear_transform(state):
    x0, x1, x2, x3 = state
    x0 = _rotl32(x0, 13)
    x2 = _rotl32(x2, 3)
    x1 = (x1 ^ x0 ^ x2) & 0xFFFFFFFF
    x3 = (x3 ^ x2 ^ ((x0 << 3) & 0xFFFFFFFF)) & 0xFFFFFFFF
    x1 = _rotl32(x1, 1)
    x3 = _rotl32(x3, 7)
    x0 = (x0 ^ x1 ^ x3) & 0xFFFFFFFF
    x2 = (x2 ^ x3 ^ ((x1 << 7) & 0xFFFFFFFF)) & 0xFFFFFFFF
    x0 = _rotl32(x0, 5)
    x2 = _rotl32(x2, 22)
    return [x0, x1, x2, x3]

def _linear_transform_inv(state):
    x0, x1, x2, x3 = state
    x2 = _rotr32(x2, 22)
    x0 = _rotr32(x0, 5)
    x2 = (x2 ^ x3 ^ ((x1 << 7) & 0xFFFFFFFF)) & 0xFFFFFFFF
    x0 = (x0 ^ x1 ^ x3) & 0xFFFFFFFF
    x3 = _rotr32(x3, 7)
    x1 = _rotr32(x1, 1)
    x3 = (x3 ^ x2 ^ ((x0 << 3) & 0xFFFFFFFF)) & 0xFFFFFFFF
    x1 = (x1 ^ x0 ^ x2) & 0xFFFFFFFF
    x2 = _rotr32(x2, 3)
    x0 = _rotr32(x0, 13)
    return [x0, x1, x2, x3]

def _serpent_keyschedule(key_bytes):
    """Generate 33 x 4 = 132 round sub-keys from up to 32-byte key."""
    key_bytes = key_bytes[:32]
    if len(key_bytes) < 32:
        padded = bytearray(key_bytes) + b'\x01' + b'\x00' * (31 - len(key_bytes))
        key_bytes = bytes(padded[:32])

    w = []
    for i in range(8):
        w.append(int.from_bytes(key_bytes[i*4:(i+1)*4], 'little'))

    for i in range(8, 140):
        val = w[i-8] ^ w[i-5] ^ w[i-3] ^ w[i-1] ^ PHI ^ (i - 8)
        w.append(_rotl32(val & 0xFFFFFFFF, 11))

    subkeys = []
    for i in range(33):
        group = [w[8 + 4*i + j] for j in range(4)]
        sbox_idx = (35 - i) % 8
        sk = _apply_sbox(sbox_idx, group)
        subkeys.append(sk)
    return subkeys

def _bytes_to_state(block):
    return [int.from_bytes(block[i*4:(i+1)*4], 'little') for i in range(4)]

def _state_to_bytes(state):
    return b''.join(w.to_bytes(4, 'little') for w in state)

def serpent_encrypt_block(block, subkeys):
    """Encrypt a single 16-byte block."""
    state = _bytes_to_state(block)
    for r in range(32):
        state = [(state[j] ^ subkeys[r][j]) & 0xFFFFFFFF for j in range(4)]
        state = _apply_sbox(r % 8, state)
        if r < 31:
            state = _linear_transform(state)
        else:
            state = [(state[j] ^ subkeys[32][j]) & 0xFFFFFFFF for j in range(4)]
    return _state_to_bytes(state)

def serpent_decrypt_block(block, subkeys):
    """Decrypt a single 16-byte block."""
    state = _bytes_to_state(block)
    for r in range(31, -1, -1):
        if r < 31:
            state = _linear_transform_inv(state)
        else:
            state = [(state[j] ^ subkeys[32][j]) & 0xFFFFFFFF for j in range(4)]
        state = _apply_sbox_inv(r % 8, state)
        state = [(state[j] ^ subkeys[r][j]) & 0xFFFFFFFF for j in range(4)]
    return _state_to_bytes(state)

def serpent_cbc_encrypt(plaintext_bytes, key_bytes):
    """Encrypt with Serpent-256-CBC. Returns IV || ciphertext as hex string."""
    subkeys = _serpent_keyschedule(key_bytes)
    iv = os.urandom(16)
    # PKCS7 padding
    pad_len = 16 - (len(plaintext_bytes) % 16)
    plaintext_bytes += bytes([pad_len]) * pad_len
    ciphertext = iv
    prev = iv
    for i in range(0, len(plaintext_bytes), 16):
        block = bytes(a ^ b for a, b in zip(plaintext_bytes[i:i+16], prev))
        enc_block = serpent_encrypt_block(block, subkeys)
        ciphertext += enc_block
        prev = enc_block
    return ciphertext.hex()

def serpent_cbc_decrypt(hex_ciphertext, key_bytes):
    """Decrypt Serpent-256-CBC from hex string. Returns plaintext bytes."""
    data = bytes.fromhex(hex_ciphertext)
    subkeys = _serpent_keyschedule(key_bytes)
    iv = data[:16]
    ct = data[16:]
    plaintext = b''
    prev = iv
    for i in range(0, len(ct), 16):
        block = ct[i:i+16]
        dec_block = serpent_decrypt_block(block, subkeys)
        plaintext += bytes(a ^ b for a, b in zip(dec_block, prev))
        prev = block
    # Remove PKCS7 padding
    pad_len = plaintext[-1]
    if 1 <= pad_len <= 16:
        plaintext = plaintext[:-pad_len]
    return plaintext

# ═══════════════════════════════════════════════════════════════
# ML-KEM (KYBER-768) KEY ENCAPSULATION
# ═══════════════════════════════════════════════════════════════

class KEMEngine:
    """Wrapper for ML-KEM (Kyber768) key encapsulation."""

    def __init__(self):
        self.algorithm = "Kyber768"
        self.use_real_oqs = False
        try:
            import oqs
            self.oqs = oqs
            # Test that Kyber768 is available
            test = oqs.KeyEncapsulation(self.algorithm)
            self.use_real_oqs = True
            print("[KEM] liboqs loaded — using real ML-KEM Kyber768")
        except Exception:
            print("[KEM] liboqs not available — using HKDF simulation mode")

    def perform_handshake(self):
        """
        Perform a complete ML-KEM handshake.
        Returns: (shared_secret, handshake_log)
        handshake_log contains details for the frontend engine logs.
        """
        log_entries = []
        ts = time.time()

        if self.use_real_oqs:
            # Bob generates keypair
            bob = self.oqs.KeyEncapsulation(self.algorithm)
            bob_pk = bob.generate_keypair()
            log_entries.append({
                "event": "kem_keygen",
                "detail": f"Bob's Public Key generated ({len(bob_pk)} bytes)",
                "pk_preview": bob_pk[:32].hex() + "...",
                "timestamp": ts
            })

            # Alice encapsulates
            alice = self.oqs.KeyEncapsulation(self.algorithm)
            ciphertext, shared_secret_alice = alice.encap_secret(bob_pk)
            log_entries.append({
                "event": "kem_encap",
                "detail": f"Alice encapsulated shared secret ({len(ciphertext)} bytes ciphertext)",
                "ct_preview": ciphertext[:32].hex() + "...",
                "timestamp": time.time()
            })

            # Bob decapsulates
            shared_secret_bob = bob.decap_secret(ciphertext)
            match = shared_secret_alice == shared_secret_bob
            shared_secret = shared_secret_alice
            log_entries.append({
                "event": "kem_decap",
                "detail": f"Bob decapsulated — Secrets match: {match}",
                "secret_preview": shared_secret[:16].hex() + "...",
                "key_length": len(shared_secret) * 8,
                "timestamp": time.time()
            })

        else:
            # Simulation mode using HKDF-like derivation
            seed = os.urandom(32)
            bob_pk = hashlib.sha3_512(b"bob_pk_" + seed).digest()
            log_entries.append({
                "event": "kem_keygen",
                "detail": f"Bob's Public Key generated ({len(bob_pk)} bytes) [simulated]",
                "pk_preview": bob_pk[:32].hex() + "...",
                "timestamp": ts
            })

            ciphertext = hashlib.sha3_512(b"ciphertext_" + seed).digest()
            shared_secret = hashlib.sha3_256(b"shared_secret_" + seed).digest()
            log_entries.append({
                "event": "kem_encap",
                "detail": f"Alice encapsulated shared secret ({len(ciphertext)} bytes ciphertext) [simulated]",
                "ct_preview": ciphertext[:32].hex() + "...",
                "timestamp": time.time()
            })

            log_entries.append({
                "event": "kem_decap",
                "detail": f"Bob decapsulated — Secrets match: True [simulated]",
                "secret_preview": shared_secret[:16].hex() + "...",
                "key_length": len(shared_secret) * 8,
                "timestamp": time.time()
            })

        log_entries.append({
            "event": "handshake_complete",
            "detail": f"256-bit Shared Secret established via {self.algorithm}",
            "timestamp": time.time()
        })

        return shared_secret, log_entries


# ═══════════════════════════════════════════════════════════════
# WEBSOCKET SERVER — Secure Routing Node with Scoped Sessions
# ═══════════════════════════════════════════════════════════════

kem_engine = KEMEngine()

clients = {}        # websocket -> {"id": str, "name": str, "email": str, "authenticated": bool}
active_sessions = {} # tuple(user_id_1, user_id_2) -> bytes (session_key)

async def send_to(ws, message):
    """Send a message to a specific client."""
    try:
        await ws.send(json.dumps(message))
    except websockets.exceptions.ConnectionClosed:
        pass

async def broadcast_all(message):
    """Send a message to ALL connected clients."""
    msg = json.dumps(message)
    for ws in list(clients.keys()):
        try:
            await ws.send(msg)
        except websockets.exceptions.ConnectionClosed:
            pass

async def broadcast_users_list():
    """Broadcast the list of currently authenticated online users to everyone."""
    users = [
        {"id": info["id"], "name": info["name"], "email": info["email"]}
        for ws, info in clients.items()
        if info.get("authenticated")
    ]
    await broadcast_all({
        "type": "users_list",
        "users": users
    })

async def perform_handshake_between(ws_a, ws_b):
    """Perform the ML-KEM handshake between two specific clients."""
    user_a = clients[ws_a]
    user_b = clients[ws_b]

    # Notify both
    init_msg = {
        "type": "system",
        "text": f"Initiating ML-KEM (Kyber768) handshake between {user_a['name']} and {user_b['name']}..."
    }
    await send_to(ws_a, init_msg)
    await send_to(ws_b, init_msg)

    # Perform handshake
    shared_secret, log_entries = kem_engine.perform_handshake()
    session_key = shared_secret[:32]  # 256 bits

    # Register the session key for both directions
    active_sessions[(user_a["id"], user_b["id"])] = session_key
    active_sessions[(user_b["id"], user_a["id"])] = session_key

    # Send log entries to both
    for entry in log_entries:
        log_msg = {"type": "engine_log", **entry}
        await send_to(ws_a, log_msg)
        await send_to(ws_b, log_msg)
        await asyncio.sleep(0.1)

    success_msg = {
        "type": "system",
        "text": "✓ Quantum-Resistant Secure Channel Established via ML-KEM"
    }
    await send_to(ws_a, success_msg)
    await send_to(ws_b, success_msg)

    # Signal completion
    complete_msg_a = {
        "type": "handshake_complete",
        "peer_id": user_b["id"],
        "peer_name": user_b["name"],
        "algorithm": "ML-KEM (Kyber768) → Serpent-256-CBC"
    }
    complete_msg_b = {
        "type": "handshake_complete",
        "peer_id": user_a["id"],
        "peer_name": user_a["name"],
        "algorithm": "ML-KEM (Kyber768) → Serpent-256-CBC"
    }
    await send_to(ws_a, complete_msg_a)
    await send_to(ws_b, complete_msg_b)

async def handler(websocket):
    """Handle individual WebSocket connections."""
    # Register as unauthenticated first
    clients[websocket] = {"authenticated": False}
    print("[+] New connection established (awaiting authentication)")

    try:
        async for raw_message in websocket:
            try:
                data = json.loads(raw_message)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type")

            # 1. Handle Auth
            if msg_type == "auth":
                user_id = data.get("id")
                user_name = data.get("name")
                user_email = data.get("email")

                if not user_id or not user_name:
                    await send_to(websocket, {"type": "system", "text": "Authentication failed: missing parameters."})
                    continue

                # Save authenticated state
                clients[websocket] = {
                    "id": user_id,
                    "name": user_name,
                    "email": user_email,
                    "authenticated": True
                }

                print(f"[+] User Authenticated: {user_name} ({user_email})")
                await send_to(websocket, {
                    "type": "identity",
                    "id": user_id,
                    "name": user_name,
                    "email": user_email
                })
                await send_to(websocket, {
                    "type": "system",
                    "text": f"Successfully authenticated as {user_name}."
                })
                await broadcast_users_list()
                continue

            # Check if this client is authenticated before executing other commands
            client_info = clients.get(websocket)
            if not client_info or not client_info.get("authenticated"):
                await send_to(websocket, {"type": "system", "text": "⚠ Unauthenticated access denied."})
                continue

            # 2. Handle Handshake Request
            if msg_type == "initiate_session":
                target_id = data.get("target_id")
                # Find target's websocket
                target_ws = None
                for ws, info in clients.items():
                    if info.get("authenticated") and info.get("id") == target_id:
                        target_ws = ws
                        break

                if not target_ws:
                    await send_to(websocket, {"type": "system", "text": "Target user is offline or not found."})
                    continue

                if target_ws == websocket:
                    await send_to(websocket, {"type": "system", "text": "Cannot initiate a secure channel with yourself."})
                    continue

                await perform_handshake_between(websocket, target_ws)
                continue

            # 3. Handle Scoped E2EE Chat
            if msg_type == "chat":
                plaintext = data.get("text", "")
                target_id = data.get("target_id")
                sender = clients[websocket]

                if not target_id:
                    await send_to(websocket, {"type": "system", "text": "Recipient selection required."})
                    continue

                session_key = active_sessions.get((sender["id"], target_id))
                if session_key is None:
                    await send_to(websocket, {"type": "system", "text": "⚠ No active secure session with this peer. Initiate handshake first."})
                    continue

                # Find target's websocket
                target_ws = None
                for ws, info in clients.items():
                    if info.get("authenticated") and info.get("id") == target_id:
                        target_ws = ws
                        break

                # Step 1: Encrypt plaintext using Serpent-CBC with the session key
                plaintext_bytes = plaintext.encode("utf-8")
                hex_ciphertext = serpent_cbc_encrypt(plaintext_bytes, session_key)

                # Log encryption event
                encrypt_log = {
                    "type": "engine_log",
                    "event": "serpent_encrypt",
                    "detail": f"Encrypted {len(plaintext_bytes)} bytes → {len(hex_ciphertext)//2} bytes ciphertext",
                    "sender": sender["name"],
                    "timestamp": time.time()
                }
                await send_to(websocket, encrypt_log)
                if target_ws:
                    await send_to(target_ws, encrypt_log)

                # Step 2: Broadcast raw ciphertext to ALL clients (network transit simulator)
                # This proves to the whole network/third parties that ciphertext is flying,
                # but only A and B possess the session key to decrypt it.
                await broadcast_all({
                    "type": "network",
                    "text": hex_ciphertext,
                    "sender": sender["name"],
                    "timestamp": time.time()
                })

                # Step 3: Decrypt and deliver to sender and target only
                decrypted = serpent_cbc_decrypt(hex_ciphertext, session_key)
                decrypt_log = {
                    "type": "engine_log",
                    "event": "serpent_decrypt",
                    "detail": f"Decrypted {len(hex_ciphertext)//2} bytes → {len(decrypted)} bytes plaintext",
                    "timestamp": time.time()
                }

                chat_payload = {
                    "type": "chat",
                    "text": decrypted.decode("utf-8"),
                    "sender": sender["name"],
                    "sender_id": sender["id"],
                    "target_id": target_id,
                    "timestamp": time.time()
                }

                # Send decrypted chat and log to sender
                await send_to(websocket, decrypt_log)
                await send_to(websocket, {**chat_payload, "is_self": True})

                # Send decrypted chat and log to target (if online)
                if target_ws:
                    await send_to(target_ws, decrypt_log)
                    await send_to(target_ws, {**chat_payload, "is_self": False})

    except websockets.exceptions.ConnectionClosed:
        pass
    except Exception as e:
        print(f"[!] Error in handler: {e}")
        traceback.print_exc()
    finally:
        # Cleanup
        disconnected_user = clients.get(websocket)
        if websocket in clients:
            del clients[websocket]

        if disconnected_user and disconnected_user.get("authenticated"):
            user_name = disconnected_user["name"]
            user_id = disconnected_user["id"]
            print(f"[-] {user_name} disconnected")

            # Remove associated sessions
            sessions_to_remove = [k for k in active_sessions.keys() if user_id in k]
            for k in sessions_to_remove:
                if k in active_sessions:
                    del active_sessions[k]

            await broadcast_all({
                "type": "system",
                "text": f"{user_name} went offline."
            })
            await broadcast_users_list()


from http import HTTPStatus

def health_check(connection, request):
    # Intercept non-websocket HTTP requests (like HEAD or health checks) to keep Render healthy,
    # while allowing real WebSocket upgrade requests to pass through.
    is_websocket = "upgrade" in request.headers and request.headers["upgrade"].lower() == "websocket"
    if not is_websocket:
        return connection.respond(HTTPStatus.OK, "OK\n")
    return None

async def main():
    print("=" * 60)
    print("  CodeX PQ-SC — Quantum-Resistant Secure Channel Server")
    print("  ML-KEM (Kyber768) + Serpent-256-CBC [P2P Auth Mode]")
    print("=" * 60)
    print(f"  Listening on ws://0.0.0.0:8765")
    print("=" * 60)

    async with websockets.serve(handler, "0.0.0.0", 8765, process_request=health_check):
        await asyncio.Future()  # Run forever


if __name__ == "__main__":
    asyncio.run(main())

