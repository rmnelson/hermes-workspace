import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { resolveIncidentTarget } from './incident-target'
import type {
  DashboardIncident,
  DashboardOverview,
} from '@/server/dashboard-aggregator'

const SOURCE_GLYPH: Record<DashboardIncident['source'], string> = {
  cron: '⏰',
  platform: '🔌',
  log: '📜',
  config: '⚙️',
  gateway: '🛰️',
}

const SEVERITY_COLOR: Record<DashboardIncident['severity'], string> = {
  warn: 'var(--theme-warning)',
  error: 'var(--theme-danger)',
  info: 'var(--theme-muted)',
}

/**
 * Right-to-left marquee that surfaces the same `incidents[]` payload
 * the legacy `AttentionCard` used to render. Lives inside `OpsStrip`
 * so attention items occupy the same horizontal "10-second status
 * read" line operators already glance at.
 *
 * Behavior:
 * - Hidden when there are no incidents (no empty marquee row).
 * - Clones the list once so the loop animation stitches seamlessly.
 * - Pauses on hover so the operator can read a long item.
 * - Each item is a button that routes to the most context-appropriate
 *   page (cron → /jobs, config → /settings, log/gateway → /logs).
 */
export function AttentionMarquee({
  overview,
}: {
  overview: DashboardOverview | null
}) {
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const items = overview?.incidents ?? []

  // Close the detail popover on Escape.
  useEffect(() => {
    if (!selectedId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId])

  if (items.length === 0) return null

  const selected = items.find((i) => i.id === selectedId) ?? null
  const selectedTarget = selected ? resolveIncidentTarget(selected) : null
  const selectedActionLabel = selectedTarget
    ? selectedTarget.kind === 'external'
      ? 'Open link'
      : selectedTarget.label
    : ''

  const goToIncident = (incident: DashboardIncident) => {
    const target = resolveIncidentTarget(incident)
    setSelectedId(null)
    if (target.kind === 'external') {
      window.open(target.href, '_blank', 'noopener,noreferrer')
    } else if (target.kind === 'route') {
      void navigate({ to: target.to as '/jobs' })
    } else {
      document
        .getElementById(target.elementId)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const tracks = [...items, ...items]

  return (
    <div
      className="group relative flex items-center gap-2 rounded-md border px-2 py-1"
      style={{
        background:
          'linear-gradient(90deg, color-mix(in srgb, var(--theme-warning) 10%, transparent), transparent 70%)',
        borderColor:
          'color-mix(in srgb, var(--theme-warning) 35%, transparent)',
      }}
      title={`${items.length} item${items.length === 1 ? '' : 's'} need attention`}
    >
      <span
        className="z-10 shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em]"
        style={{
          background:
            'color-mix(in srgb, var(--theme-warning) 18%, transparent)',
          color: 'var(--theme-warning)',
        }}
      >
        ⚠️ Attention · {items.length}
      </span>

      {/* Fade mask on right edge for "ticker continues" feel. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12"
        style={{
          background:
            'linear-gradient(90deg, transparent, var(--theme-card))',
        }}
      />

      <div
        className="flex min-w-0 flex-1 overflow-hidden whitespace-nowrap"
        style={{ maskImage: 'linear-gradient(90deg, black 96%, transparent)' }}
      >
        <div
          className="oc-marquee-track flex shrink-0 items-center gap-6 pl-3 will-change-transform"
        >
          {tracks.map((item, idx) => {
            return (
              <button
                key={`${item.id}-${idx}`}
                type="button"
                onClick={() =>
                  setSelectedId((prev) => (prev === item.id ? null : item.id))
                }
                className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] hover:underline"
                style={{ color: SEVERITY_COLOR[item.severity] }}
              >
                <span aria-hidden className="text-[12px]">
                  {SOURCE_GLYPH[item.source] ?? '•'}
                </span>
                <span style={{ color: 'var(--theme-text)' }}>
                  {item.label}
                </span>
                {item.detail ? (
                  <span style={{ color: 'var(--theme-muted)' }}>
                    · {item.detail}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      {selected ? (
        <>
          {/* Click-away layer. */}
          <div
            aria-hidden
            className="fixed inset-0 z-40"
            onClick={() => setSelectedId(null)}
          />
          <div
            role="dialog"
            aria-label="Attention item detail"
            className="absolute left-0 top-full z-50 mt-1 w-[min(360px,90vw)] rounded-md border p-3 shadow-lg"
            style={{
              background: 'var(--theme-card)',
              borderColor:
                'color-mix(in srgb, var(--theme-warning) 35%, transparent)',
            }}
          >
            <div className="flex items-start gap-2">
              <span aria-hidden className="text-[14px] leading-none">
                {SOURCE_GLYPH[selected.source]}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-xs font-semibold"
                  style={{ color: SEVERITY_COLOR[selected.severity] }}
                >
                  {selected.label}
                </p>
                {selected.detail ? (
                  <p
                    className="mt-1 text-[11px] leading-snug"
                    style={{ color: 'var(--theme-muted)' }}
                  >
                    {selected.detail}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setSelectedId(null)}
                className="shrink-0 rounded px-1 text-[13px] leading-none"
                style={{ color: 'var(--theme-muted)' }}
              >
                ×
              </button>
            </div>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => goToIncident(selected)}
                className="rounded px-2 py-1 text-[11px] font-medium"
                style={{
                  background:
                    'color-mix(in srgb, var(--theme-warning) 18%, transparent)',
                  color: 'var(--theme-warning)',
                }}
              >
                {selectedActionLabel}
              </button>
            </div>
          </div>
        </>
      ) : null}

      <style>{`
        @keyframes oc-attention-marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .oc-marquee-track {
          animation: oc-attention-marquee 32s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .oc-marquee-track { animation: none; }
        }
        .group:hover .oc-marquee-track {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  )
}
