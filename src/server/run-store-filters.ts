// Pure predicates for deciding which background runs stay in the "active" list
// and which count as stale. Kept separate from run-store so they can be unit
// tested without filesystem access.

/** Runs in these states are finished and never listed as active. */
export const TERMINAL_RUN_STATUSES = ['complete', 'error'] as const

/** A non-terminal run not updated within this window is aged out of the list
 * automatically, so the panel can't grow without bound. */
export const MAX_LISTED_RUN_AGE_MS = 24 * 60 * 60 * 1000 // 24h

/** A run silent for this long is shown as "stale" and targeted by Clear stale. */
export const STALE_RUN_THRESHOLD_MS = 5 * 60 * 1000 // 5m

function isTerminal(status: string): boolean {
  return (TERMINAL_RUN_STATUSES as ReadonlyArray<string>).includes(status)
}

/** Whether a run should appear in the active list: non-terminal and updated
 * within `maxAgeMs`. */
export function isRunListable(
  status: string,
  updatedAt: number,
  now: number,
  maxAgeMs: number = MAX_LISTED_RUN_AGE_MS,
): boolean {
  if (isTerminal(status)) return false
  return now - updatedAt <= maxAgeMs
}

/** Whether a run has been silent long enough to count as stale. */
export function isRunStale(
  updatedAt: number,
  now: number,
  thresholdMs: number = STALE_RUN_THRESHOLD_MS,
): boolean {
  return now - updatedAt >= thresholdMs
}
