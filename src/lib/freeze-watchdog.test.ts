// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  clearFreezeDiagnostics,
  mark,
  recordReactError,
  reportPriorFreeze,
} from './freeze-watchdog'

const NS = 'hermes:freeze:'

function findBreadcrumbKey(): string | null {
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i)
    if (k && k.startsWith(`${NS}bc:`)) return k
  }
  return null
}

describe('freeze-watchdog breadcrumbs', () => {
  beforeEach(() => {
    localStorage.clear()
    clearFreezeDiagnostics()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('persists breadcrumbs to localStorage synchronously', () => {
    mark('chat', 'session=abc waiting=true')
    const k = findBreadcrumbKey()
    expect(k).not.toBeNull()
    expect(localStorage.getItem(k!)).toContain('chat session=abc waiting=true')
  })

  it('keeps the breadcrumb buffer bounded', () => {
    for (let i = 0; i < 100; i += 1) mark('tick', String(i))
    const stored = localStorage.getItem(findBreadcrumbKey()!) ?? ''
    const lines = stored.split('\n').filter(Boolean)
    expect(lines.length).toBeLessThanOrEqual(40)
    expect(stored).toContain('tick 99')
    expect(stored).not.toContain('tick 0\n')
  })

  it('reports nothing when there is no prior-freeze data', () => {
    expect(reportPriorFreeze()).toBeNull()
  })

  it('does NOT report this tab’s own breadcrumbs as a prior freeze', () => {
    // Current-tab breadcrumbs are not a "prior" freeze of another tab.
    mark('chat', 'session=current')
    expect(reportPriorFreeze()).toBeNull()
  })

  it('surfaces a stale-while-visible heartbeat from another tab', () => {
    const staleTs = Date.now() - 60_000 // 60s ago, well past STALE_MS
    localStorage.setItem(
      `${NS}hb:othertab`,
      JSON.stringify({
        at: 'past',
        ts: staleTs,
        lastTag: 'chat session=frozen streaming=true',
        url: '/chat/frozen',
        visible: true,
      }),
    )
    localStorage.setItem(`${NS}bc:othertab`, 'past chat session=frozen')

    const report = reportPriorFreeze()
    expect(report).not.toBeNull()
    expect((report?.heartbeat as { lastTag?: string })?.lastTag).toContain(
      'frozen',
    )
    expect(report?.breadcrumbs).toContain('frozen')
    // Consumed — a second call should not re-report it.
    expect(reportPriorFreeze()).toBeNull()
  })

  it('reports a render-loop record from another tab regardless of staleness', () => {
    localStorage.setItem(
      `${NS}loop:othertab`,
      JSON.stringify({
        at: 'past',
        ts: Date.now(),
        component: 'ChatMessageList',
        renders: 312,
        windowMs: 1000,
      }),
    )
    const report = reportPriorFreeze()
    expect((report?.renderLoop as { component?: string })?.component).toBe(
      'ChatMessageList',
    )
  })

  it('ignores a recent (still-alive) heartbeat from another tab', () => {
    localStorage.setItem(
      `${NS}hb:livetab`,
      JSON.stringify({
        at: 'now',
        ts: Date.now(), // fresh — tab is alive
        lastTag: 'chat',
        url: '/chat/live',
        visible: true,
      }),
    )
    expect(reportPriorFreeze()).toBeNull()
  })

  it('ignores a stale heartbeat from a backgrounded (not visible) tab', () => {
    localStorage.setItem(
      `${NS}hb:bgtab`,
      JSON.stringify({
        at: 'past',
        ts: Date.now() - 60_000,
        lastTag: 'chat',
        url: '/chat/bg',
        visible: false, // was hidden — throttled, not frozen
      }),
    )
    expect(reportPriorFreeze()).toBeNull()
  })

  it('clears this tab’s diagnostics', () => {
    mark('chat', 'session=abc')
    clearFreezeDiagnostics()
    expect(findBreadcrumbKey()).toBeNull()
  })

  // Load-time freeze: a tab that locks during initial mount/hydration dies
  // before the heartbeat's first beat, so it has breadcrumbs but NO hb record.
  // Previously invisible to the reporter; now flagged via the breadcrumb time.
  it('reports a tab that froze before its first heartbeat (bc, no hb)', () => {
    const staleIso = new Date(Date.now() - 60_000).toISOString()
    localStorage.setItem(
      `${NS}bc:loadfrozen`,
      `${staleIso} chat-mount session=load-test`,
    )
    const report = reportPriorFreeze()
    expect(report).not.toBeNull()
    expect(report?.heartbeat).toBeNull()
    expect(report?.breadcrumbs).toContain('load-test')
    // Consumed — not re-reported.
    expect(reportPriorFreeze()).toBeNull()
  })

  it('does NOT report a tab mid-boot (bc present, within stale window)', () => {
    const freshIso = new Date(Date.now() - 1_000).toISOString()
    localStorage.setItem(
      `${NS}bc:booting`,
      `${freshIso} chat-mount session=booting`,
    )
    expect(reportPriorFreeze()).toBeNull()
  })

  it('still reports a React error from hours ago (survives overnight)', () => {
    // Crashes often happen during a long task while the user is away, then get
    // read many hours later. The retention window must outlast a night's sleep.
    const threeHoursAgo = Date.now() - 3 * 60 * 60_000
    localStorage.setItem(
      `${NS}err:overnight`,
      JSON.stringify({
        at: 'last night',
        ts: threeHoursAgo,
        name: 'TypeError',
        message: 'prevDeps is undefined',
        componentStack: '\n    at AnimatePresence\n    at ScrollToBottomButton',
      }),
    )
    const report = reportPriorFreeze()
    expect(report).not.toBeNull()
    expect((report?.reactError as { message?: string })?.message).toContain(
      'prevDeps',
    )
  })

  it('prunes a very old bc-only record without reporting', () => {
    const ancientIso = new Date(Date.now() - 50 * 60 * 60_000).toISOString()
    localStorage.setItem(
      `${NS}bc:ancient`,
      `${ancientIso} chat session=ancient`,
    )
    expect(reportPriorFreeze()).toBeNull()
    expect(localStorage.getItem(`${NS}bc:ancient`)).toBeNull()
  })

  it('reports a React error recorded by another tab, with its componentStack', () => {
    localStorage.setItem(
      `${NS}err:crashtab`,
      JSON.stringify({
        at: 'past',
        ts: Date.now(),
        name: 'TypeError',
        message: 'can\'t access property "length", prevDeps is undefined',
        componentStack:
          '\n    at MotionButton\n    at AnimatePresence\n    at ScrollToBottomButton',
      }),
    )
    const report = reportPriorFreeze()
    expect(report).not.toBeNull()
    const reactError = report?.reactError as {
      message?: string
      componentStack?: string
    }
    expect(reactError?.message).toContain('prevDeps is undefined')
    expect(reactError?.componentStack).toContain('AnimatePresence')
    // Consumed — not re-reported.
    expect(reportPriorFreeze()).toBeNull()
  })

  it('recordReactError persists name, message, and componentStack for this tab', () => {
    recordReactError(
      new TypeError('can\'t access property "length", prevDeps is undefined'),
      '\n    at MotionButton\n    at AnimatePresence',
    )
    let raw: string | null = null
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)
      if (k && k.startsWith(`${NS}err:`)) raw = localStorage.getItem(k)
    }
    expect(raw).not.toBeNull()
    const rec = JSON.parse(raw!)
    expect(rec.name).toBe('TypeError')
    expect(rec.message).toContain('prevDeps is undefined')
    expect(rec.componentStack).toContain('AnimatePresence')
    expect(typeof rec.ts).toBe('number')
  })
})
