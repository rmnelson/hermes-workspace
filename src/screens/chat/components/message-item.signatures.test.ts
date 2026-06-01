import { describe, expect, it } from 'vitest'

import { toolCallsSignature, toolResultsSignature } from './message-item'
import type { ChatMessage } from '../types'

function assistantWithToolCall(args: Record<string, unknown>): ChatMessage {
  return {
    role: 'assistant',
    content: [
      { type: 'toolCall', id: 'tc-1', name: 'write_file', arguments: args },
    ],
  } as ChatMessage
}

function toolResult(text: string): ChatMessage {
  return {
    role: 'toolResult',
    toolCallId: 'tc-1',
    toolName: 'write_file',
    content: [{ type: 'text', text }],
  } as ChatMessage
}

describe('toolCallsSignature', () => {
  it('changes when a tool argument changes', () => {
    const a = toolCallsSignature(assistantWithToolCall({ path: 'a.ts' }))
    const b = toolCallsSignature(assistantWithToolCall({ path: 'b.ts' }))
    expect(a).not.toBe(b)
  })

  it('is identical for identical args', () => {
    const a = toolCallsSignature(assistantWithToolCall({ path: 'a.ts', n: 1 }))
    const b = toolCallsSignature(assistantWithToolCall({ path: 'a.ts', n: 1 }))
    expect(a).toBe(b)
  })

  it('is bounded for a huge argument value (does not embed the whole payload)', () => {
    const huge = 'x'.repeat(2_000_000) // 2 MB file content as a Write arg
    const sig = toolCallsSignature(assistantWithToolCall({ content: huge }))
    // The signature must NOT scale with the payload — a full JSON.stringify
    // would make it ~2MB. Bounded fingerprint keeps it tiny.
    expect(sig.length).toBeLessThan(2_000)
  })

  it('still detects growth in a huge argument (length is part of the fingerprint)', () => {
    const a = toolCallsSignature(
      assistantWithToolCall({ content: 'x'.repeat(1_000_000) }),
    )
    const b = toolCallsSignature(
      assistantWithToolCall({ content: 'x'.repeat(1_000_001) }),
    )
    expect(a).not.toBe(b)
  })
})

describe('toolResultsSignature', () => {
  const byId = (result: ChatMessage) => new Map([['tc-1', result]])

  it('changes when the tool result text changes', () => {
    const msg = assistantWithToolCall({ path: 'a.ts' })
    const a = toolResultsSignature(msg, byId(toolResult('done: 10 lines')))
    const b = toolResultsSignature(msg, byId(toolResult('done: 11 lines')))
    expect(a).not.toBe(b)
  })

  it('is bounded for a huge tool result (does not embed the whole output)', () => {
    const msg = assistantWithToolCall({ path: 'a.ts' })
    const huge = 'y'.repeat(2_000_000) // 2 MB tool output
    const sig = toolResultsSignature(msg, byId(toolResult(huge)))
    expect(sig.length).toBeLessThan(2_000)
  })

  it('detects growth in a huge tool result (streaming append)', () => {
    const msg = assistantWithToolCall({ path: 'a.ts' })
    const a = toolResultsSignature(msg, byId(toolResult('z'.repeat(500_000))))
    const b = toolResultsSignature(msg, byId(toolResult('z'.repeat(500_010))))
    expect(a).not.toBe(b)
  })
})
