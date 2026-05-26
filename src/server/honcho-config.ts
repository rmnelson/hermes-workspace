import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Honcho config — mirrors the resolution chain Hermes itself uses
 * (plugins/memory/honcho/client.py:resolve_config_path):
 *
 *   1. $HERMES_HOME/honcho.json   (profile-local)
 *   2. ~/.honcho/config.json      (legacy global)
 *   3. Environment variables      (HONCHO_API_KEY / HONCHO_BASE_URL)
 *
 * When this returns `enabled: true`, the workspace UI exposes the Honcho
 * memory browser. Detection is "is the file there and enabled?" — the
 * health route does the actual reachability ping.
 */

export type HonchoConfig = {
  enabled: boolean
  baseUrl: string | null
  apiKey: string | null
  workspaceId: string
  aiPeer: string
  userPeer: string
}

const DEFAULT_BASE_URL = 'http://localhost:8000'
const DEFAULT_WORKSPACE = 'hermes'
const DEFAULT_AI_PEER = 'hermes'
const DEFAULT_USER_PEER = 'user'

type RecordLike = Record<string, unknown>

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  return null
}

function readRecord(value: unknown): RecordLike {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordLike)
    : {}
}

function hermesHome(): string {
  return (
    process.env.HERMES_HOME ||
    process.env.CLAUDE_HOME ||
    join(homedir(), '.hermes')
  )
}

function activeHost(): string {
  // Mirrors plugins/memory/honcho/client.py:resolve_active_host but kept
  // dead simple — the workspace UI doesn't currently track which Hermes
  // profile is active, so we use the env var if set, else the default host.
  const explicit = readString(process.env.HERMES_HONCHO_HOST)
  if (explicit) return explicit
  return 'hermes'
}

function readJson(path: string): RecordLike | null {
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return readRecord(parsed)
  } catch {
    return null
  }
}

function loadFile(): RecordLike | null {
  return (
    readJson(join(hermesHome(), 'honcho.json')) ||
    readJson(join(homedir(), '.honcho', 'config.json'))
  )
}

export function loadHonchoConfig(): HonchoConfig {
  const raw = loadFile()
  const host = activeHost()
  const hostBlock = raw ? readRecord(readRecord(raw.hosts)[host]) : {}

  // Resolution: host-block field > root field > env > default.
  const baseUrl =
    readString(hostBlock.baseUrl) ||
    readString(hostBlock.base_url) ||
    readString(raw?.baseUrl) ||
    readString(raw?.base_url) ||
    readString(process.env.HONCHO_BASE_URL) ||
    null

  const apiKey =
    readString(hostBlock.apiKey) ||
    readString(raw?.apiKey) ||
    readString(process.env.HONCHO_API_KEY) ||
    null

  const workspaceId =
    readString(hostBlock.workspace) ||
    readString(raw?.workspace) ||
    DEFAULT_WORKSPACE

  const aiPeer =
    readString(hostBlock.aiPeer) ||
    readString(raw?.aiPeer) ||
    DEFAULT_AI_PEER

  const userPeer =
    readString(hostBlock.peerName) ||
    readString(raw?.peerName) ||
    DEFAULT_USER_PEER

  // Honcho is "enabled" when: host block says so, root says so, OR a
  // baseUrl/apiKey is present and nothing has explicitly disabled it.
  const hostEnabled = readBool(hostBlock.enabled)
  const rootEnabled = readBool(raw?.enabled)
  const enabled =
    hostEnabled !== null
      ? hostEnabled
      : rootEnabled !== null
        ? rootEnabled
        : Boolean(baseUrl || apiKey)

  return {
    enabled,
    baseUrl: baseUrl || (enabled ? DEFAULT_BASE_URL : null),
    apiKey,
    workspaceId,
    aiPeer,
    userPeer,
  }
}
