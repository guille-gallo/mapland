import type { ReactNode } from 'react'
import { useAuth, type UseAuthOptions } from './useAuth'

interface AuthScreenProps {
  error?: string | null
  onSignIn?: () => void
}

/**
 * Minimal sign-in screen with a single "Continue with Google" button.
 * Renders the error message if authentication fails.
 */
export function AuthScreen({ error, onSignIn }: AuthScreenProps) {
  return (
    <main className="shell center">
      <section className="card auth-card">
        <h1>Sign in</h1>
        <p>Sign in with Google to access this application.</p>
        <button type="button" className="primary-btn" onClick={onSignIn}>
          Continue with Google
        </button>
        {error && <p className="error-text">{error}</p>}
      </section>
    </main>
  )
}

// ── Shared UI pieces ─────────────────────────────────

const DefaultLoader = () => (
  <div
    style={{
      display: 'grid',
      placeItems: 'center',
      height: '100vh',
      fontSize: '1.25rem',
      color: '#888',
    }}
  >
    Loading…
  </div>
)

// ── ProtectedRoute ───────────────────────────────────

interface ProtectedRouteProps {
  children: ReactNode
  /** Component to render while loading the session */
  loader?: ReactNode
  /** Custom sign-in component (replaces the default AuthScreen) */
  signInScreen?: ReactNode
  /** Email allowlist — reads VITE_ALLOWED_EMAILS by default */
  allowedEmails?: string[]
}

/**
 * Route-level guard. Renders:
 *  1. Loader while auth is initializing
 *  2. Sign-in screen when unauthenticated
 *  3. Children when authenticated (and on allowlist)
 *
 * Usage:
 *   <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
 */
export function ProtectedRoute({
  children,
  loader,
  signInScreen,
  allowedEmails,
}: ProtectedRouteProps) {
  const { session, isLoading, authError, signInWithGoogle } = useAuth({ allowedEmails })

  if (isLoading) {
    return (loader as React.ReactElement) ?? <DefaultLoader />
  }

  if (!session) {
    return (signInScreen as React.ReactElement) ?? (
      <AuthScreen error={authError} onSignIn={signInWithGoogle} />
    )
  }

  return <>{children}</>
}

// ── AuthGate (whole-app wrapper) ──────────────────────

interface AuthGateProps {
  children: ReactNode
  /** Rendered while loading */
  loader?: ReactNode
  /** Email allowlist — reads VITE_ALLOWED_EMAILS by default */
  allowedEmails?: string[]
  /** Auth options forwarded to useAuth */
  authOptions?: UseAuthOptions
}

/**
 * App-level wrapper: shows the sign-in screen or children depending on auth.
 * Unlike ProtectedRoute, this manages the full auth lifecycle at the app root.
 *
 * Usage:
 *   <AuthGate>
 *     <App />
 *   </AuthGate>
 */
export function AuthGate({ children, loader, allowedEmails }: AuthGateProps) {
  const { session, isLoading, authError, signInWithGoogle } = useAuth({ allowedEmails })

  if (isLoading) {
    return (loader as React.ReactElement) ?? <DefaultLoader />
  }

  if (!session) {
    return <AuthScreen error={authError} onSignIn={signInWithGoogle} />
  }

  return <>{children}</>
}