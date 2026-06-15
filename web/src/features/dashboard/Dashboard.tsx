// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Moon, Upload, Activity } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { api } from '@/lib/api'
import { formatDate, formatDuration, formatAHI, ahiLabel } from '@/lib/format'
import { StatCard } from '@/components/StatCard'
import { FullPageSpinner } from '@/components/LoadingSpinner'
import { ErrorBanner } from '@/components/ErrorBanner'
import { ImportStatusBadge } from '@/components/ImportStatusBadge'
import { PageHeader } from '@/components/PageHeader'

export function Dashboard() {
  const navigate = useNavigate()
  const summaries = useQuery({
    queryKey: ['summaries', 'daily'],
    queryFn: () => api.summaries.daily(14),
  })
  const imports = useQuery({
    queryKey: ['imports'],
    queryFn: api.imports.list,
  })
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.sessions.list(),
  })

  if (summaries.isLoading) return <FullPageSpinner />
  if (summaries.isError) return <ErrorBanner message="Failed to load dashboard data." />

  const rows = [...(summaries.data?.summaries ?? [])].reverse()
  const chartData = rows.map(s => ({
    date: s.date.slice(5),
    ahi: parseFloat(s.ahi.toFixed(2)),
    usage: parseFloat((s.usage_minutes / 60).toFixed(2)),
    session_id: s.session_id,
  }))

  const latestSession = sessions.data?.sessions?.[0]
  const recentImports = imports.data?.imports?.slice(0, 3) ?? []
  const recentSessions = sessions.data?.sessions?.slice(0, 5) ?? []

  const avgAHI = rows.length
    ? (rows.reduce((a, r) => a + r.ahi, 0) / rows.length).toFixed(1)
    : '—'
  const avgUsage = rows.length
    ? formatDuration(rows.reduce((a, r) => a + r.usage_minutes, 0) / rows.length)
    : '—'
  const latestAHI = latestSession ? formatAHI(latestSession.ahi) : '—'
  const { label: ahiSeverity, color } = latestSession ? ahiLabel(latestSession.ahi) : { label: '', color: 'text-slate-900' }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Your sleep therapy overview"
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Last Night AHI" value={latestAHI} sub={ahiSeverity ? `events / hour · ${ahiSeverity}` : 'events / hour'} accent={color} />
        <StatCard label="7-Day Avg AHI" value={avgAHI} sub="events / hour" />
        <StatCard label="Avg Usage" value={avgUsage} sub="per night" />
        <StatCard label="Total Sessions" value={sessions.data?.sessions?.length ?? 0} sub="all time" />
      </div>

      {/* AHI trend chart */}
      <div className="card p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-brand-500" aria-hidden="true" />
          AHI — Last 14 Nights
        </h2>
        {chartData.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-slate-500 text-sm">
            No data yet — import your first session to see trends.
          </div>
        ) : (
          <figure>
            <figcaption className="sr-only">
              Line chart: AHI events per hour over the last 14 nights. Data also available in the Sessions table.
            </figcaption>
          <ResponsiveContainer aria-hidden="true" width="100%" height={180}>
            <LineChart
              data={chartData}
              style={{ cursor: 'pointer' }}
              onClick={(state) => {
                const id = state?.activePayload?.[0]?.payload?.session_id
                if (id) navigate(`/sessions/${id}`)
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" domain={[0, 'auto']} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                formatter={(v: number) => [v.toFixed(2), 'AHI']}
                labelFormatter={(label) => `Date: ${label}`}
              />
              <Line
                type="monotone" dataKey="ahi" stroke="#0ea5e9"
                strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6, cursor: 'pointer' }}
              />
            </LineChart>
          </ResponsiveContainer>
          </figure>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent imports */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Upload className="w-4 h-4 text-brand-500" aria-hidden="true" /> Recent Imports
            </h2>
            <Link to="/imports" className="text-xs text-brand-600 hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {recentImports.length === 0 ? (
              <li className="px-5 py-4 text-sm text-slate-500">No imports yet.</li>
            ) : recentImports.map(imp => (
              <li key={imp.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-800">{imp.source_name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{formatDate(imp.created_at)}</p>
                </div>
                <ImportStatusBadge status={imp.status} />
              </li>
            ))}
          </ul>
        </div>

        {/* Recent sessions */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Moon className="w-4 h-4 text-brand-500" aria-hidden="true" /> Recent Sessions
            </h2>
            <Link to="/sessions" className="text-xs text-brand-600 hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {recentSessions.length === 0 ? (
              <li className="px-5 py-4 text-sm text-slate-500">No sessions yet.</li>
            ) : recentSessions.map(sess => {
              const { label, color } = ahiLabel(sess.ahi)
              return (
                <li key={sess.id} className="px-5 py-3">
                  <Link to={`/sessions/${sess.id}`} className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-medium text-slate-800 group-hover:text-brand-600 transition-colors">
                        {formatDate(sess.start_time)}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatDuration(sess.duration_minutes)} · AHI{' '}
                        <span className={color}>{formatAHI(sess.ahi)}</span>
                        {' '}({label})
                      </p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-brand-500 transition-colors" aria-hidden="true" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
