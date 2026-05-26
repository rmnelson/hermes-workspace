import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { fetchHoncho, getHonchoConfig } from '../../../server/honcho-proxy'

export const Route = createFileRoute('/api/honcho/search')({
  server: {
    handlers: {
      // GET /api/honcho/search?q=<query>
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const config = getHonchoConfig()
        if (!config.enabled) {
          return json({ ok: false, error: 'Honcho is not enabled.' }, { status: 503 })
        }

        const url = new URL(request.url)
        const query = url.searchParams.get('q')?.trim() || ''
        const workspaceId = url.searchParams.get('workspace')?.trim() || config.workspaceId
        if (!query) {
          return json({ ok: true, results: [] })
        }

        const result = await fetchHoncho<{ items?: Array<unknown> }>(
          `/v3/workspaces/${encodeURIComponent(workspaceId)}/search`,
          { method: 'POST', body: { query } },
        )
        if (!result.ok) {
          return json({ ok: false, error: result.error }, { status: result.status })
        }
        return json({ ok: true, results: result.data.items ?? [] })
      },
    },
  },
})
