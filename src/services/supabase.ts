import { getSupabaseClient } from '@guille-gallo/auth-kit'

export const supabase = new Proxy({} as ReturnType<typeof getSupabaseClient>, {
  get(_target, prop) {
    const client = getSupabaseClient()
    const value = (client as unknown as Record<string | symbol, unknown>)[prop]
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  },
})

export const isSupabaseConfigured = (): boolean => true