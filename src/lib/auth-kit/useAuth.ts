import { useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase'

// ── Helpers ──────────────────────────────────────────

function getOAuthErrorMessage(raw: string): string {
  const lower = raw.toLowerCase()
  if (
    lower.includes('unsupported provider') ||
    lower.includes('provider is not enabled') ||
    lower.includes('validation_failed')
  ) {
    return 'Google sign-in is not enabled in Supabase yet. Go to Authentication → Providers, enable Google, add client credentials, and save.'
  }
  return raw
}

function getUserDisplayName(user: User): string {
  const meta = user.user_metadata ?? {}
  const named = meta.full_name ?? meta.name ?? meta.preferred_username
  if (typeof named === 'string' && named.trim()) return named.trim()
  if (typeof user.email === 'string' && user.email.includes('@'))
    return user.email.split('@')[0]!
  return user.id.slice(0, 8)
}

function extractUrlAuthError(): string | null {
  const url = new URL(window.location.href)
  const desc = url.searchParams.get('error_description') ?? url.searchParams.get('error')
  if (!desc) return null
  url.searchParams.delete('error_description')
  url.searchParams.delete('error')
  window.history.replaceState({}, document.title, url.toString())
  return desc
}

function parseAllowedEmails(): string[] | null {
  const raw = (typeof import.meta !== 'undefined' && (import.meta as Record<string, any>).env?.VITE_ALLOWED_EMAILS) as string | undefined
  if (!raw) return null
  return raw
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function stripOAuthParams(): void {
  const url = new URL(window.location.href)
  let changed = false
  for (const key of [...url.searchParams.keys()]) {
    if (key === 'code') {
      url.searchParams.delete(key)
      changed = true
    }
  }
  if (url.hash.includes('access_token=') || url.hash.includes('error=')) {
    url.hash = ''
    changed = true
  }
  if (changed) {
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash)
  }
}

// ── Public types ─────────────────────────────────────

export interface UseAuthOptions {
  /**
   * Comma-separated allowlist of emails. If set, only these users can sign in.
   * Reads from VITE_ALLOWED_EMAILS env by default.
   * Pass an empty array [] to allow everyone.
   */
  allowedEmails?: string[]
}

export interface UseAuthReturn {
  session: Session | null
  user: User | null
  displayName: string
  isLoading: boolean
  authError: string | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

// ── Hook ──────────────────────────────────────────────

export function useAuth(options?: UseAuthOptions): UseAuthReturn {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  const allowList = useMemo(() => {
    if (options?.allowedEmails !== undefined) {
      return options.allowedEmails.map(normalizeEmail)
    }
    return parseAllowedEmails()
  }, [options?.allowedEmails])

  useEffect(() => {
    let mounted = true

    const urlError = extractUrlAuthError()
    if (urlError) setAuthError(urlError)

    const pendingOAuth =
      window.location.search.includes('code=') ||
      window.location.hash.includes('access_token=') ||
      window.location.hash.includes('error=')

    const client = getSupabaseClient()

    const { data: { subscription } } = client.auth.onAuthStateChange(async (_event, next) => {
      if (!mounted) return

      if (next?.user) {
        const email = normalizeEmail(next.user.email ?? '')
        if (allowList && !allowList.includes(email)) {
          await client.auth.signOut()
          setAuthError(`Access denied. ${email} is not authorized.`)
          setSession(null)
          setIsLoading(false)
          return
        }
        setSession(next)
        setAuthError(null)
        stripOAuthParams()
      } else {
        setSession(next)
        if (pendingOAuth) return
      }

      setIsLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [allowList])

  const signInWithGoogle = async () => {
    setAuthError(null)
    setIsLoading(true)
    const client = getSupabaseClient()
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      setAuthError(getOAuthErrorMessage(error.message))
      setIsLoading(false)
    }
  }

  const handleSignOut = async () => {
    const client = getSupabaseClient()
    const { error } = await client.auth.signOut()
    if (error) setAuthError(error.message)
  }

  return {
    session,
    user: session?.user ?? null,
    displayName: session?.user ? getUserDisplayName(session.user) : '',
    isLoading,
    authError,
    signInWithGoogle,
    signOut: handleSignOut,
  }
}