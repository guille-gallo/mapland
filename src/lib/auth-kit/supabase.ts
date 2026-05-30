import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

/**
 * Create or retrieve the Supabase client singleton.
 *
 * In Vite projects, pass nothing — it reads VITE_SUPABASE_URL
 * and VITE_SUPABASE_ANON_KEY from import.meta.env automatically.
 *
 * In non-Vite contexts, pass the URL and anon key directly.
 */
export function getSupabaseClient(
  url?: string,
  anonKey?: string,
): SupabaseClient {
  if (_client) return _client

  const supabaseUrl =
    url ?? (typeof import.meta !== 'undefined' && (import.meta as Record<string, any>).env?.VITE_SUPABASE_URL)
  const supabaseAnonKey =
    anonKey ?? (typeof import.meta !== 'undefined' && (import.meta as Record<string, any>).env?.VITE_SUPABASE_ANON_KEY)

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env, or pass url and anonKey to getSupabaseClient().',
    )
  }

  _client = createClient(supabaseUrl, supabaseAnonKey)
  return _client
}

/**
 * Reset the cached client (useful for testing or hot-reload edge cases).
 */
export function resetSupabaseClient(): void {
  _client = null
}
