// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FreezeReportBanner } from './freeze-report-banner'

const NS = 'hermes:freeze:'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function seedLastReport(over: Record<string, unknown> = {}) {
  localStorage.setItem(
    `${NS}last`,
    JSON.stringify({
      heartbeat: {
        ts: Date.now() - 60_000,
        lastTag: 'chat session=265ea6 streaming=true',
        domNodes: 48000,
        maxPayloadKB: 1200,
        maxPayloadLabel: 'tool:web_search',
      },
      renderLoop: null,
      longTask: null,
      reactError: {
        message: 'prevDeps is undefined',
        componentStack: '\n    at MotionButton\n    at WorkspaceShell',
      },
      breadcrumbs: 'past chat session=265ea6',
      reportedAt: Date.now(),
      ...over,
    }),
  )
}

describe('FreezeReportBanner', () => {
  it('renders nothing when there is no prior freeze report', () => {
    const { container } = render(<FreezeReportBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('surfaces the last freeze with its component stack and heartbeat clues', () => {
    seedLastReport()
    render(<FreezeReportBanner />)
    expect(screen.getByText(/stopped responding/i)).toBeTruthy()
    expect(screen.getByText(/prevDeps is undefined/)).toBeTruthy()
    expect(screen.getByText(/WorkspaceShell/)).toBeTruthy()
    // Heartbeat bloat signals are the OOM-hypothesis evidence — must be shown.
    expect(screen.getByText(/48000/)).toBeTruthy()
    expect(screen.getByText(/1200/)).toBeTruthy()
  })

  it('dismiss hides the banner but PRESERVES the durable report for debugging', () => {
    seedLastReport()
    render(<FreezeReportBanner />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByText(/stopped responding/i)).toBeNull()
    // Data must remain — dismissing must not destroy the heartbeat we need.
    expect(localStorage.getItem(`${NS}last`)).not.toBeNull()
  })

  it('does not re-show a report that was already dismissed (persists across reload)', () => {
    seedLastReport()
    // First mount + dismiss.
    const first = render(<FreezeReportBanner />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    first.unmount()
    // Simulate a reload: a fresh banner instance reads persisted state.
    render(<FreezeReportBanner />)
    expect(screen.queryByText(/stopped responding/i)).toBeNull()
  })
})
