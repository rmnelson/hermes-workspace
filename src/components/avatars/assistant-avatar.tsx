import type { CSSProperties } from 'react'
import { memo, useState } from 'react'
import { cn } from '@/lib/utils'

type AvatarProps = {
  size?: number
  className?: string
  // Extra inline style; merged after the size/radius defaults so callers
  // can override borderRadius, add a border/padding/background, etc.
  style?: CSSProperties
}

/**
 * Assistant avatar — Hermes Agent caduceus on Nous blue.
 *
 * Falls back to an inline mark when /claude-avatar.webp fails to load
 * (privacy filters / strict tracking protection can block paths that look
 * tracking-pixel-shaped). The fallback keeps shape and size so it doesn't
 * regress to the browser's broken-image placeholder, which would render
 * the alt text "Hermes Agent" inside the box.
 */
function AssistantAvatarComponent({ size = 28, className, style }: AvatarProps) {
  const [errored, setErrored] = useState(false)
  const radius = Math.max(4, Math.round(size * 0.15))

  if (errored) {
    return (
      <span
        role="img"
        aria-label="Hermes Agent"
        className={cn(
          'shrink-0 inline-flex items-center justify-center bg-accent-500/15 text-accent-600',
          className,
        )}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          fontSize: Math.round(size * 0.55),
          lineHeight: 1,
          fontWeight: 600,
          ...style,
        }}
      >
        H
      </span>
    )
  }

  return (
    <img
      src="/claude-avatar.webp"
      alt=""
      aria-label="Hermes Agent"
      role="img"
      className={cn('shrink-0', className)}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        ...style,
      }}
      onError={() => setErrored(true)}
    />
  )
}

export const AssistantAvatar = memo(AssistantAvatarComponent)
