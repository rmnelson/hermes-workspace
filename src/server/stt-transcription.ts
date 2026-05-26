import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_GROQ_MODEL = 'whisper-large-v3-turbo'
const DEFAULT_OPENAI_MODEL = 'whisper-1'
const DEFAULT_LOCAL_MODEL = 'base'

type RecordLike = Record<string, unknown>

type SupportedRemoteProvider = 'groq' | 'openai'

export type ResolvedRemoteTranscriptionTarget = {
  ok: true
  kind: 'remote'
  provider: SupportedRemoteProvider
  model: string
  language?: string
  apiKey: string
  baseUrl: string
}

export type ResolvedLocalTranscriptionTarget = {
  ok: true
  kind: 'local'
  provider: 'local'
  model: string
  language?: string
}

export type ResolvedTranscriptionTarget =
  | ResolvedRemoteTranscriptionTarget
  | ResolvedLocalTranscriptionTarget

export type ResolvedTranscriptionError = {
  ok: false
  error: string
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readRecord(value: unknown): RecordLike {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordLike)
    : {}
}

export function parseEnvText(raw: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) env[key] = value
  }
  return env
}

export function readHermesEnv(
  envHome = process.env.HERMES_HOME ?? process.env.CLAUDE_HOME ?? join(homedir(), '.hermes'),
): Record<string, string> {
  const envPath = join(envHome, '.env')
  if (!existsSync(envPath)) return {}
  try {
    return parseEnvText(readFileSync(envPath, 'utf8'))
  } catch {
    return {}
  }
}

export function resolveTranscriptionTarget(
  config: RecordLike,
  runtimeEnv: Record<string, string | undefined> = process.env,
  hermesEnv: Record<string, string> = readHermesEnv(),
): ResolvedTranscriptionTarget | ResolvedTranscriptionError {
  const stt = readRecord(config.stt)
  const provider = readString(stt.provider) || 'local'
  const language = readString(stt.language) || undefined

  if (provider === 'local') {
    const local = readRecord(stt.local)
    return {
      ok: true,
      kind: 'local',
      provider: 'local',
      model: readString(local.model) || DEFAULT_LOCAL_MODEL,
      language: readString(local.language) || language,
    }
  }

  if (provider === 'groq') {
    const groq = readRecord(stt.groq)
    const apiKey =
      readString(runtimeEnv.GROQ_API_KEY) || readString(hermesEnv.GROQ_API_KEY)
    if (!apiKey) {
      return { ok: false, error: 'Groq STT is configured but GROQ_API_KEY is missing.' }
    }
    return {
      ok: true,
      kind: 'remote',
      provider: 'groq',
      model: readString(groq.model) || DEFAULT_GROQ_MODEL,
      language,
      apiKey,
      baseUrl:
        readString(runtimeEnv.GROQ_BASE_URL) ||
        readString(hermesEnv.GROQ_BASE_URL) ||
        DEFAULT_GROQ_BASE_URL,
    }
  }

  if (provider === 'openai') {
    const openai = readRecord(stt.openai)
    const apiKey =
      readString(runtimeEnv.VOICE_TOOLS_OPENAI_KEY) ||
      readString(hermesEnv.VOICE_TOOLS_OPENAI_KEY) ||
      readString(runtimeEnv.OPENAI_API_KEY) ||
      readString(hermesEnv.OPENAI_API_KEY)
    if (!apiKey) {
      return {
        ok: false,
        error: 'OpenAI STT is configured but VOICE_TOOLS_OPENAI_KEY or OPENAI_API_KEY is missing.',
      }
    }
    return {
      ok: true,
      kind: 'remote',
      provider: 'openai',
      model:
        readString(openai.model) ||
        readString(runtimeEnv.STT_OPENAI_MODEL) ||
        readString(hermesEnv.STT_OPENAI_MODEL) ||
        DEFAULT_OPENAI_MODEL,
      language,
      apiKey,
      baseUrl:
        readString(runtimeEnv.STT_OPENAI_BASE_URL) ||
        readString(hermesEnv.STT_OPENAI_BASE_URL) ||
        DEFAULT_OPENAI_BASE_URL,
    }
  }

  return {
    ok: false,
    error: `Configured STT provider "${provider}" is not available through Workspace remote transcription.`,
  }
}

// Runs the local faster-whisper bridge script and returns the transcript.
// The script always exits 0 and prints a single JSON object — we re-raise
// any {ok:false,error} payload as an Error so the route handler can surface it.
export async function runLocalTranscription(
  audioPath: string,
  target: ResolvedLocalTranscriptionTarget,
): Promise<string> {
  const { spawn } = await import('node:child_process')
  const { join } = await import('node:path')

  const pythonPath =
    process.env.HERMES_PYTHON ||
    join(homedir(), '.hermes', 'hermes-agent', 'venv', 'bin', 'python')
  const scriptPath = join(process.cwd(), 'scripts', 'transcribe-local.py')

  const args = [scriptPath, audioPath, '--model', target.model]
  if (target.language) args.push('--language', target.language)

  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (err) => {
      reject(
        new Error(
          `Failed to spawn ${pythonPath}: ${err.message}. ` +
            'Set HERMES_PYTHON to a python interpreter with faster-whisper installed.',
        ),
      )
    })
    child.on('close', () => {
      const lastLine = stdout.trim().split('\n').pop() || ''
      if (!lastLine) {
        reject(
          new Error(
            stderr.trim() || 'Local transcription returned no output.',
          ),
        )
        return
      }
      let parsed: { ok?: boolean; text?: string; error?: string }
      try {
        parsed = JSON.parse(lastLine)
      } catch {
        reject(new Error(`Local transcription emitted invalid JSON: ${lastLine}`))
        return
      }
      if (!parsed.ok) {
        reject(new Error(parsed.error || 'Local transcription failed.'))
        return
      }
      resolve(typeof parsed.text === 'string' ? parsed.text : '')
    })
  })
}

export function extractTranscriptionText(payload: unknown): string {
  const record = readRecord(payload)
  const text = readString(record.text)
  if (text) return text
  const choices = Array.isArray(record.choices) ? record.choices : []
  for (const choice of choices) {
    const message = readRecord(readRecord(choice).message)
    const content = readString(message.content)
    if (content) return content
  }
  return ''
}
