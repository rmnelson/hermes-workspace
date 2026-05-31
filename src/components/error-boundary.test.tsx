// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ErrorBoundary } from './error-boundary'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

function Boom(): never {
  throw new TypeError('can\'t access property "length", prevDeps is undefined')
}

describe('ErrorBoundary', () => {
  it('renders the fallback and surfaces the error message for copying', () => {
    // React itself logs the caught error to console.error; silence for a clean run.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    // The actual message must be visible/copyable — not just the generic line —
    // so a user without DevTools can still report it.
    expect(screen.getByText(/prevDeps is undefined/)).toBeTruthy()
  })

  it('persists the caught error + componentStack to the freeze-watchdog store', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    let raw: string | null = null
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)
      if (k && k.startsWith('hermes:freeze:err:')) raw = localStorage.getItem(k)
    }
    expect(raw).not.toBeNull()
    const rec = JSON.parse(raw!)
    expect(rec.message).toContain('prevDeps is undefined')
    // componentStack names the throwing component — the key diagnostic clue.
    expect(rec.componentStack).toContain('Boom')
  })
})
