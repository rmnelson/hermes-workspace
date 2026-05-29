'use client'

import { memo, useCallback, useEffect, useState } from 'react'
import {
  PreviewCard,
  PreviewCardPopup,
  PreviewCardTrigger,
} from '@/components/ui/preview-card'

const POLL_MS = 15_000

type ContextData = {
  contextPercent: number
  model: string
  maxTokens: number
  usedTokens: number
}

const EMPTY: ContextData = {
  contextPercent: 0,
  model: '',
  maxTokens: 0,
  usedTokens: 0,
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function ContextBarComponent({
  compact: _compact,
  sessionId,
}: {
  compact?: boolean
  sessionId?: string
}) {
  const [ctx, setCtx] = useState<ContextData>(EMPTY)
  const [showLabel, setShowLabel] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const params = sessionId
        ? `?sessionId=${encodeURIComponent(sessionId)}`
        : ''
      const res = await fetch(`/api/context-usage${params}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.ok) {
        setCtx({
          contextPercent: data.contextPercent ?? 0,
          model: data.model ?? '',
          maxTokens: data.maxTokens ?? 0,
          usedTokens: data.usedTokens ?? 0,
        })
      }
    } catch {
      /* ignore */
    }
  }, [sessionId])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(refresh, POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  useEffect(() => {
    if (!showLabel) return
    const id = setTimeout(() => setShowLabel(false), 3000)
    return () => clearTimeout(id)
  }, [showLabel])

  const pct = ctx.contextPercent
  const clampedPct = Math.min(Math.max(pct, 0), 100)

  // Hide only before any model/context info has loaded.
  if (ctx.maxTokens <= 0 && ctx.usedTokens <= 0 && !ctx.model) return null
  const isCritical = clampedPct > 90
  const isDanger = clampedPct >= 75 && clampedPct <= 90
  const isWarning = clampedPct >= 50 && clampedPct < 75

  // Theme-token driven so the bar matches the active theme (was hardcoded
  // red/orange/yellow/emerald). Three severity levels: success → warning → danger.
  const fillColor =
    isCritical || isDanger
      ? 'var(--theme-danger)'
      : isWarning
        ? 'var(--theme-warning)'
        : 'var(--theme-success)'
  const trackColor = `color-mix(in srgb, ${fillColor} 16%, transparent)`

  if (isMobile) {
    return (
      <div className="relative w-full">
        {/* Invisible tap target */}
        <button
          type="button"
          className="absolute inset-x-0 -top-2 -bottom-2 z-10"
          onClick={() => setShowLabel((prev) => !prev)}
          aria-label={`Context: ${Math.round(clampedPct)}% used`}
        />
        {/* Bar — always 3px, never moves */}
        <div className="w-full h-[3px]" style={{ background: trackColor }}>
          <div
            className="h-full transition-all duration-700 ease-out"
            style={{ width: `${clampedPct}%`, background: fillColor }}
          />
        </div>
        {/* Label floats below bar on tap */}
        {showLabel && (
          <div className="absolute right-2 top-[5px] z-20 flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary-900/85 shadow-sm animate-in fade-in duration-150">
            <span className="text-[10px] font-semibold tabular-nums text-white">
              {Math.round(clampedPct)}%
            </span>
            <span className="text-[9px] text-white/70 tabular-nums">
              {formatTokens(ctx.usedTokens)}/{formatTokens(ctx.maxTokens)}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <PreviewCard>
      <PreviewCardTrigger className="block w-full cursor-pointer">
        <div
          className="shrink-0 w-full h-2 transition-colors duration-300 relative"
          style={{ background: trackColor }}
        >
          <div
            className="h-full transition-all duration-700 ease-out"
            style={{ width: `${clampedPct}%`, background: fillColor }}
          />
          {/* % shown on hover via popup only */}
        </div>
      </PreviewCardTrigger>

      <PreviewCardPopup
        align="center"
        sideOffset={2}
        className="w-64 px-3 py-2.5 rounded-lg"
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-primary-900">
              Context Window
            </span>
            <span
              className="text-[11px] font-semibold tabular-nums"
              style={{ color: fillColor }}
            >
              {Math.round(clampedPct)}%
            </span>
          </div>
          <div
            className="w-full h-2 rounded-full overflow-hidden"
            style={{ background: trackColor }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${clampedPct}%`, background: fillColor }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-primary-500 tabular-nums">
              {formatTokens(ctx.usedTokens)} / {formatTokens(ctx.maxTokens)}{' '}
              tokens
            </span>
            {ctx.model && (
              <span className="text-[10px] text-primary-400 truncate max-w-[100px]">
                {ctx.model}
              </span>
            )}
          </div>
          {isCritical && (
            <p
              className="text-[10px] font-medium"
              style={{ color: 'var(--theme-danger)' }}
            >
              Context almost full — consider starting a new chat
            </p>
          )}
        </div>
      </PreviewCardPopup>
    </PreviewCard>
  )
}

export const ContextBar = memo(ContextBarComponent)
