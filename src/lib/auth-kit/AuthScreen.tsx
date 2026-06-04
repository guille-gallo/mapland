import type { ReactNode } from 'react'
import { useAuth, type UseAuthOptions } from './useAuth'
import './AuthScreen.css'

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
    <main className="auth-kit-shell">
      <section className="auth-kit-card">
        <h1>Sign in</h1>
        <p>Sign in with Google to access this application.</p>
        <button type="button" className="auth-kit-btn" onClick={onSignIn}>
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
        {error && <p className="auth-kit-error">{error}</p>}
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
