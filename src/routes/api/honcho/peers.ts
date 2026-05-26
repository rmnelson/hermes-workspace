import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { fetchHoncho, getHonchoConfig } from '../../../server/honcho-proxy'

type HonchoPeer = {
  id: string
  workspace_id: string
  created_at: string
  metadata?: Record<string, unknown>
  configuration?: Record<string, unknown>
}

type HonchoPagedPeers = {
  items?: Array<HonchoPeer>
  total?: number
  page?: number
  size?: number
}

export const Route = createFileRoute('/api/honcho/peers')({
  server: {
    handlers: {
      // GET /api/honcho/peers           — list all peers in the default workspace
      // GET /api/honcho/peers?id=<peerId> — detail (peer + card + representation)
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const config = getHonchoConfig()
        if (!config.enabled) {
          return json({ ok: false, error: 'Honcho is not enabled.' }, { status: 503 })
        }

        const url = new URL(request.url)
        const peerId = url.searchParams.get('id')?.trim()
        const workspaceId = url.searchParams.get('workspace')?.trim() || config.workspaceId

        if (peerId) {
          const [peerRes, cardRes, repRes] = await Promise.all([
            fetchHoncho<HonchoPeer>(
              `/v3/workspaces/${encodeURIComponent(workspaceId)}/peers/${encodeURIComponent(peerId)}`,
            ),
            fetchHoncho<unknown>(
              `/v3/workspaces/${encodeURIComponent(workspaceId)}/peers/${encodeURIComponent(peerId)}/card`,
            ),
            fetchHoncho<unknown>(
              `/v3/workspaces/${encodeURIComponent(workspaceId)}/peers/${encodeURIComponent(peerId)}/representation`,
            ),
          ])
          if (!peerRes.ok) {
            return json({ ok: false, error: peerRes.error }, { status: peerRes.status })
          }
          return json({
            ok: true,
            peer: peerRes.data,
            card: cardRes.ok ? cardRes.data : null,
            representation: repRes.ok ? repRes.data : null,
            cardError: cardRes.ok ? null : cardRes.error,
            representationError: repRes.ok ? null : repRes.error,
          })
        }

        const list = await fetchHoncho<HonchoPagedPeers>(
          `/v3/workspaces/${encodeURIComponent(workspaceId)}/peers/list`,
          { method: 'POST', body: {} },
        )
        if (!list.ok) {
          return json({ ok: false, error: list.error }, { status: list.status })
        }
        return json({
          ok: true,
          peers: list.data.items ?? [],
          total: list.data.total ?? 0,
        })
      },
    },
  },
})
