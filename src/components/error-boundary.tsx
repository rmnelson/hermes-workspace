import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { recordReactError } from '@/lib/freeze-watchdog'

type ErrorBoundaryProps = {
  children: ReactNode
  className?: string
  title?: string
  description?: string
}

type ErrorBoundaryState = {
  error: Error | null
  componentStack: string | null
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    error: null,
    componentStack: null,
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled UI error', error, errorInfo)
    // Persist the error + componentStack to the freeze-watchdog store so it
    // survives a tab that later locks/closes and is surfaced from a sibling tab
    // on the next load. The componentStack names the component that threw — the
    // key clue for intermittent crashes (e.g. a motion usePresence hook
    // mismatch that only trips mid-stream).
    const componentStack = errorInfo.componentStack ?? null
    recordReactError(error, componentStack ?? undefined)
    this.setState({ componentStack })
  }

  reloadPage() {
    if (typeof window === 'undefined') return
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    const title = this.props.title ?? 'Something went wrong'
    const description =
      this.props.description ??
      'The chat encountered an unexpected issue. Reload to try again.'

    return (
      <div
        className={cn(
          'flex h-full min-h-0 items-center justify-center bg-primary-50 p-6',
          this.props.className,
        )}
      >
        <div className="w-full max-w-md rounded-xl border border-primary-200 bg-primary-100 p-6 text-center shadow-sm">
          <h2 className="text-balance text-xl font-medium text-primary-900">
            {title}
          </h2>
          <p className="mt-2 text-pretty text-sm text-primary-700">
            {description}
          </p>
          {this.state.error ? (
            <pre className="mt-3 max-h-32 overflow-auto rounded bg-red-50 p-2 text-left text-[10px] text-red-800">
              {this.state.error.message}
              {'\n'}
              {this.state.error.stack?.split('\n').slice(0, 5).join('\n')}
            </pre>
          ) : null}
          {this.state.componentStack ? (
            <details className="mt-2 text-left">
              <summary className="cursor-pointer text-[10px] text-primary-500">
                Component stack
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-primary-50 p-2 text-[10px] leading-snug text-primary-600">
                {this.state.componentStack.trim()}
              </pre>
            </details>
          ) : null}
          <div className="mt-5 flex justify-center">
            <Button onClick={() => this.reloadPage()}>Reload</Button>
          </div>
        </div>
      </div>
    )
  }
}
