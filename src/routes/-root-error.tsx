import { recordReactError } from '@/lib/freeze-watchdog'

/**
 * Props passed by TanStack Router to a route's `errorComponent`. `info` carries
 * the React `componentStack` (the component that threw) — the key diagnostic for
 * intermittent crashes. Typed loosely/optionally so we don't couple to the exact
 * router version and so it stays trivially testable.
 */
export type RootErrorProps = {
  error: unknown
  info?: { componentStack?: string } | null
  reset?: () => void
}

/**
 * Router-level error fallback (the outermost boundary — catches errors that
 * escape the in-shell ErrorBoundary, i.e. crashes ABOVE the chat `<Outlet/>`:
 * WorkspaceShell, SearchModal, modals, etc.). Persists the error + componentStack
 * to the freeze-watchdog store so an unattended crash is recoverable hours later,
 * and shows the stack inline for copy/paste without DevTools.
 */
export function RootError({ error, info }: RootErrorProps) {
  const componentStack = info?.componentStack ?? undefined
  // Side effect during render is acceptable here: the error path renders once and
  // is not re-entered, and we must capture even if the tab locks before an effect
  // could flush. recordReactError is best-effort and never throws.
  recordReactError(error, componentStack)

  const message = error instanceof Error ? error.message : String(error)

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-primary-50">
      <h1 className="text-2xl font-semibold text-primary-900 mb-4">
        Something went wrong
      </h1>
      <pre className="p-4 bg-primary-100 rounded-lg text-sm text-primary-700 max-w-full overflow-auto mb-4">
        {message}
      </pre>
      {componentStack ? (
        <details className="mb-6 max-w-full text-left">
          <summary className="cursor-pointer text-xs text-primary-500">
            Component stack
          </summary>
          <pre className="mt-1 max-h-64 max-w-full overflow-auto rounded bg-primary-100 p-3 text-[11px] leading-snug text-primary-600">
            {componentStack.trim()}
          </pre>
        </details>
      ) : null}
      <button
        onClick={() => (window.location.href = '/')}
        className="px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
      >
        Return Home
      </button>
    </div>
  )
}
