import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabaseClient, resetSupabaseClient } from './supabase'

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

  const allowList = (() => {
    if (options?.allowedEmails !== undefined) {
      return options.allowedEmails.map(normalizeEmail)
    }
    return parseAllowedEmails()
  })()

  useEffect(() => {
    let mounted = true

    const urlError = extractUrlAuthError()
    if (urlError) setAuthError(urlError)

    // If URL hash contains OAuth tokens, the singleton client may have been
    // created before the hash was available. Force a fresh session check.
    const hashHasTokens = window.location.hash.includes('access_token=')

    const load = async () => {
      // When hash tokens are present but getSession returns null,
      // reset the singleton so the next call parses the hash properly.
      if (hashHasTokens) {
        resetSupabaseClient()
      }
      const client = getSupabaseClient()
      const { data, error } = await client.auth.getSession()
      if (!mounted) return
      if (error) setAuthError(error.message)
      else if (data.session?.user) {
        const email = normalizeEmail(data.session.user.email ?? '')
        if (allowList && !allowList.includes(email)) {
          await client.auth.signOut()
          setAuthError(`Access denied. ${email} is not authorized.`)
          setSession(null)
        } else {
          setSession(data.session)
        }
        // Clean up the hash fragment from the URL
        if (window.location.hash.includes('access_token=')) {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
        }
      } else {
        setSession(null)
      }
      setIsLoading(false)
    }
    load()

    const client = getSupabaseClient()
    const { data: sub } = client.auth.onAuthStateChange(async (_event, next) => {
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
      }
      setSession(next)
      setIsLoading(false)
      setAuthError(null)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [allowList])

  const signInWithGoogle = async () => {
    setAuthError(null)
    const client = getSupabaseClient()
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) setAuthError(getOAuthErrorMessage(error.message))
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