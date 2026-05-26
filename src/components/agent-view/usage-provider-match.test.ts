import { describe, expect, it } from 'vitest'

import { selectUsageProviderId } from './usage-provider-match'
import type { UsageProviderLike } from './usage-provider-match'

const progress = [{ type: 'progress' as const }]

function provider(
  id: string,
  status: string,
  hasData: boolean,
): UsageProviderLike {
  return { provider: id, status, lines: hasData ? progress : [] }
}

const all = (...p: Array<UsageProviderLike>) => p

describe('selectUsageProviderId', () => {
  it('matches a Claude agent to the claude provider', () => {
    const providers = all(
      provider('claude', 'ok', true),
      provider('codex', 'ok', true),
    )
    expect(selectUsageProviderId('anthropic', 'claude-sonnet-4-6', providers)).toBe(
      'claude',
    )
  })

  it('matches an OpenAI agent to codex when codex has data (not claude)', () => {
    const providers = all(
      provider('claude', 'ok', true),
      provider('codex', 'ok', true),
      provider('openai', 'ok', false),
    )
    expect(selectUsageProviderId('openai', 'gpt-5', providers)).toBe('codex')
  })

  it('matches an OpenAI agent to openai when only openai has data', () => {
    const providers = all(
      provider('claude', 'ok', true),
      provider('codex', 'missing_credentials', false),
      provider('openai', 'ok', true),
    )
    expect(selectUsageProviderId('openai', 'gpt-5', providers)).toBe('openai')
  })

  it('matches an OpenRouter agent to openrouter', () => {
    const providers = all(
      provider('claude', 'ok', true),
      provider('openrouter', 'ok', true),
    )
    expect(selectUsageProviderId('openrouter', 'some-model', providers)).toBe(
      'openrouter',
    )
  })

  it('infers provider from the model string when modelProvider is empty', () => {
    const providers = all(
      provider('claude', 'ok', true),
      provider('codex', 'ok', true),
    )
    expect(selectUsageProviderId('', 'gpt-5-codex', providers)).toBe('codex')
  })

  it('treats a slash-style model id as openrouter even if it names claude', () => {
    const providers = all(
      provider('claude', 'ok', true),
      provider('openrouter', 'ok', true),
    )
    expect(
      selectUsageProviderId('', 'anthropic/claude-3.5-sonnet', providers),
    ).toBe('openrouter')
  })

  it('returns the matched provider even when it has no usage data (no-data state)', () => {
    const providers = all(
      provider('claude', 'ok', true),
      provider('openai', 'missing_credentials', false),
    )
    expect(selectUsageProviderId('openai', 'gpt-5', providers)).toBe('openai')
  })

  it('returns null when the agent provider has no matching usage entry at all', () => {
    const providers = all(provider('claude', 'ok', true))
    expect(selectUsageProviderId('google', 'gemini-2.5-pro', providers)).toBeNull()
  })
})
