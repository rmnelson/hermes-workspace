import { describe, expect, it } from 'vitest'

import {
  MAX_LISTED_RUN_AGE_MS,
  STALE_RUN_THRESHOLD_MS,
  isRunListable,
  isRunStale,
} from './run-store-filters'

const NOW = 1_000_000_000_000

describe('isRunListable', () => {
  it('excludes terminal runs (complete / error)', () => {
    expect(isRunListable('complete', NOW, NOW)).toBe(false)
    expect(isRunListable('error', NOW, NOW)).toBe(false)
  })

  it('includes a recently-updated non-terminal run', () => {
    expect(isRunListable('active', NOW - 1000, NOW)).toBe(true)
    expect(isRunListable('handoff', NOW - 60_000, NOW)).toBe(true)
  })

  it('ages out a non-terminal run older than the max listed age', () => {
    expect(isRunListable('handoff', NOW - MAX_LISTED_RUN_AGE_MS - 1, NOW)).toBe(
      false,
    )
  })

  it('keeps a run exactly at the max listed age', () => {
    expect(isRunListable('active', NOW - MAX_LISTED_RUN_AGE_MS, NOW)).toBe(true)
  })
})

describe('isRunStale', () => {
  it('is false for a freshly-updated run', () => {
    expect(isRunStale(NOW - 1000, NOW)).toBe(false)
  })

  it('is true once the staleness threshold is reached', () => {
    expect(isRunStale(NOW - STALE_RUN_THRESHOLD_MS, NOW)).toBe(true)
    expect(isRunStale(NOW - STALE_RUN_THRESHOLD_MS - 1, NOW)).toBe(true)
  })
})
