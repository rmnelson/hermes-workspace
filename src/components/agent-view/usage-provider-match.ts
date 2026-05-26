// Match the agent's running model/provider to the provider whose usage should
// be displayed in the agent view. The usage panel used to default to the first
// available provider (Claude), so a non-Claude agent showed "Claude Max" usage.

export type UsageProviderLike = {
  provider: string
  status: string
  lines: Array<{ type: string }>
}

/** Provider-usage IDs that carry an Anthropic-style subscription. */
const PROVIDER_ALIASES: Record<string, string> = {
  anthropic: 'claude',
  claude: 'claude',
  openrouter: 'openrouter',
  openai: 'openai',
  codex: 'codex',
  chatgpt: 'codex',
}

/** Candidate usage-provider IDs for an agent, most specific first. */
function candidateProviderIds(
  modelProvider: string,
  model: string,
): Array<string> {
  const mp = modelProvider.trim().toLowerCase()
  const mdl = model.trim().toLowerCase()

  const aliased = PROVIDER_ALIASES[mp]
  if (aliased === 'openai' || aliased === 'codex') {
    // OpenAI-family: usage can live under either the ChatGPT/Codex plan or the
    // OpenAI API platform. Honour the explicit one first, then the other.
    return aliased === 'codex' ? ['codex', 'openai'] : ['openai', 'codex']
  }
  if (aliased) return [aliased]

  // No (or unrecognised) provider id — infer from the model string.
  if (mdl.includes('/')) return ['openrouter'] // routed ids like "anthropic/claude-3.5"
  if (/claude|opus|sonnet|haiku/.test(mdl)) return ['claude']
  if (/gpt|chatgpt|codex|^o[0-9]/.test(mdl)) return ['codex', 'openai']
  return []
}

/**
 * Pick the provider-usage entry that matches the agent's model. Prefers a
 * candidate that actually has usage data, but still returns a matched provider
 * with no data so the panel can show the agent's real provider (never another
 * provider's usage). Returns null when no candidate provider is present.
 */
export function selectUsageProviderId(
  modelProvider: string,
  model: string,
  providers: Array<UsageProviderLike>,
): string | null {
  const candidates = candidateProviderIds(modelProvider, model)
  if (candidates.length === 0) return null

  const hasData = (id: string) =>
    providers.some(
      (p) =>
        p.provider === id &&
        p.status === 'ok' &&
        p.lines.some((l) => l.type === 'progress'),
    )
  const isPresent = (id: string) => providers.some((p) => p.provider === id)

  for (const id of candidates) if (hasData(id)) return id
  for (const id of candidates) if (isPresent(id)) return id
  return null
}
