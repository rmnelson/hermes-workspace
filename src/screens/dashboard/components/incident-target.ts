// Where an Attention incident should take the operator. Pure so it can be unit
// tested without the router. Each dashboard incident either carries an explicit
// href or is routed by its source to the page that holds the relevant info.

export type IncidentTarget =
  | { kind: 'external'; href: string }
  | { kind: 'route'; to: string; label: string }
  | { kind: 'scroll'; elementId: string; label: string }

/** Friendly button label for a known internal route. */
const ROUTE_LABELS: Record<string, string> = {
  '/jobs': 'Open Jobs',
  '/settings': 'Open Settings',
  '/operations': 'Open Operations',
}

function routeLabel(to: string): string {
  return ROUTE_LABELS[to] ?? 'Open page'
}

export function resolveIncidentTarget(item: {
  href: string | null
  source: string
}): IncidentTarget {
  const href = item.href?.trim()
  if (href) {
    if (href.startsWith('http://') || href.startsWith('https://')) {
      return { kind: 'external', href }
    }
    return { kind: 'route', to: href, label: routeLabel(href) }
  }

  switch (item.source) {
    case 'cron':
      return { kind: 'route', to: '/jobs', label: 'Open Jobs' }
    case 'config':
      return { kind: 'route', to: '/settings', label: 'Open Settings' }
    // Logs are shown as a card on the dashboard itself — there is no /logs page.
    case 'log':
      return { kind: 'scroll', elementId: 'dashboard-logs', label: 'View logs' }
    // Gateway/platform health lives on the operations page.
    case 'gateway':
    case 'platform':
    default:
      return { kind: 'route', to: '/operations', label: 'Open Operations' }
  }
}
