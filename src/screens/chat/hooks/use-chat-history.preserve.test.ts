import { describe, expect, it } from 'vitest'

import { preserveMessagesDuringStream } from './use-chat-history'
import type { ChatMessage } from '../types'

const userMsg = (
  id: string,
  text: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage => ({
  role: 'user',
  id,
  content: [{ type: 'text', text }],
  timestamp: extra.timestamp,
  ...extra,
})

const assistantMsg = (
  id: string,
  text: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage => ({
  role: 'assistant',
  id,
  content: [{ type: 'text', text }],
  ...extra,
})

describe('preserveMessagesDuringStream', () => {
  it('returns the next list unchanged when there is no previous list', () => {
    const next = [userMsg('a', 'hello', { timestamp: 1 })]
    expect(preserveMessagesDuringStream([], next)).toBe(next)
  })

  it('allows the list to shrink when no turn is in flight (deletions propagate)', () => {
    const previous = [
      userMsg('a', 'hello', { timestamp: 1 }),
      assistantMsg('b', 'hi there', { timestamp: 2 }),
    ]
    const next = [userMsg('a', 'hello', { timestamp: 1 })]

    expect(preserveMessagesDuringStream(previous, next)).toBe(next)
  })

  it('re-inserts a message that vanished from a refetch while a turn streams', () => {
    const previous = [
      userMsg('a', 'first question', { timestamp: 1 }),
      assistantMsg('b', 'first answer', { timestamp: 2 }),
      userMsg('c', 'second question', { timestamp: 3 }),
    ]
    // A mid-stream refetch momentarily drops the earlier answer 'b',
    // and the assistant is streaming a reply to 'c'.
    const next = [
      userMsg('a', 'first question', { timestamp: 1 }),
      userMsg('c', 'second question', { timestamp: 3 }),
      assistantMsg('d', '', { timestamp: 4, __streamingStatus: 'streaming' }),
    ]

    const result = preserveMessagesDuringStream(previous, next)
    const ids = result.map((m) => m.id)
    expect(ids).toContain('b')
    // restored in timestamp order, between a and c
    expect(ids).toEqual(['a', 'b', 'c', 'd'])
  })

  it('treats an unconfirmed optimistic send as an in-flight turn', () => {
    const previous = [
      userMsg('a', 'earlier', { timestamp: 1 }),
      assistantMsg('b', 'earlier reply', { timestamp: 2 }),
    ]
    const next = [
      userMsg('c', 'new send', {
        timestamp: 3,
        status: 'sending',
        __optimisticId: 'opt-1',
      }),
    ]

    const ids = preserveMessagesDuringStream(previous, next).map((m) => m.id)
    expect(ids).toEqual(['a', 'b', 'c'])
  })

  it('does not duplicate messages present in both lists', () => {
    const previous = [
      userMsg('a', 'q', { timestamp: 1 }),
      assistantMsg('b', 'streaming...', { timestamp: 2, __streamingStatus: 'streaming' }),
    ]
    const next = [
      userMsg('a', 'q', { timestamp: 1 }),
      assistantMsg('b', 'streaming more...', { timestamp: 2, __streamingStatus: 'streaming' }),
    ]

    const result = preserveMessagesDuringStream(previous, next)
    expect(result.map((m) => m.id)).toEqual(['a', 'b'])
  })
})
