import { getSupabaseClient } from '../lib/auth-kit'

// Re-export the Supabase client getter as a lazy accessor.
// Avoids creating the client at module import time, which prevents
// hash fragment OAuth tokens from being detected.
export const supabase = getSupabaseClient()

export const isSupabaseConfigured = (): boolean => true