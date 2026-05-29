// Render-size guard: bound the size of any single payload we render.
//
// A multi-MB payload — a giant fenced code block, a huge tool output, a massive
// message — can exhaust the tab's JS heap and crash it (the OOM freezes we've
// been chasing). Highlighting/parsing/DOM-building all scale with input size, so
// the only robust defense is to cap what we hand to the renderer.
//
// `capForRender` also reports the *original* size to the freeze-watchdog
// (`notePayloadSize`), so even when we truncate for safety, the next freeze
// report still tells us how big the payload actually was and where it came from
// — that's the "determine the cause" half of the fix.

import { notePayloadSize } from './freeze-watchdog'

/** Bytes shown inline before we truncate. ~100 KB of text is already a lot to
 *  render; legitimate code/messages rarely exceed it, but a runaway dump can be
 *  megabytes — which is what crashes the tab. */
export const RENDER_CAP_BYTES = 100 * 1024

/** Above this, skip syntax highlighting entirely — shiki tokenizing a huge
 *  string is itself a major allocation spike. Render plain text instead. */
export const HIGHLIGHT_CAP_BYTES = 100 * 1024

/** Above this many lines, don't build a per-line gutter (one DOM node/line). */
export const MAX_GUTTER_LINES = 5_000

export type CappedRender = {
  text: string
  truncated: boolean
  originalBytes: number
}

/**
 * Cap a string for safe rendering and record its true size for diagnostics.
 * `label` identifies the source (e.g. `code-block:json`, `tool-output:terminal`)
 * so a freeze report can name what blew up.
 */
export function capForRender(
  text: string,
  label: string,
  maxBytes: number = RENDER_CAP_BYTES,
): CappedRender {
  const originalBytes = text.length
  notePayloadSize(label, originalBytes)
  if (originalBytes <= maxBytes) {
    return { text, truncated: false, originalBytes }
  }
  return { text: text.slice(0, maxBytes), truncated: true, originalBytes }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}
