import { getSupabaseClient } from '../lib/auth-kit'

// Shared singleton from auth-kit — reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from env.
// AuthGate ensures the user is authenticated before any code that uses this runs.
export const supabase = getSupabaseClient()

export const isSupabaseConfigured = (): boolean => true