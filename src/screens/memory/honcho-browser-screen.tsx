import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ScrollAreaCorner,
  ScrollAreaRoot,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

type HonchoHealth = {
  ok: boolean
  enabled: boolean
  reachable: boolean
  baseUrl: string | null
  workspaceId: string
  aiPeer?: string
  userPeer?: string
  status?: string | null
  error?: string | null
}

type HonchoPeer = {
  id: string
  workspace_id: string
  created_at: string
  metadata?: Record<string, unknown>
}

type HonchoSession = {
  id: string
  workspace_id: string
  created_at: string
}

type HonchoConclusion = {
  id: string
  content?: string
  created_at?: string
  metadata?: Record<string, unknown>
}

type HonchoSubTab = 'peers' | 'sessions' | 'conclusions'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(body || `Request failed (${res.status})`)
  }
  return (await res.json()) as T
}

function formatTimestamp(value?: string | null): string {
  if (!value) return ''
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

function StatusBanner({ health }: { health: HonchoHealth }) {
  if (!health.enabled) {
    return (
      <div className="rounded-lg border border-primary-200 bg-primary-100/40 p-3 text-xs text-primary-600">
        Honcho is not enabled in <code>~/.hermes/honcho.json</code>. Add an
        entry with <code>enabled: true</code> and a <code>baseUrl</code> to
        light up this view.
      </div>
    )
  }
  if (!health.reachable) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-700 dark:bg-red-900/20">
        Honcho is configured ({health.baseUrl}) but unreachable.
        {health.error ? <> Last error: <code>{health.error}</code></> : null}
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-700 dark:bg-emerald-900/20">
      Honcho connected · workspace{' '}
      <code className="font-semibold">{health.workspaceId}</code> · ai peer{' '}
      <code>{health.aiPeer}</code> · user peer <code>{health.userPeer}</code>
    </div>
  )
}

function PeersTab() {
  const [selected, setSelected] = useState<string | null>(null)

  const listQuery = useQuery({
    queryKey: ['honcho', 'peers'],
    queryFn: () =>
      fetchJson<{ peers: Array<HonchoPeer>; total: number }>(
        '/api/honcho/peers',
      ),
    staleTime: 30_000,
  })

  const detailQuery = useQuery({
    queryKey: ['honcho', 'peer', selected],
    enabled: Boolean(selected),
    queryFn: () =>
      fetchJson<{
        peer: HonchoPeer
        card: unknown
        representation: unknown
      }>(`/api/honcho/peers?id=${encodeURIComponent(selected!)}`),
  })

  return (
    <div className="grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)] gap-3">
      <div className="rounded-lg border border-primary-200 dark:border-neutral-800">
        <div className="border-b border-primary-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-primary-500 dark:border-neutral-800">
          Peers {listQuery.data ? `(${listQuery.data.total})` : null}
        </div>
        <ScrollAreaRoot className="h-[calc(100%-2.25rem)]">
          <ScrollAreaViewport>
            {listQuery.isLoading ? (
              <p className="px-3 py-2 text-xs text-primary-500">Loading…</p>
            ) : listQuery.error ? (
              <p className="px-3 py-2 text-xs text-red-600">
                {(listQuery.error as Error).message}
              </p>
            ) : (listQuery.data?.peers ?? []).length === 0 ? (
              <p className="px-3 py-2 text-xs text-primary-500">
                No peers yet.
              </p>
            ) : (
              <ul>
                {listQuery.data!.peers.map((peer) => (
                  <li key={peer.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(peer.id)}
                      className={cn(
                        'flex w-full flex-col items-start gap-0.5 border-b border-primary-100 px-3 py-2 text-left hover:bg-primary-100/60 dark:border-neutral-800',
                        selected === peer.id &&
                          'bg-accent-100 text-accent-900',
                      )}
                    >
                      <span className="truncate text-sm font-medium">
                        {peer.id}
                      </span>
                      <span className="text-[10px] text-primary-400">
                        {formatTimestamp(peer.created_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollAreaViewport>
          <ScrollAreaScrollbar orientation="vertical">
            <ScrollAreaThumb />
          </ScrollAreaScrollbar>
          <ScrollAreaCorner />
        </ScrollAreaRoot>
      </div>

      <div className="min-h-0 rounded-lg border border-primary-200 dark:border-neutral-800">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-xs text-primary-400">
            Select a peer to view its card and representation.
          </div>
        ) : detailQuery.isLoading ? (
          <div className="p-3 text-xs text-primary-500">Loading…</div>
        ) : detailQuery.error ? (
          <div className="p-3 text-xs text-red-600">
            {(detailQuery.error as Error).message}
          </div>
        ) : detailQuery.data ? (
          <ScrollAreaRoot className="h-full">
            <ScrollAreaViewport>
              <div className="space-y-4 p-3">
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                    Peer
                  </h3>
                  <p className="mt-1 font-mono text-sm">
                    {detailQuery.data.peer.id}
                  </p>
                  <p className="text-[11px] text-primary-400">
                    Created {formatTimestamp(detailQuery.data.peer.created_at)}
                  </p>
                </section>
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                    Card
                  </h3>
                  <pre className="mt-1 overflow-x-auto rounded-md bg-primary-100/40 p-2 text-[11px] dark:bg-neutral-900/40">
                    {detailQuery.data.card
                      ? JSON.stringify(detailQuery.data.card, null, 2)
                      : 'No card yet — Honcho will build one as messages accumulate.'}
                  </pre>
                </section>
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                    Representation
                  </h3>
                  <pre className="mt-1 overflow-x-auto rounded-md bg-primary-100/40 p-2 text-[11px] dark:bg-neutral-900/40">
                    {detailQuery.data.representation
                      ? JSON.stringify(
                          detailQuery.data.representation,
                          null,
                          2,
                        )
                      : 'No representation yet.'}
                  </pre>
                </section>
              </div>
            </ScrollAreaViewport>
            <ScrollAreaScrollbar orientation="vertical">
              <ScrollAreaThumb />
            </ScrollAreaScrollbar>
            <ScrollAreaCorner />
          </ScrollAreaRoot>
        ) : null}
      </div>
    </div>
  )
}

function SessionsTab() {
  const [selected, setSelected] = useState<string | null>(null)

  const listQuery = useQuery({
    queryKey: ['honcho', 'sessions'],
    queryFn: () =>
      fetchJson<{ sessions: Array<HonchoSession>; total: number }>(
        '/api/honcho/sessions',
      ),
    staleTime: 30_000,
  })

  const detailQuery = useQuery({
    queryKey: ['honcho', 'session', selected],
    enabled: Boolean(selected),
    queryFn: () =>
      fetchJson<{
        session: HonchoSession
        messages: Array<Record<string, unknown>>
        messagesTotal: number
        summaries: unknown
      }>(`/api/honcho/sessions?id=${encodeURIComponent(selected!)}`),
  })

  return (
    <div className="grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)] gap-3">
      <div className="rounded-lg border border-primary-200 dark:border-neutral-800">
        <div className="border-b border-primary-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-primary-500 dark:border-neutral-800">
          Sessions {listQuery.data ? `(${listQuery.data.total})` : null}
        </div>
        <ScrollAreaRoot className="h-[calc(100%-2.25rem)]">
          <ScrollAreaViewport>
            {listQuery.isLoading ? (
              <p className="px-3 py-2 text-xs text-primary-500">Loading…</p>
            ) : listQuery.error ? (
              <p className="px-3 py-2 text-xs text-red-600">
                {(listQuery.error as Error).message}
              </p>
            ) : (listQuery.data?.sessions ?? []).length === 0 ? (
              <p className="px-3 py-2 text-xs text-primary-500">
                No sessions yet.
              </p>
            ) : (
              <ul>
                {listQuery.data!.sessions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(session.id)}
                      className={cn(
                        'flex w-full flex-col items-start gap-0.5 border-b border-primary-100 px-3 py-2 text-left hover:bg-primary-100/60 dark:border-neutral-800',
                        selected === session.id &&
                          'bg-accent-100 text-accent-900',
                      )}
                    >
                      <span className="truncate font-mono text-xs">
                        {session.id}
                      </span>
                      <span className="text-[10px] text-primary-400">
                        {formatTimestamp(session.created_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollAreaViewport>
          <ScrollAreaScrollbar orientation="vertical">
            <ScrollAreaThumb />
          </ScrollAreaScrollbar>
          <ScrollAreaCorner />
        </ScrollAreaRoot>
      </div>

      <div className="min-h-0 rounded-lg border border-primary-200 dark:border-neutral-800">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-xs text-primary-400">
            Select a session to inspect messages and summaries.
          </div>
        ) : detailQuery.isLoading ? (
          <div className="p-3 text-xs text-primary-500">Loading…</div>
        ) : detailQuery.error ? (
          <div className="p-3 text-xs text-red-600">
            {(detailQuery.error as Error).message}
          </div>
        ) : detailQuery.data ? (
          <ScrollAreaRoot className="h-full">
            <ScrollAreaViewport>
              <div className="space-y-4 p-3">
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                    Session
                  </h3>
                  <p className="mt-1 font-mono text-sm">
                    {detailQuery.data.session.id}
                  </p>
                  <p className="text-[11px] text-primary-400">
                    Created{' '}
                    {formatTimestamp(detailQuery.data.session.created_at)} ·{' '}
                    {detailQuery.data.messagesTotal} messages
                  </p>
                </section>
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                    Summaries
                  </h3>
                  <pre className="mt-1 overflow-x-auto rounded-md bg-primary-100/40 p-2 text-[11px] dark:bg-neutral-900/40">
                    {detailQuery.data.summaries
                      ? JSON.stringify(detailQuery.data.summaries, null, 2)
                      : 'No summaries.'}
                  </pre>
                </section>
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                    Messages
                  </h3>
                  {detailQuery.data.messages.length === 0 ? (
                    <p className="mt-1 text-xs text-primary-400">No messages.</p>
                  ) : (
                    <ul className="mt-1 space-y-2">
                      {detailQuery.data.messages.map((msg, idx) => (
                        <li
                          key={String(
                            (msg as { id?: unknown }).id ?? idx,
                          )}
                          className="rounded-md border border-primary-200 bg-primary-50/50 p-2 dark:border-neutral-800 dark:bg-neutral-900/40"
                        >
                          <div className="mb-1 flex items-center gap-2 text-[10px] text-primary-500">
                            <span className="font-semibold">
                              {String(
                                (msg as { peer_id?: unknown }).peer_id ??
                                  'unknown',
                              )}
                            </span>
                            <span>
                              {formatTimestamp(
                                (msg as { created_at?: string }).created_at,
                              )}
                            </span>
                          </div>
                          <div className="whitespace-pre-wrap text-xs">
                            {String(
                              (msg as { content?: unknown }).content ?? '',
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </ScrollAreaViewport>
            <ScrollAreaScrollbar orientation="vertical">
              <ScrollAreaThumb />
            </ScrollAreaScrollbar>
            <ScrollAreaCorner />
          </ScrollAreaRoot>
        ) : null}
      </div>
    </div>
  )
}

function ConclusionsTab() {
  const query = useQuery({
    queryKey: ['honcho', 'conclusions'],
    queryFn: () =>
      fetchJson<{ conclusions: Array<HonchoConclusion>; total: number }>(
        '/api/honcho/conclusions',
      ),
    staleTime: 30_000,
  })

  if (query.isLoading) {
    return <p className="p-3 text-xs text-primary-500">Loading…</p>
  }
  if (query.error) {
    return (
      <p className="p-3 text-xs text-red-600">
        {(query.error as Error).message}
      </p>
    )
  }
  const items = query.data?.conclusions ?? []
  if (items.length === 0) {
    return (
      <p className="p-3 text-xs text-primary-500">
        No conclusions yet. The Honcho deriver writes these as it learns from
        sessions — give it some conversations first.
      </p>
    )
  }
  return (
    <ScrollAreaRoot className="h-full">
      <ScrollAreaViewport>
        <ul className="space-y-2 p-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-md border border-primary-200 bg-primary-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-900/40"
            >
              <div className="mb-1 flex items-center gap-2 text-[10px] text-primary-500">
                <span className="font-mono">{item.id}</span>
                {item.created_at ? (
                  <span>{formatTimestamp(item.created_at)}</span>
                ) : null}
              </div>
              <div className="whitespace-pre-wrap text-xs text-primary-800 dark:text-primary-100">
                {item.content || '(no content)'}
              </div>
              {item.metadata && Object.keys(item.metadata).length > 0 ? (
                <pre className="mt-2 overflow-x-auto rounded bg-primary-100/40 p-2 text-[10px] dark:bg-neutral-950/40">
                  {JSON.stringify(item.metadata, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      </ScrollAreaViewport>
      <ScrollAreaScrollbar orientation="vertical">
        <ScrollAreaThumb />
      </ScrollAreaScrollbar>
      <ScrollAreaCorner />
    </ScrollAreaRoot>
  )
}

export function HonchoBrowserScreen() {
  const healthQuery = useQuery({
    queryKey: ['honcho', 'health'],
    queryFn: () => fetchJson<HonchoHealth>('/api/honcho/health'),
    staleTime: 60_000,
  })
  const [tab, setTab] = useState<HonchoSubTab>('peers')

  const health = healthQuery.data
  const ready = useMemo(
    () => Boolean(health?.enabled && health.reachable),
    [health],
  )

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 md:p-4">
      {healthQuery.isLoading ? (
        <p className="text-xs text-primary-500">Checking Honcho…</p>
      ) : healthQuery.error ? (
        <p className="text-xs text-red-600">
          {(healthQuery.error as Error).message}
        </p>
      ) : health ? (
        <StatusBanner health={health} />
      ) : null}

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as HonchoSubTab)}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        <TabsList variant="underline" className="w-full justify-start gap-1">
          <TabsTab value="peers">Peers</TabsTab>
          <TabsTab value="sessions">Sessions</TabsTab>
          <TabsTab value="conclusions">Conclusions</TabsTab>
        </TabsList>

        <TabsPanel value="peers" className="min-h-0 flex-1">
          {tab === 'peers' && ready ? <PeersTab /> : null}
        </TabsPanel>
        <TabsPanel value="sessions" className="min-h-0 flex-1">
          {tab === 'sessions' && ready ? <SessionsTab /> : null}
        </TabsPanel>
        <TabsPanel value="conclusions" className="min-h-0 flex-1">
          {tab === 'conclusions' && ready ? <ConclusionsTab /> : null}
        </TabsPanel>
      </Tabs>
    </div>
  )
}
