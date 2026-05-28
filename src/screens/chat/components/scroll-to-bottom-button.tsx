import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Render a native <button> via motion rather than motion.create(Button): the
// base-ui Button is a useRender (non-forwardRef) component, and wrapping it in
// motion.create can leave motion's ref — and the onClick — attached to a node it
// doesn't actually control, so clicks silently no-op. A native motion.button
// guarantees the handler reaches the DOM. Styling is kept identical via
// buttonVariants (ghost / icon-sm).
const MotionButton = motion.button

type ScrollToBottomButtonProps = {
  className?: string
  isVisible: boolean
  unreadCount: number
  onClick: () => void
}

function ScrollToBottomButton({
  className,
  isVisible,
  unreadCount,
  onClick,
}: ScrollToBottomButtonProps) {
  return (
    <AnimatePresence>
      {isVisible ? (
        <MotionButton
          type="button"
          aria-label="Scroll to bottom"
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
            'pointer-events-auto relative rounded-full text-white shadow-lg transition-colors hover:opacity-90',
            className,
          )}
          style={{
            background: 'var(--theme-accent)',
            boxShadow:
              '0 4px 12px color-mix(in srgb, var(--theme-accent) 35%, transparent)',
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={onClick}
        >
          <HugeiconsIcon icon={ArrowDown01Icon} size={20} strokeWidth={1.5} />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary-900 px-1.5 text-xs font-medium tabular-nums text-primary-50">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </MotionButton>
      ) : null}
    </AnimatePresence>
  )
}

export { ScrollToBottomButton }
