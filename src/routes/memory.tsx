import { Suspense, lazy, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import BackendUnavailableState from '@/components/backend-unavailable-state'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs'
import { useFeatureAvailable } from '@/hooks/use-feature-available'
import { usePageTitle } from '@/hooks/use-page-title'
import { getUnavailableReason } from '@/lib/feature-gates'

const MemoryBrowserScreen = lazy(async () => {
  const module = await import('@/screens/memory/memory-browser-screen')
  return { default: module.MemoryBrowserScreen }
})

const KnowledgeBrowserScreen = lazy(async () => {
  const module = await import('@/screens/memory/knowledge-browser-screen')
  return { default: module.KnowledgeBrowserScreen }
})

const HonchoBrowserScreen = lazy(async () => {
  const module = await import('@/screens/memory/honcho-browser-screen')
  return { default: module.HonchoBrowserScreen }
})

type MemoryTab = 'memory' | 'knowledge' | 'honcho'

export const Route = createFileRoute('/memory')({
  ssr: false,
  component: function MemoryRoute() {
    const [tab, setTab] = useState<MemoryTab>('memory')
    const memoryAvailable = useFeatureAvailable('memory')

    // Honcho tab appears only when the workspace can see a configured
    // Honcho install. Cheap probe — the route returns {enabled:false}
    // when there's no honcho.json, no spinner needed.
    const honchoQuery = useQuery({
      queryKey: ['honcho', 'enabled'],
      queryFn: async () => {
        const res = await fetch('/api/honcho/health')
        if (!res.ok) return { enabled: false }
        return (await res.json()) as { enabled?: boolean }
      },
      staleTime: 60_000,
      retry: false,
    })
    const honchoEnabled = Boolean(honchoQuery.data?.enabled)

    usePageTitle('Memory')

    return (
      <div className="flex h-full min-h-0 flex-col">
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as MemoryTab)}
          className="h-full min-h-0 gap-0"
        >
          <div className="border-b border-primary-200 px-3 pt-3 dark:border-neutral-800 md:px-4 md:pt-4">
            <TabsList
              variant="underline"
              className="w-full justify-start gap-1"
            >
              <TabsTab value="memory">Memory</TabsTab>
              <TabsTab value="knowledge">Knowledge</TabsTab>
              {honchoEnabled ? (
                <TabsTab value="honcho">Honcho</TabsTab>
              ) : null}
            </TabsList>
          </div>

          <TabsPanel value="memory" className="min-h-0 flex-1">
            {tab === 'memory' ? (
              <Suspense
                fallback={
                  <RouteLoadingState label="Loading memory browser..." />
                }
              >
                {memoryAvailable ? (
                  <MemoryBrowserScreen />
                ) : (
                  <BackendUnavailableState
                    feature="Memory"
                    description={getUnavailableReason('Memory')}
                  />
                )}
              </Suspense>
            ) : null}
          </TabsPanel>

          <TabsPanel value="knowledge" className="min-h-0 flex-1">
            {tab === 'knowledge' ? (
              <Suspense
                fallback={
                  <RouteLoadingState label="Loading knowledge browser..." />
                }
              >
                <KnowledgeBrowserScreen />
              </Suspense>
            ) : null}
          </TabsPanel>

          {honchoEnabled ? (
            <TabsPanel value="honcho" className="min-h-0 flex-1">
              {tab === 'honcho' ? (
                <Suspense
                  fallback={
                    <RouteLoadingState label="Loading Honcho browser..." />
                  }
                >
                  <HonchoBrowserScreen />
                </Suspense>
              ) : null}
            </TabsPanel>
          ) : null}
        </Tabs>
      </div>
    )
  },
})

function RouteLoadingState({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center px-4 text-sm text-primary-500 dark:text-neutral-400">
      {label}
    </div>
  )
}
