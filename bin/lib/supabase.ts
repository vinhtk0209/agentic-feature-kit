/**
 * supabase.ts — Platform-level Supabase client shared by all bin/ modules.
 *
 * The anon key is public by design: Row-Level Security on the server prevents
 * it from reading any token data. It can only call RPC functions and insert
 * into telemetry tables.
 *
 * NOTE: .claude/integrations/telemetry.ts deliberately keeps its own copy of
 * these constants so it remains self-contained when shipped inside the
 * portable .claude/ folder without the bin/ directory.
 */

export const SUPABASE_URL = "https://vkuojxgvkxndftenrdno.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrdW9qeGd2a3huZGZ0ZW5yZG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MjgwMzMsImV4cCI6MjA5NzAwNDAzM30.MrTuIuN1kghxMXu0yyOW9MtmXVY7xH0-2HSCwTKo2cU";

export const RPC_HEADERS = {
  "Content-Type": "application/json",
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  // Avoids Windows libuv UV_HANDLE_CLOSING assert on process exit.
  Connection: "close",
};

export async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: RPC_HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`RPC ${fn} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}
