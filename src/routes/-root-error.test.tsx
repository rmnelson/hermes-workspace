// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { RootError } from './-root-error'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

const NS = 'hermes:freeze:'

function readErrRecord(): Record<string, unknown> | null {
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i)
    if (k && k.startsWith(`${NS}err:`)) {
      const raw = localStorage.getItem(k)
      return raw ? JSON.parse(raw) : null
    }
  }
  return null
}

describe('RootError (router errorComponent)', () => {
  it('renders the message and a Return Home action', () => {
    render(
      <RootError
        error={
          new TypeError(
            'can\'t access property "length", prevDeps is undefined',
          )
        }
      />,
    )
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.getByText(/prevDeps is undefined/)).toBeTruthy()
    expect(screen.getByText('Return Home')).toBeTruthy()
  })

  it('persists the error + componentStack to the freeze-watchdog store', () => {
    render(
      <RootError
        error={
          new TypeError(
            'can\'t access property "length", prevDeps is undefined',
          )
        }
        info={{
          componentStack:
            '\n    at MotionButton\n    at AnimatePresence\n    at WorkspaceShell',
        }}
      />,
    )
    const rec = readErrRecord()
    expect(rec).not.toBeNull()
    expect(rec!.message).toContain('prevDeps is undefined')
    expect(rec!.componentStack).toContain('WorkspaceShell')
  })

  it('still records the error when no info/componentStack is provided', () => {
    render(<RootError error={new Error('boom')} />)
    const rec = readErrRecord()
    expect(rec).not.toBeNull()
    expect(rec!.message).toBe('boom')
  })

  it('shows the captured component stack for copying when present', () => {
    render(
      <RootError
        error={new Error('boom')}
        info={{ componentStack: '\n    at WorkspaceShell' }}
      />,
    )
    expect(screen.getByText(/WorkspaceShell/)).toBeTruthy()
  })
})
