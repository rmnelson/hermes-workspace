import type { HonchoConfig } from './honcho-config'
import { loadHonchoConfig } from './honcho-config'

/**
 * Honcho proxy — forwards a request to the configured Honcho server.
 * The browser never talks to Honcho directly: this server reads the same
 * config Hermes uses, applies the API key if any, and returns the upstream
 * payload as-is.
 *
 * Honcho's v3 list endpoints are POST with optional filter/pagination
 * bodies; detail/card endpoints are GET. We expose a single helper and let
 * each route pick the verb.
 */

const REQUEST_TIMEOUT_MS = 15_000

export type HonchoFetchOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | undefined>
}

export type HonchoFetchResult<T = unknown> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status: number }

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | undefined>,
): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${baseUrl.replace(/\/$/, '')}${normalized}`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

export function getHonchoConfig(): HonchoConfig {
  return loadHonchoConfig()
}

export async function fetchHoncho<T = unknown>(
  path: string,
  options: HonchoFetchOptions = {},
): Promise<HonchoFetchResult<T>> {
  const config = loadHonchoConfig()
  if (!config.enabled || !config.baseUrl) {
    return { ok: false, error: 'Honcho is not enabled.', status: 503 }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(buildUrl(config.baseUrl, path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    })
    const status = response.status
    const text = await response.text()
    if (!response.ok) {
      return { ok: false, error: text || `Honcho ${status}`, status }
    }
    const data = text ? (JSON.parse(text) as T) : ({} as T)
    return { ok: true, data, status }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('aborted')) {
      return { ok: false, error: 'Honcho request timed out.', status: 504 }
    }
    return {
      ok: false,
      error: `Failed to reach Honcho: ${msg}`,
      status: 502,
    }
  } finally {
    clearTimeout(timer)
  }
}
