'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export type ChatContainerApi = {
  /** Scroll to the bottom and re-engage follow mode. */
  scrollToBottom: (behavior?: ScrollBehavior) => void
  /** Stop following the bottom (e.g. when jumping to an earlier message). */
  releaseFollow: () => void
}

export type ChatContainerRootProps = {
  children: React.ReactNode
  overlay?: React.ReactNode
  className?: string
  /** Initial follow-the-bottom state. Follow is owned internally afterwards. */
  stickToBottom?: boolean
  /** Imperative handle for explicit scroll/follow commands from the parent. */
  apiRef?: React.Ref<ChatContainerApi>
  onUserScroll?: (metrics: {
    scrollTop: number
    scrollHeight: number
    clientHeight: number
  }) => void
} & React.HTMLAttributes<HTMLDivElement>

export type ChatContainerContentProps = {
  children: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLDivElement>

export type ChatContainerScrollAnchorProps = {
  className?: string
  ref?: React.Ref<HTMLDivElement>
} & React.HTMLAttributes<HTMLDivElement>

const NEAR_BOTTOM_THRESHOLD = 200

/** Window after a user input gesture during which scroll events are treated as
 * user-initiated rather than programmatic. */
const USER_GESTURE_WINDOW_MS = 250

/**
 * Decide the next "follow the bottom" state from a single scroll event.
 *
 * The crux of the streaming-scroll fix: a programmatic scroll (the streaming
 * re-anchor, or any scrollTo we issue) fires the same scroll handler as a real
 * user scroll. If we let those re-enable follow whenever they land near the
 * bottom, the app yanks the user back down every token. So only genuine user
 * gestures may change follow state; programmatic scrolls leave it untouched.
 */
export function nextStickToBottom({
  isUserGesture,
  distanceFromBottom,
  scrolledUp,
  threshold,
  current,
}: {
  isUserGesture: boolean
  distanceFromBottom: number
  scrolledUp: boolean
  threshold: number
  current: boolean
}): boolean {
  if (!isUserGesture) return current
  if (scrolledUp && distanceFromBottom > threshold) return false
  if (distanceFromBottom <= threshold) return true
  return current
}

function ChatContainerRoot({
  children,
  overlay,
  className,
  stickToBottom = true,
  apiRef,
  onUserScroll,
  ...props
}: ChatContainerRootProps) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = React.useRef(stickToBottom)
  const lastScrollTopRef = React.useRef(0)
  // Timestamp of the most recent genuine user input gesture. A scroll event that
  // fires within USER_GESTURE_WINDOW_MS of a gesture is user-initiated; all other
  // scroll events are programmatic (our own scrollTo / streaming re-anchor) and
  // must not change follow state — otherwise the app yanks the user back down.
  const lastGestureRef = React.useRef(0)

  const scrollToBottom = React.useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const element = scrollRef.current
      if (!element) return
      stickToBottomRef.current = true
      element.scrollTo({ top: element.scrollHeight, behavior })
    },
    [],
  )

  React.useImperativeHandle(
    apiRef,
    () => ({
      scrollToBottom,
      releaseFollow: () => {
        stickToBottomRef.current = false
      },
    }),
    [scrollToBottom],
  )

  // Record genuine user input gestures so the scroll handler can tell them apart
  // from programmatic scrolls.
  React.useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return

    const markGesture = () => {
      lastGestureRef.current = Date.now()
    }
    const SCROLL_KEYS = new Set([
      'ArrowUp',
      'ArrowDown',
      'PageUp',
      'PageDown',
      'Home',
      'End',
      ' ',
      'Spacebar',
    ])
    const markKeyGesture = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) lastGestureRef.current = Date.now()
    }

    element.addEventListener('wheel', markGesture, { passive: true })
    element.addEventListener('touchstart', markGesture, { passive: true })
    element.addEventListener('touchmove', markGesture, { passive: true })
    element.addEventListener('keydown', markKeyGesture)
    return () => {
      element.removeEventListener('wheel', markGesture)
      element.removeEventListener('touchstart', markGesture)
      element.removeEventListener('touchmove', markGesture)
      element.removeEventListener('keydown', markKeyGesture)
    }
  }, [])

  React.useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return

    const handleScroll = () => {
      const distanceFromBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight
      const scrolledUp = element.scrollTop < lastScrollTopRef.current - 5
      lastScrollTopRef.current = element.scrollTop
      const isUserGesture =
        Date.now() - lastGestureRef.current < USER_GESTURE_WINDOW_MS

      stickToBottomRef.current = nextStickToBottom({
        isUserGesture,
        distanceFromBottom,
        scrolledUp,
        threshold: NEAR_BOTTOM_THRESHOLD,
        current: stickToBottomRef.current,
      })

      onUserScroll?.({
        scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      })
    }

    element.addEventListener('scroll', handleScroll, { passive: true })
    return () => element.removeEventListener('scroll', handleScroll)
  }, [onUserScroll])

  // ResizeObserver: re-anchor to bottom when content expands
  React.useLayoutEffect(() => {
    const viewport = scrollRef.current
    if (!viewport || typeof ResizeObserver === 'undefined') return

    let resizeObserver: ResizeObserver | null = null

    const initObserver = () => {
      const content = viewport.firstElementChild
      if (!(content instanceof HTMLElement)) {
        // Content not ready yet, retry after next frame
        requestAnimationFrame(initObserver)
        return
      }

      let previousHeight = content.getBoundingClientRect().height

      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        const nextHeight = entry.contentRect.height
        const heightDelta = nextHeight - previousHeight
        if (heightDelta === 0) return

        // Re-anchor to bottom when content grows and we're in stick-to-bottom mode.
        // stickToBottomRef tracks actual scroll position (set false when user scrolls up),
        // so this won't fight user scroll.
        if (heightDelta > 0 && stickToBottomRef.current) {
          viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'auto' })
        }

        previousHeight = nextHeight
      })

      resizeObserver.observe(content)
    }

    // Use requestAnimationFrame to ensure content is mounted before observing
    requestAnimationFrame(initObserver)

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
    }
  }, [])

  return (
    <div
      className={cn(
        'relative flex-1 min-h-0 overflow-hidden flex flex-col',
        className,
      )}
    >
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
        style={{ overflowAnchor: 'none' }}
        data-chat-scroll-viewport
        {...props}
      >
        {children}
      </div>
      {overlay}
    </div>
  )
}

function ChatContainerContent({
  children,
  className,
  ...props
}: ChatContainerContentProps) {
  return (
    <div
      className={cn('flex w-full flex-col min-h-full', className)}
      {...props}
    >
      <div
        className="mx-auto w-full px-3 sm:px-5 flex flex-col"
        style={{ maxWidth: 'min(var(--chat-content-max-width), 100%)' }}
      >
        <div className="flex flex-col space-y-3">{children}</div>
      </div>
    </div>
  )
}

function ChatContainerScrollAnchor({
  ...props
}: ChatContainerScrollAnchorProps) {
  return (
    <div
      className="h-px w-full shrink-0 scroll-mt-2 pt-2 pb-1 md:scroll-mt-4 md:pt-8 md:pb-4"
      style={{ overflowAnchor: 'auto' }}
      aria-hidden="true"
      {...props}
    />
  )
}

export { ChatContainerRoot, ChatContainerContent, ChatContainerScrollAnchor }
