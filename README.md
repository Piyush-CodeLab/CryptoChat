# CryptoChat PQ-SC — Post-Quantum Secure Channel

End-to-End Encrypted messaging with **ML-KEM (Kyber768)** handshake and **Serpent-256-CBC** cipher.

## Architecture

```
┌──────────────┐     WebSocket (ws://localhost:8765)     ┌──────────────┐
│  Client A    │ ◄──────────────────────────────────────►│  Client B    │
│  (Next.js)   │              ┌──────────┐               │  (Next.js)   │
│  Port 3000   │ ◄───────────►│  Python  │◄─────────────►│  Port 3000   │
└──────────────┘              │  Server  │               └──────────────┘
                              │  :8765   │
                              └──────────┘
                         ML-KEM + Serpent-CBC
```

## Quick Start

### 1. Backend (Python WebSocket Server)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install websockets
# Optional: pip install liboqs-python pyserpent
python server.py
```

> The server includes a built-in Serpent cipher implementation and falls back to simulated KEM if `liboqs` is not installed.

### 2. Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

### 3. Testing

1. Start the backend: `python backend/server.py`
2. Start the frontend: `cd frontend && npm run dev`
3. Open **two browser tabs** at `http://localhost:3000`
4. When both connect, the ML-KEM handshake triggers automatically
5. Send messages — watch them get encrypted/decrypted in the Engine Logs tab!

## Views

| View | Description |
|------|-------------|
| **Messages** | Instagram DM-style chat with E2E encryption |
| **Engine** | Real-time cryptographic event monitor |
| **Visualizer** | Interactive Serpent cipher round-function sandbox |

## Tech Stack

- **Frontend:** Next.js 15 (App Router), React, Tailwind CSS v4, Framer Motion, lucide-react
- **Backend:** Python 3.10+, `websockets`, `asyncio`
- **Crypto:** ML-KEM Kyber768 (via `liboqs-python`) + Serpent-256-CBC (built-in)
