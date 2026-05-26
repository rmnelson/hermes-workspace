import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { fetchHoncho, getHonchoConfig } from '../../../server/honcho-proxy'

type HonchoConclusion = {
  id: string
  workspace_id?: string
  content?: string
  created_at?: string
  metadata?: Record<string, unknown>
}

type HonchoPaged<T> = {
  items?: Array<T>
  total?: number
}

export const Route = createFileRoute('/api/honcho/conclusions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const config = getHonchoConfig()
        if (!config.enabled) {
          return json({ ok: false, error: 'Honcho is not enabled.' }, { status: 503 })
        }

        const url = new URL(request.url)
        const workspaceId = url.searchParams.get('workspace')?.trim() || config.workspaceId

        const list = await fetchHoncho<HonchoPaged<HonchoConclusion>>(
          `/v3/workspaces/${encodeURIComponent(workspaceId)}/conclusions/list`,
          { method: 'POST', body: {} },
        )
        if (!list.ok) {
          return json({ ok: false, error: list.error }, { status: list.status })
        }
        return json({
          ok: true,
          conclusions: list.data.items ?? [],
          total: list.data.total ?? 0,
        })
      },
    },
  },
})
