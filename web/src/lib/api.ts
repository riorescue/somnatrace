import type { AppSettings, Backup, DbStats, DetectedCard, Device, DailySummary, Event, Finding, HealthStatus, Import, InsightsData, RuleStatus, Session, SessionCandidate, SessionSignals } from '@/types'

const BASE = '/api/v1'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: (): Promise<HealthStatus> =>
    request('/health'),

  devices: {
    list: (): Promise<{ devices: Device[] }> =>
      request('/devices'),
  },

  imports: {
    list: (): Promise<{ imports: Import[] }> =>
      request('/imports'),
    create: (body: { source_path: string; source_name?: string }): Promise<Import> =>
      request('/imports', { method: 'POST', body: JSON.stringify(body) }),
    candidates: (id: string): Promise<{ sessions: SessionCandidate[] }> =>
      request(`/imports/${id}/candidates`),
    confirm: (id: string, sessionIds: string[]): Promise<{ status: string }> =>
      request(`/imports/${id}/confirm`, { method: 'POST', body: JSON.stringify({ session_ids: sessionIds }) }),
  },

  sessions: {
    list: (params?: { eventType?: string; since?: string }): Promise<{ sessions: Session[] }> => {
      const qs = new URLSearchParams()
      if (params?.eventType) qs.set('event_type', params.eventType)
      if (params?.since)     qs.set('since', params.since)
      const q = qs.toString()
      return request(`/sessions${q ? `?${q}` : ''}`)
    },
    get: (id: string): Promise<Session> =>
      request(`/sessions/${id}`),
    signals: (id: string): Promise<SessionSignals> =>
      request(`/sessions/${id}/signals`),
    settings: (id: string): Promise<Record<string, unknown>> =>
      request(`/sessions/${id}/settings`),
    identification: (id: string): Promise<Record<string, unknown>> =>
      request(`/sessions/${id}/identification`),
    findings: (id: string): Promise<{ findings: Finding[]; analyzed_at?: string }> =>
      request(`/sessions/${id}/findings`),
    events: (id: string): Promise<{ events: Event[] }> =>
      request(`/sessions/${id}/events`),
    analyze: (id: string): Promise<{ status: string }> =>
      request(`/sessions/${id}/analyze`, { method: 'POST' }),
  },

  summaries: {
    daily: (limit = 30): Promise<{ summaries: DailySummary[] }> =>
      request(`/summaries/daily?limit=${limit}`),
  },

  insights: (days = 30): Promise<InsightsData> =>
    request(`/insights?days=${days}`),

  utilities: {
    stats: (): Promise<DbStats> =>
      request('/stats'),
    deleteAll: (): Promise<{ status: string }> =>
      request('/data', { method: 'DELETE' }),
    vacuum: (): Promise<{ status: string }> =>
      request('/maintenance/vacuum', { method: 'POST' }),
    detect: (): Promise<{ cards: DetectedCard[] }> =>
      request('/detect'),
  },

  backups: {
    list: (): Promise<{ backups: Backup[] }> =>
      request('/backups'),
    create: (): Promise<Backup> =>
      request('/backups', { method: 'POST' }),
    restore: (id: string): Promise<{ status: string }> =>
      request(`/backups/${id}/restore`, { method: 'POST' }),
    delete: (id: string): Promise<{ status: string }> =>
      request(`/backups/${id}`, { method: 'DELETE' }),
  },

  rules: {
    list: (): Promise<{ rules: RuleStatus[] }> =>
      request('/rules'),
    setEnabled: (id: string, enabled: boolean): Promise<{ enabled: boolean }> =>
      request(`/rules/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  },

  appSettings: {
    get: (): Promise<AppSettings> =>
      request('/settings'),
    patch: (body: Partial<Pick<AppSettings, 'compliance_hours_threshold' | 'compliance_pct_threshold' | 'leak_warn_p95' | 'leak_alert_p95'>>): Promise<AppSettings> =>
      request('/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  },
}
