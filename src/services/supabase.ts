import { getSupabaseClient } from '@guille/auth-kit'

// Shared singleton from auth-kit — reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
// AuthGate ensures the user is authenticated before any code that uses this runs.
export const supabase = getSupabaseClient()

export const isSupabaseConfigured = (): boolean => true