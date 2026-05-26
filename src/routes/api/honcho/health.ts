import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { fetchHoncho, getHonchoConfig } from '../../../server/honcho-proxy'

export const Route = createFileRoute('/api/honcho/health')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const config = getHonchoConfig()
        if (!config.enabled) {
          return json({
            ok: true,
            enabled: false,
            baseUrl: config.baseUrl,
            workspaceId: config.workspaceId,
            reachable: false,
          })
        }

        const probe = await fetchHoncho<{ status?: string }>('/health')
        return json({
          ok: true,
          enabled: true,
          baseUrl: config.baseUrl,
          workspaceId: config.workspaceId,
          aiPeer: config.aiPeer,
          userPeer: config.userPeer,
          reachable: probe.ok,
          status: probe.ok ? probe.data.status : null,
          error: probe.ok ? null : probe.error,
        })
      },
    },
  },
})
