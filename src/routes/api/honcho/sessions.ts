import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { fetchHoncho, getHonchoConfig } from '../../../server/honcho-proxy'

type HonchoSession = {
  id: string
  workspace_id: string
  created_at: string
  metadata?: Record<string, unknown>
  configuration?: Record<string, unknown>
}

type HonchoPaged<T> = {
  items?: Array<T>
  total?: number
  page?: number
  size?: number
}

export const Route = createFileRoute('/api/honcho/sessions')({
  server: {
    handlers: {
      // GET /api/honcho/sessions                  — list sessions
      // GET /api/honcho/sessions?id=<sessionId>   — detail (messages + summaries)
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const config = getHonchoConfig()
        if (!config.enabled) {
          return json({ ok: false, error: 'Honcho is not enabled.' }, { status: 503 })
        }

        const url = new URL(request.url)
        const sessionId = url.searchParams.get('id')?.trim()
        const workspaceId = url.searchParams.get('workspace')?.trim() || config.workspaceId

        if (sessionId) {
          // Honcho has no GET /sessions/{id} — only DELETE/PUT. Session
          // metadata comes from the /sessions/list response (cached on the
          // client). This detail call returns only the sub-resources.
          const [messagesRes, summariesRes] = await Promise.all([
            fetchHoncho<HonchoPaged<unknown>>(
              `/v3/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/messages/list`,
              { method: 'POST', body: {} },
            ),
            fetchHoncho<unknown>(
              `/v3/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(sessionId)}/summaries`,
            ),
          ])
          return json({
            ok: true,
            sessionId,
            messages: messagesRes.ok ? (messagesRes.data.items ?? []) : [],
            messagesTotal: messagesRes.ok ? (messagesRes.data.total ?? 0) : 0,
            summaries: summariesRes.ok ? summariesRes.data : null,
            messagesError: messagesRes.ok ? null : messagesRes.error,
            summariesError: summariesRes.ok ? null : summariesRes.error,
          })
        }

        const list = await fetchHoncho<HonchoPaged<HonchoSession>>(
          `/v3/workspaces/${encodeURIComponent(workspaceId)}/sessions/list`,
          { method: 'POST', body: {} },
        )
        if (!list.ok) {
          return json({ ok: false, error: list.error }, { status: list.status })
        }
        return json({
          ok: true,
          sessions: list.data.items ?? [],
          total: list.data.total ?? 0,
        })
      },
    },
  },
})
