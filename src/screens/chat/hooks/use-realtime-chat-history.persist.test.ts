import { describe, expect, it } from 'vitest'

import {
  assistantContentTail,
  isAssistantMessagePresent,
} from './use-realtime-chat-history'

describe('assistantContentTail', () => {
  it('reads the tail from a content-array message', () => {
    const tail = assistantContentTail({
      role: 'assistant',
      content: [{ type: 'text', text: 'hello world final answer' }],
    })
    expect(tail).toContain('final answer')
  })

  it('reads the tail from a legacy top-level text field', () => {
    const tail = assistantContentTail({
      role: 'assistant',
      text: 'legacy body',
    })
    expect(tail).toContain('legacy body')
  })

  it('is bounded to the last 64 chars', () => {
    const tail = assistantContentTail({
      role: 'assistant',
      text: 'a'.repeat(5000),
    })
    expect(tail.length).toBeLessThanOrEqual(64)
  })
})

describe('isAssistantMessagePresent', () => {
  const completed = {
    role: 'assistant',
    content: [{ type: 'text', text: 'the completed final answer' }],
  }

  it('returns true when an assistant message with the same tail exists', () => {
    const present = isAssistantMessagePresent(
      [
        { role: 'user', content: [{ type: 'text', text: 'q' }] },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'the completed final answer' }],
        },
      ],
      completed,
    )
    expect(present).toBe(true)
  })

  it('returns false when no matching assistant message exists', () => {
    const present = isAssistantMessagePresent(
      [{ role: 'user', content: [{ type: 'text', text: 'q' }] }],
      completed,
    )
    expect(present).toBe(false)
  })

  it('does not match a user message with the same text', () => {
    const present = isAssistantMessagePresent(
      [
        {
          role: 'user',
          content: [{ type: 'text', text: 'the completed final answer' }],
        },
      ],
      completed,
    )
    expect(present).toBe(false)
  })
})
