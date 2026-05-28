// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  clearFreezeDiagnostics,
  mark,
  reportPriorFreeze,
} from './freeze-watchdog'

describe('freeze-watchdog breadcrumbs', () => {
  beforeEach(() => {
    sessionStorage.clear()
    clearFreezeDiagnostics()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('persists breadcrumbs to sessionStorage synchronously', () => {
    mark('chat', 'session=abc waiting=true')
    const stored = sessionStorage.getItem('hermes:freeze:breadcrumbs')
    expect(stored).toContain('chat session=abc waiting=true')
  })

  it('keeps the breadcrumb buffer bounded', () => {
    for (let i = 0; i < 100; i += 1) mark('tick', String(i))
    const stored = sessionStorage.getItem('hermes:freeze:breadcrumbs') ?? ''
    const lines = stored.split('\n').filter(Boolean)
    expect(lines.length).toBeLessThanOrEqual(40)
    // The most recent breadcrumb survives; the oldest is evicted.
    expect(stored).toContain('tick 99')
    expect(stored).not.toContain('tick 0\n')
  })

  it('reports nothing when there is no prior-freeze data', () => {
    expect(reportPriorFreeze()).toBeNull()
  })

  it('surfaces saved diagnostics on the next load', () => {
    mark('chat', 'session=frozen')
    const report = reportPriorFreeze()
    expect(report).not.toBeNull()
    expect(report?.breadcrumbs).toContain('chat session=frozen')
  })

  it('clears all diagnostic keys', () => {
    mark('chat', 'session=abc')
    clearFreezeDiagnostics()
    expect(sessionStorage.getItem('hermes:freeze:breadcrumbs')).toBeNull()
    expect(reportPriorFreeze()).toBeNull()
  })
})
