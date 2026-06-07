import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const isPlaceholder = 
  !supabaseUrl || 
  supabaseUrl.includes("your-supabase-project") || 
  !supabaseAnonKey || 
  supabaseAnonKey.includes("dummy");

export const isUsingMock = isPlaceholder;

// Real Supabase client (only created if valid configuration exists)
export const supabase = !isPlaceholder ? createClient(supabaseUrl, supabaseAnonKey) : null;

// Mock database for testing when credentials are not yet set
const mockUsers = [
  { email: "alice@cryptochat.pq", password: "password123", id: "user_alice_uid", name: "Alice Security" },
  { email: "bob@cryptochat.pq", password: "password123", id: "user_bob_uid", name: "Bob Cyber" },
  { email: "charlie@cryptochat.pq", password: "password123", id: "user_charlie_uid", name: "Charlie Admin" }
];

export const mockAuth = {
  signUp: async ({ email, password, options }) => {
    await new Promise(resolve => setTimeout(resolve, 800));
    const name = options?.data?.full_name || email.split("@")[0];
    const newUser = { email, password, id: `user_${Math.random().toString(36).substr(2, 9)}`, name };
    mockUsers.push(newUser);
    return { data: { user: newUser, session: { access_token: "mock_jwt_token" } }, error: null };
  },
  signInWithPassword: async ({ email, password }) => {
    await new Promise(resolve => setTimeout(resolve, 800));
    const found = mockUsers.find(u => u.email === email && u.password === password);
    if (found) {
      return { data: { user: found, session: { access_token: "mock_jwt_token" } }, error: null };
    }
    return { data: { user: null, session: null }, error: { message: "Invalid email or password. Hint: Use alice@cryptochat.pq / password123 or bob@cryptochat.pq / password123" } };
  },
  signOut: async () => {
    return { error: null };
  },
  getUser: async () => {
    return { data: { user: null } };
  }
};
