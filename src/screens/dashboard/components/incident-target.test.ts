import { describe, expect, it } from 'vitest'

import { resolveIncidentTarget } from './incident-target'

describe('resolveIncidentTarget', () => {
  it('opens an explicit external href in a new tab', () => {
    expect(
      resolveIncidentTarget({ href: 'https://status.example.com', source: 'gateway' }),
    ).toEqual({ kind: 'external', href: 'https://status.example.com' })
  })

  it('routes an explicit internal href with a derived label', () => {
    expect(resolveIncidentTarget({ href: '/jobs', source: 'cron' })).toEqual({
      kind: 'route',
      to: '/jobs',
      label: 'Open Jobs',
    })
    expect(resolveIncidentTarget({ href: '/settings', source: 'config' })).toEqual({
      kind: 'route',
      to: '/settings',
      label: 'Open Settings',
    })
  })

  it('routes by source when there is no href', () => {
    expect(resolveIncidentTarget({ href: null, source: 'cron' })).toEqual({
      kind: 'route',
      to: '/jobs',
      label: 'Open Jobs',
    })
    expect(resolveIncidentTarget({ href: null, source: 'config' })).toEqual({
      kind: 'route',
      to: '/settings',
      label: 'Open Settings',
    })
    expect(resolveIncidentTarget({ href: null, source: 'gateway' })).toEqual({
      kind: 'route',
      to: '/operations',
      label: 'Open Operations',
    })
    expect(resolveIncidentTarget({ href: null, source: 'platform' })).toEqual({
      kind: 'route',
      to: '/operations',
      label: 'Open Operations',
    })
  })

  it('scrolls to the dashboard logs card for log incidents (no logs page exists)', () => {
    expect(resolveIncidentTarget({ href: null, source: 'log' })).toEqual({
      kind: 'scroll',
      elementId: 'dashboard-logs',
      label: 'View logs',
    })
  })
})
