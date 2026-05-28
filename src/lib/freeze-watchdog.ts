// Freeze watchdog: durable diagnostics for hard main-thread locks.
//
// A *total* freeze — the kind where you can't even open DevTools — is a
// synchronous infinite loop or a runaway re-render. Nothing running in the page
// can profile a frozen thread live, so this module takes two complementary
// angles:
//
//   1. A render-loop circuit breaker (`useRenderLoopGuard`). If a component
//      re-renders pathologically often in a short window it records a
//      diagnostic and *throws*, converting a frozen tab into a catchable error
//      that the nearest ErrorBoundary surfaces — with the offending component
//      named. This catches the async setState/effect feedback loops that
//      React's own "maximum update depth" guard does NOT (those never nest, so
//      React lets them run forever).
//
//   2. A heartbeat + breadcrumb trail persisted to sessionStorage. When the
//      main thread locks the heartbeat stops advancing, so on the next load the
//      last value tells us roughly WHEN it froze and WHAT was happening. These
//      writes survive the tab being closed, which is the whole point.
//
// Everything here is best-effort and defensive: diagnostics must never throw on
// their own (except the deliberate circuit-breaker throw) or add meaningful
// cost to the hot path.

import { useRef } from 'react'

const BREADCRUMB_KEY = 'hermes:freeze:breadcrumbs'
const HEARTBEAT_KEY = 'hermes:freeze:heartbeat'
const LOOP_KEY = 'hermes:freeze:render-loop'
const LONGTASK_KEY = 'hermes:freeze:longtask'

const MAX_CRUMBS = 40
const crumbs: Array<string> = []
let lastTag = 'init'

function safeSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // storage full / unavailable — diagnostics are best-effort
  }
}

function flushCrumbs(): void {
  safeSet(BREADCRUMB_KEY, crumbs.join('\n'))
}

/**
 * Record a coarse lifecycle breadcrumb. Cheap, but intended for low-frequency
 * transitions (session change, send, stream start/stop, SSE connect) — NOT the
 * per-render hot path.
 */
export function mark(tag: string, info?: string): void {
  lastTag = info ? `${tag} ${info}` : tag
  crumbs.push(`${new Date().toISOString()} ${lastTag}`)
  if (crumbs.length > MAX_CRUMBS) crumbs.splice(0, crumbs.length - MAX_CRUMBS)
  flushCrumbs()
}

let watchdogStarted = false

/**
 * Start the heartbeat + long-task observer. Idempotent; call once at startup.
 */
export function startFreezeWatchdog(): void {
  if (watchdogStarted || typeof window === 'undefined') return
  watchdogStarted = true

  // Heartbeat: if the main thread locks this stops updating. The last value
  // pins down roughly when it froze and what was happening (lastTag).
  const beat = () => {
    safeSet(
      HEARTBEAT_KEY,
      JSON.stringify({ at: new Date().toISOString(), lastTag }),
    )
  }
  beat()
  window.setInterval(beat, 1000)

  // Long tasks (>200ms) block the thread. A very long one right before a freeze
  // is a strong lead. A truly infinite task never completes (so never reports),
  // but near-infinite synchronous compute surfaces here.
  try {
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration < 200) continue
          safeSet(
            LONGTASK_KEY,
            JSON.stringify({
              at: new Date().toISOString(),
              duration: Math.round(entry.duration),
              lastTag,
            }),
          )
        }
      })
      observer.observe({ entryTypes: ['longtask'] })
    }
  } catch {
    // longtask entry type unsupported (e.g. Safari) — skip
  }

  // Flush breadcrumbs on the way out so a close/reload preserves the trail.
  const flushOnExit = () => flushCrumbs()
  window.addEventListener('pagehide', flushOnExit)
  window.addEventListener('visibilitychange', flushOnExit)
}

function recordRenderLoop(payload: Record<string, unknown>): void {
  safeSet(
    LOOP_KEY,
    JSON.stringify({ at: new Date().toISOString(), lastTag, ...payload }),
  )
  flushCrumbs()
}

/**
 * Circuit breaker for runaway re-render loops. Call at the top of a component
 * (before any early return) so the hook order stays stable.
 *
 * If the component re-renders more than `max` times within `windowMs`, it
 * records a diagnostic and throws — turning a frozen tab into a catchable error
 * (the nearest ErrorBoundary shows it) that names the offending component. The
 * default of 250 renders/second is far above any legitimate UI (smooth
 * streaming is well under ~120/s) but trips within ~1s of a real loop starting.
 */
export function useRenderLoopGuard(
  componentName: string,
  options?: { windowMs?: number; max?: number },
): void {
  const windowMs = options?.windowMs ?? 1000
  const max = options?.max ?? 250
  const state = useRef({ windowStart: 0, count: 0 })

  const now = Date.now()
  const s = state.current
  if (now - s.windowStart > windowMs) {
    s.windowStart = now
    s.count = 0
  }
  s.count += 1

  if (s.count > max) {
    const diagnostic = { component: componentName, renders: s.count, windowMs }
    recordRenderLoop(diagnostic)
    // Reset so the post-throw remount doesn't instantly re-trip on this window.
    s.count = 0
    s.windowStart = now
    throw new Error(
      `[freeze-watchdog] Render loop: <${componentName}> re-rendered ` +
        `${diagnostic.renders}× in ${windowMs}ms — almost certainly a ` +
        `setState/effect feedback loop. Diagnostics saved to ` +
        `sessionStorage['${LOOP_KEY}'] and ['${BREADCRUMB_KEY}'].`,
    )
  }
}

export type FreezeReport = {
  heartbeat: unknown
  renderLoop: unknown
  longTask: unknown
  breadcrumbs: string
}

/**
 * On startup, surface any diagnostics saved before a prior freeze. Logs a
 * report to the console so it can be screenshotted/pasted. Returns the report
 * (or null if there's nothing to report) for programmatic use and tests.
 */
export function reportPriorFreeze(): FreezeReport | null {
  if (typeof window === 'undefined') return null

  let heartbeat: unknown = null
  let renderLoop: unknown = null
  let longTask: unknown = null
  let breadcrumbs = ''
  try {
    heartbeat = JSON.parse(sessionStorage.getItem(HEARTBEAT_KEY) || 'null')
    renderLoop = JSON.parse(sessionStorage.getItem(LOOP_KEY) || 'null')
    longTask = JSON.parse(sessionStorage.getItem(LONGTASK_KEY) || 'null')
    breadcrumbs = sessionStorage.getItem(BREADCRUMB_KEY) || ''
  } catch {
    return null
  }

  if (!heartbeat && !renderLoop && !longTask && !breadcrumbs) return null

  const report: FreezeReport = { heartbeat, renderLoop, longTask, breadcrumbs }
  console.warn(
    '%c[freeze-watchdog] Diagnostics captured before this load:',
    'color:#ef4444;font-weight:bold',
    report,
  )
  return report
}

/** Clear saved diagnostics once they've been read. */
export function clearFreezeDiagnostics(): void {
  if (typeof window === 'undefined') return
  for (const key of [BREADCRUMB_KEY, HEARTBEAT_KEY, LOOP_KEY, LONGTASK_KEY]) {
    try {
      sessionStorage.removeItem(key)
    } catch {
      // ignore
    }
  }
}
