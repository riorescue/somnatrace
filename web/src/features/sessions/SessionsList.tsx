// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Moon, X, Zap } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, formatTime, formatDuration, formatAHI, ahiLabel } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { FullPageSpinner } from '@/components/LoadingSpinner'
import { ErrorBanner } from '@/components/ErrorBanner'

const EVENT_LABELS: Record<string, string> = {
  central_apnea:     'Central Apnea',
  obstructive_apnea: 'Obstructive Apnea',
  hypopnea:          'Hypopnea',
  spo2_desaturation: 'SpO₂ Desaturation',
  large_leak:        'Large Leak',
}

const EVENT_COLORS: Record<string, string> = {
  central_apnea:     'text-purple-700 bg-purple-50 border-purple-200',
  obstructive_apnea: 'text-red-700 bg-red-50 border-red-200',
  hypopnea:          'text-amber-700 bg-amber-50 border-amber-200',
  spo2_desaturation: 'text-blue-700 bg-blue-50 border-blue-200',
  large_leak:        'text-orange-700 bg-orange-50 border-orange-200',
}

export function SessionsList() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const eventType = searchParams.get('event_type') ?? undefined
  const since = searchParams.get('since') ?? undefined
  const isFiltered = !!(eventType && since)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sessions', eventType, since],
    queryFn: () => api.sessions.list(isFiltered ? { eventType, since } : undefined),
  })

  if (isLoading) return <FullPageSpinner />
  if (isError) return <ErrorBanner message="Failed to load sessions." />

  const sessions = data?.sessions ?? []

  const sinceLabel = since
    ? new Date(since + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <div>
      <PageHeader
        title="Sessions"
        description={isFiltered
          ? `${sessions.length} session${sessions.length !== 1 ? 's' : ''} matching filter`
          : `${sessions.length} total session${sessions.length !== 1 ? 's' : ''}`
        }
      />

      {isFiltered && (
        <div className={`flex items-center gap-3 mb-4 px-4 py-3 rounded-xl border text-sm ${EVENT_COLORS[eventType] ?? 'text-slate-700 bg-slate-50 border-slate-200'}`}>
          <Zap className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            Filtered to <strong>{EVENT_LABELS[eventType] ?? eventType}</strong> events
            {' '}since <strong>{sinceLabel}</strong>
          </span>
          <button
            onClick={() => navigate('/sessions')}
            className="p-1 rounded hover:bg-black/10 transition-colors"
            aria-label="Clear filter"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="card p-12 text-center">
          <Moon className="w-10 h-10 text-slate-300 mx-auto mb-3" aria-hidden="true" />
          {isFiltered ? (
            <>
              <p className="text-slate-500 text-sm">No sessions found with this filter.</p>
              <button onClick={() => navigate('/sessions')} className="mt-3 text-xs text-brand-600 hover:underline">
                Clear filter
              </button>
            </>
          ) : (
            <>
              <p className="text-slate-500 text-sm">No sessions yet.</p>
              <p className="text-slate-500 text-xs mt-1">Sessions are created automatically when you import device data.</p>
            </>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm" aria-label="Sleep sessions">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th scope="col" className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                <th scope="col" className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Start</th>
                <th scope="col" className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Duration</th>
                <th scope="col" className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">AHI</th>
                <th scope="col" className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Events/hr</th>
                <th scope="col" className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pressure P95</th>
                <th scope="col" className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Leak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map(sess => {
                const { label, color } = ahiLabel(sess.ahi)
                return (
                  <tr
                    key={sess.id}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/sessions/${sess.id}`)}
                  >
                    <td className="px-5 py-3 font-medium text-slate-800">{formatDate(sess.start_time)}</td>
                    <td className="px-5 py-3 text-slate-500 tabular-nums">{formatTime(sess.start_time)}</td>
                    <td className="px-5 py-3 text-slate-700 tabular-nums">{formatDuration(sess.duration_minutes)}</td>
                    <td className="px-5 py-3 tabular-nums">
                      <span className={`font-semibold ${color}`}>{formatAHI(sess.ahi)}</span>
                      <span className="ml-1.5 text-xs text-slate-500">({label})</span>
                    </td>
                    <td className="px-5 py-3 text-slate-700 tabular-nums">
                      {sess.event_count > 0
                        ? (sess.event_count / (sess.duration_minutes / 60)).toFixed(1)
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-700 tabular-nums">{sess.pressure_p95.toFixed(1)} cmH₂O</td>
                    <td className="px-5 py-3 text-slate-700 tabular-nums">{sess.leak_rate_median.toFixed(1)} L/min</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
