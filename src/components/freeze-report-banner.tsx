import { Component } from 'react'
import {
  clearFreezeDiagnostics,
  getLastFreezeReport,
} from '@/lib/freeze-watchdog'

type State = {
  report: ReturnType<typeof getLastFreezeReport>
  dismissed: boolean
}

/**
 * Dismissible banner that surfaces the most recent freeze/crash diagnostic
 * captured by the freeze-watchdog — so an unattended tab lock is visible on the
 * next load WITHOUT opening DevTools. Reads the durable `last` report (idempotent),
 * shows the component stack (names the offending component) plus the heartbeat's
 * bloat signals (domNodes / maxPayloadKB — the OOM-vs-loop tell), and clears the
 * report on dismiss. Renders nothing when there's no prior freeze.
 *
 * Implemented as a class component on purpose: the test harness's React dedupe is
 * currently broken (deps.inline is deprecated/ignored), so function components
 * using hooks hit a null dispatcher under vitest. A class sidesteps that — same
 * pattern as ErrorBoundary.
 */
export class FreezeReportBanner extends Component<unknown, State> {
  state: State = {
    report: getLastFreezeReport(),
    dismissed: false,
  }

  handleDismiss = () => {
    clearFreezeDiagnostics()
    this.setState({ dismissed: true })
  }

  render() {
    const { report, dismissed } = this.state
    if (!report || dismissed) return null

    const hb = (report.heartbeat ?? null) as
      | (Record<string, unknown> & {
          lastTag?: string
          domNodes?: number
          maxPayloadKB?: number
          maxPayloadLabel?: string
        })
      | null
    const reactError = (report.reactError ?? null) as {
      message?: string
      componentStack?: string
    } | null
    const renderLoop = (report.renderLoop ?? null) as {
      component?: string
      renders?: number
    } | null

    return (
      <div
        role="alert"
        className="fixed inset-x-0 bottom-0 z-[9998] mx-auto max-w-3xl rounded-t-xl border border-b-0 border-red-300 bg-red-50 p-4 text-left text-sm text-red-900 shadow-lg dark:border-red-900/50 dark:bg-red-950/90 dark:text-red-100"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="font-semibold">
            A chat tab stopped responding earlier
          </div>
          <button
            type="button"
            onClick={this.handleDismiss}
            aria-label="Dismiss freeze report"
            className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-900/50"
          >
            Dismiss
          </button>
        </div>

        <div className="mt-2 space-y-1 text-xs">
          {hb?.lastTag ? (
            <div>
              <span className="opacity-70">Last activity:</span> {hb.lastTag}
            </div>
          ) : null}
          {hb ? (
            <div>
              <span className="opacity-70">At freeze:</span>{' '}
              {typeof hb.domNodes === 'number'
                ? `${hb.domNodes} DOM nodes`
                : '—'}
              {typeof hb.maxPayloadKB === 'number'
                ? `, peak payload ${hb.maxPayloadKB}KB${hb.maxPayloadLabel ? ` (${hb.maxPayloadLabel})` : ''}`
                : ''}
            </div>
          ) : null}
          {renderLoop?.component ? (
            <div>
              <span className="opacity-70">Render loop in:</span>{' '}
              {renderLoop.component}
              {typeof renderLoop.renders === 'number'
                ? ` (${renderLoop.renders} renders)`
                : ''}
            </div>
          ) : null}
          {reactError?.message ? (
            <div className="font-mono text-red-700 dark:text-red-300">
              {reactError.message}
            </div>
          ) : null}
        </div>

        {reactError?.componentStack ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs opacity-80">
              Component stack
            </summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-red-100/60 p-2 text-[11px] leading-snug dark:bg-red-900/40">
              {reactError.componentStack.trim()}
            </pre>
          </details>
        ) : null}

        {report.breadcrumbs ? (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs opacity-80">
              Breadcrumbs
            </summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-red-100/60 p-2 text-[11px] leading-snug dark:bg-red-900/40">
              {report.breadcrumbs}
            </pre>
          </details>
        ) : null}
      </div>
    )
  }
}
