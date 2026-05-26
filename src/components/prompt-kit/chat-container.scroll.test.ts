import { describe, expect, it } from 'vitest'

import { nextStickToBottom, overflowAnchorForFollow } from './chat-container'

const THRESHOLD = 200

describe('overflowAnchorForFollow', () => {
  it('disables scroll anchoring while following so scroll-to-bottom can reach the end', () => {
    expect(overflowAnchorForFollow(true)).toBe('none')
  })

  it('enables scroll anchoring when scrolled up so the reading position stays put as content grows', () => {
    expect(overflowAnchorForFollow(false)).toBe('auto')
  })
})

describe('nextStickToBottom', () => {
  it('does not change follow state on a programmatic scroll (the core bug)', () => {
    // User had scrolled up (follow off). A streaming re-anchor scrolls to the
    // bottom, but because it is not a user gesture it must NOT re-enable follow.
    expect(
      nextStickToBottom({
        isUserGesture: false,
        distanceFromBottom: 0,
        scrolledUp: false,
        threshold: THRESHOLD,
        current: false,
      }),
    ).toBe(false)
  })

  it('keeps following on a programmatic scroll while already following', () => {
    expect(
      nextStickToBottom({
        isUserGesture: false,
        distanceFromBottom: 0,
        scrolledUp: false,
        threshold: THRESHOLD,
        current: true,
      }),
    ).toBe(true)
  })

  it('latches follow off when the user scrolls up beyond the threshold', () => {
    expect(
      nextStickToBottom({
        isUserGesture: true,
        distanceFromBottom: 600,
        scrolledUp: true,
        threshold: THRESHOLD,
        current: true,
      }),
    ).toBe(false)
  })

  it('resumes follow when the user scrolls back to the bottom', () => {
    expect(
      nextStickToBottom({
        isUserGesture: true,
        distanceFromBottom: 20,
        scrolledUp: false,
        threshold: THRESHOLD,
        current: false,
      }),
    ).toBe(true)
  })

  it('keeps following when the user nudges up but stays within the threshold', () => {
    expect(
      nextStickToBottom({
        isUserGesture: true,
        distanceFromBottom: 50,
        scrolledUp: true,
        threshold: THRESHOLD,
        current: true,
      }),
    ).toBe(true)
  })

  it('leaves follow off for a user gesture that is neither up nor near the bottom', () => {
    expect(
      nextStickToBottom({
        isUserGesture: true,
        distanceFromBottom: 600,
        scrolledUp: false,
        threshold: THRESHOLD,
        current: false,
      }),
    ).toBe(false)
  })
})
