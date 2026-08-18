/**
 * supabase.ts — Legacy backend RPC adapter shared by bin/ modules.
 *
 * Configuration is supplied explicitly at runtime. The pure shared-core
 * contract validates and redacts the pair before this adapter can fetch.
 */

import { resolveLegacyBackendConfig } from '../../packages/core/src/legacy-backend-config'

export interface RpcDependencies {
  env?: unknown
  fetch?: typeof globalThis.fetch
}

function requestHeaders(anonKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    // Avoids Windows libuv UV_HANDLE_CLOSING assert on process exit.
    Connection: 'close',
  }
}

export async function rpc<T>(
  fn: string,
  body: Record<string, unknown>,
  dependencies: RpcDependencies = {},
): Promise<T> {
  const config = resolveLegacyBackendConfig(dependencies.env ?? process.env)
  const fetchFn = dependencies.fetch ?? globalThis.fetch
  const res = await fetchFn(`${config.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: requestHeaders(config.anonKey),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`RPC ${fn} failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}
