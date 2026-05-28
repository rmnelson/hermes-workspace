// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  clearFreezeDiagnostics,
  mark,
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
})
