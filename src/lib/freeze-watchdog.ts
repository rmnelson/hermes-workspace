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
//      React's own "maximum update depth" guard does NOT.
//
//   2. A heartbeat + breadcrumb trail persisted to **localStorage**. When the
//      main thread locks the heartbeat stops advancing, so on the next load the
//      last value tells us roughly WHEN it froze and WHAT was happening.
//
// IMPORTANT: this uses localStorage, not sessionStorage. sessionStorage is
// wiped when a tab is *closed* — which is exactly what happens after a hard
// freeze — so it would lose the data we care about. localStorage survives a
// close (and a browser restart), which is the whole point.
//
// Multi-tab safety: every record is keyed by a per-tab id. A clean close/reload
// fires `pagehide` and erases that tab's records; a hard freeze prevents
// `pagehide`, so the records survive and get reported on the next load. Healthy
// tabs that are merely backgrounded are NOT reported (we check visibility +
// staleness), so we don't cry wolf on a tab that's simply idle.

import { useRef } from 'react'

const NS = 'hermes:freeze:'
const HEARTBEAT_MS = 1000
// A still-visible tab silent longer than this is treated as abandoned (froze).
const STALE_MS = 25_000
// Records older than this are pruned on next load regardless.
const PRUNE_MS = 30 * 60_000

let _tabId = ''
function tabId(): string {
  if (_tabId) return _tabId
  // Browser runtime — Date.now()/Math.random() are available here.
  _tabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return _tabId
}

/** localStorage key for a record kind, scoped to a tab. */
function key(kind: string, id: string = tabId()): string {
  return `${NS}${kind}:${id}`
}

function safeSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v)
  } catch {
    // storage full / unavailable — diagnostics are best-effort
  }
}
function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function safeRemove(k: string): void {
  try {
    localStorage.removeItem(k)
  } catch {
    // ignore
  }
}

const MAX_CRUMBS = 40
const crumbs: Array<string> = []
let lastTag = 'init'

// Running max of the largest payload rendered this session (set from the render
// path via render-size-guard). In-memory only — the heartbeat persists it, so a
// freeze report shows the biggest thing we tried to render and where it came
// from. This is the Firefox-safe stand-in for a heap snapshot.
let maxPayloadBytes = 0
let maxPayloadLabel = ''

/** Record a rendered payload's size; keeps the session max for the heartbeat. */
export function notePayloadSize(label: string, bytes: number): void {
  if (bytes > maxPayloadBytes) {
    maxPayloadBytes = bytes
    maxPayloadLabel = label
  }
}

function flushCrumbs(): void {
  safeSet(key('bc'), crumbs.join('\n'))
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

function clearOwnRecords(): void {
  for (const kind of ['hb', 'bc', 'loop', 'lt']) safeRemove(key(kind))
}

let watchdogStarted = false

/**
 * Start the heartbeat + long-task observer. Idempotent; call once at startup.
 */
export function startFreezeWatchdog(): void {
  if (watchdogStarted || typeof window === 'undefined') return
  watchdogStarted = true

  // Heartbeat: if the main thread locks this stops advancing. The last value
  // pins down roughly when it froze, what was happening (lastTag), where (url),
  // and whether the tab was actually visible (so a backgrounded healthy tab
  // isn't mistaken for a freeze).
  const beat = () => {
    // DOM node count is a cheap, Firefox-safe proxy for render bloat: a runaway
    // render (huge list / massive markdown) shows as this climbing in the last
    // heartbeats before a freeze. A flat count + large maxPayload points instead
    // at a single giant string/allocation.
    let domNodes = 0
    try {
      domNodes = document.getElementsByTagName('*').length
    } catch {
      // ignore
    }
    safeSet(
      key('hb'),
      JSON.stringify({
        at: new Date().toISOString(),
        ts: Date.now(),
        lastTag,
        url: location.pathname + location.search,
        visible: document.visibilityState === 'visible',
        domNodes,
        maxPayloadKB: Math.round(maxPayloadBytes / 1024),
        maxPayloadLabel,
      }),
    )
  }
  beat()
  window.setInterval(beat, HEARTBEAT_MS)

  // Long tasks (>200ms) block the thread. A very long one right before a freeze
  // is a strong lead. A truly infinite task never completes (so never reports),
  // but near-infinite synchronous compute surfaces here.
  try {
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration < 200) continue
          safeSet(
            key('lt'),
            JSON.stringify({
              at: new Date().toISOString(),
              ts: Date.now(),
              duration: Math.round(entry.duration),
              lastTag,
              url: location.pathname + location.search,
            }),
          )
        }
      })
      observer.observe({ entryTypes: ['longtask'] })
    }
  } catch {
    // longtask entry type unsupported (e.g. Safari) — skip
  }

  // Clean exit: a normal close/navigate/reload fires `pagehide`, and we erase
  // this tab's records so it isn't reported as a freeze. A hard freeze prevents
  // pagehide from running, so the records survive → reported on next load.
  window.addEventListener('pagehide', clearOwnRecords)
  // Keep breadcrumbs fresh when the tab is hidden (best effort; does NOT clear).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushCrumbs()
  })
}

function recordRenderLoop(payload: Record<string, unknown>): void {
  safeSet(
    key('loop'),
    JSON.stringify({
      at: new Date().toISOString(),
      ts: Date.now(),
      lastTag,
      url: typeof location !== 'undefined' ? location.pathname : '',
      ...payload,
    }),
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
        `setState/effect feedback loop. Diagnostics saved to localStorage ` +
        `under '${NS}'.`,
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
 * On startup, surface diagnostics left by a tab that stopped responding before
 * this load. Scans all per-tab records, skips this tab and tabs that exited
 * cleanly, and reports the most recent freeze candidate — a tab with a render
 * loop / long task recorded, or one whose heartbeat went stale while visible.
 * Logs a report to the console and returns it (or null) for tests.
 */
export function reportPriorFreeze(): FreezeReport | null {
  if (typeof window === 'undefined') return null

  const me = tabId()
  let keys: Array<string> = []
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)
      if (k && k.startsWith(NS)) keys.push(k)
    }
  } catch {
    return null
  }

  type TabRecord = {
    hb?: { ts?: number; visible?: boolean } & Record<string, unknown>
    bc?: string
    loop?: ({ ts?: number } & Record<string, unknown>) | null
    lt?: ({ ts?: number } & Record<string, unknown>) | null
  }
  const byTab = new Map<string, TabRecord>()
  for (const k of keys) {
    const rest = k.slice(NS.length) // "kind:id"
    const idx = rest.indexOf(':')
    if (idx < 0) continue
    const kind = rest.slice(0, idx)
    const id = rest.slice(idx + 1)
    if (!id || id === me) continue
    const entry = byTab.get(id) ?? {}
    const raw = safeGet(k)
    if (kind === 'bc') {
      entry.bc = raw ?? ''
    } else if (kind === 'hb' || kind === 'loop' || kind === 'lt') {
      try {
        ;(entry as Record<string, unknown>)[kind] = raw ? JSON.parse(raw) : null
      } catch {
        ;(entry as Record<string, unknown>)[kind] = null
      }
    }
    byTab.set(id, entry)
  }
  if (byTab.size === 0) return null

  const now = Date.now()
  let best: { id: string; entry: TabRecord; ts: number } | null = null

  for (const [id, entry] of byTab) {
    const ts = entry.loop?.ts ?? entry.lt?.ts ?? entry.hb?.ts ?? 0
    if (ts > 0 && now - ts > PRUNE_MS) {
      for (const kind of ['hb', 'bc', 'loop', 'lt']) safeRemove(key(kind, id))
      continue
    }
    const staleWhileVisible = Boolean(
      entry.hb?.ts && entry.hb.visible && now - entry.hb.ts > STALE_MS,
    )
    const isCandidate = Boolean(entry.loop) || Boolean(entry.lt) || staleWhileVisible
    if (isCandidate && (!best || ts > best.ts)) best = { id, entry, ts }
  }

  if (!best) return null

  // Consume it so it isn't re-reported on the next load.
  for (const kind of ['hb', 'bc', 'loop', 'lt']) safeRemove(key(kind, best.id))

  const report: FreezeReport = {
    heartbeat: best.entry.hb ?? null,
    renderLoop: best.entry.loop ?? null,
    longTask: best.entry.lt ?? null,
    breadcrumbs: best.entry.bc ?? '',
  }
  console.warn(
    '%c[freeze-watchdog] A tab stopped responding before this load:',
    'color:#ef4444;font-weight:bold',
    report,
  )
  return report
}

/** Clear this tab's saved diagnostics. */
export function clearFreezeDiagnostics(): void {
  if (typeof window === 'undefined') return
  clearOwnRecords()
}
