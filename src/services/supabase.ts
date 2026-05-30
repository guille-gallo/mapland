import { getSupabaseClient } from '../lib/auth-kit'

// Lazy singleton — getSupabaseClient() uses an internal cache that can be
// reset by useAuth when OAuth hash tokens need to be parsed. We use a getter
// so consumers always get the current (potentially re-created) client.
export const supabase = new Proxy({} as ReturnType<typeof getSupabaseClient>, {
  get(_target, prop, _receiver) {
    const client = getSupabaseClient()
    const value = (client as unknown as Record<string | symbol, unknown>)[prop]
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  },
})

export const isSupabaseConfigured = (): boolean => true