// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

import { useMemo, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { CheckCircle, AlertCircle, XCircle, Moon, Clock, TrendingUp, Info, X } from 'lucide-react'
import { api } from '@/lib/api'
import { FullPageSpinner } from '@/components/LoadingSpinner'
import { ErrorBanner } from '@/components/ErrorBanner'
import type { DailySummary } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'good' | 'watch' | 'poor'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 1): string {
  if (isNaN(n)) return '—'
  return n.toFixed(decimals)
}

function fmtDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${m}/${d}`
}

function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fillDateRange(summaries: DailySummary[], days: number): DailySummary[] {
  const byDate = new Map(summaries.map(s => [s.date, s]))
  const result: DailySummary[] = []
  for (let i = days; i >= 1; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = localDateStr(d)
    result.push(byDate.get(key) ?? {
      id: '', device_id: '', session_id: '', date: key,
      usage_minutes: 0, ahi: 0, ai_index: 0, hi_index: 0,
      leak_rate_median: 0, leak_rate_p95: 0,
      pressure_p50: 0, pressure_p95: 0, pressure_max: 0,
      parser_version: '', created_at: '',
    })
  }
  return result
}

function complianceStatus(pct: number, threshold: number): Status {
  if (pct >= threshold)           return 'good'
  if (pct >= threshold * 0.7143) return 'watch'  // ≥ 50% when threshold is 70%
  return 'poor'
}

// Computes stats for the most recent `days` in the filled 90-day array,
// accounting for new users whose therapy may have started mid-window.
function windowStats(
  filled: DailySummary[],
  days: number,
  hoursThreshold: number,
  firstSessionDate: string | null,
) {
  const window = filled.slice(-days)

  // Determine effective start date: if the user's first ever session falls
  // inside this window, count only from that date forward.
  const windowStartDate = window[0]?.date ?? ''
  const isNewUser = firstSessionDate !== null && firstSessionDate > windowStartDate

  // Effective slice: all days from the first session date (or window start)
  const effectiveWindow = isNewUser
    ? window.filter(d => d.date >= firstSessionDate!)
    : window

  const effectiveDays = effectiveWindow.length
  const withSession   = effectiveWindow.filter(d => d.session_id !== '')
  const compliant     = effectiveWindow.filter(d => d.usage_minutes >= hoursThreshold * 60)
  const avgUsageHrs   = withSession.length
    ? withSession.reduce((a, d) => a + d.usage_minutes, 0) / withSession.length / 60
    : 0
  const compliancePct = effectiveDays > 0 ? (compliant.length / effectiveDays) * 100 : 0

  return {
    total:         days,
    effectiveDays,
    used:          withSession.length,
    missed:        effectiveDays - withSession.length,
    compliant:     compliant.length,
    compliancePct,
    avgUsageHrs,
    isNewUser,
    firstSessionDate,
    status: complianceStatus(compliancePct, 0), // computed below with actual threshold
  }
}

// Separate helper so we can pass the threshold in after computing the struct
function withStatus(
  stats: ReturnType<typeof windowStats>,
  threshold: number,
): ReturnType<typeof windowStats> & { status: Status } {
  return { ...stats, status: complianceStatus(stats.compliancePct, threshold) }
}

function missedStreaks(filled: DailySummary[]): number[] {
  const streaks: number[] = []
  let run = 0
  for (const d of filled) {
    if (!d.session_id) {
      run++
    } else {
      if (run > 0) streaks.push(run)
      run = 0
    }
  }
  if (run > 0) streaks.push(run)
  return streaks.sort((a, b) => b - a)
}

function currentMissedStreak(filled: DailySummary[]): number {
  let streak = 0
  for (let i = filled.length - 1; i >= 0; i--) {
    if (!filled[i].session_id) streak++
    else break
  }
  return streak
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MissedStreaksCard({ streaks }: { streaks: number[] }) {
  const [showInfo, setShowInfo] = useState(false)

  useEffect(() => {
    if (!showInfo) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowInfo(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showInfo])

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Moon className="w-4 h-4 text-brand-500" />
          Missed Night Streaks
          <span className="text-xs font-normal text-slate-400 ml-1">last 90 days</span>
        </h2>
        <button
          onClick={() => setShowInfo(true)}
          className="text-slate-300 hover:text-brand-500 transition-colors p-1 rounded"
          title="About Missed Night Streaks"
          aria-label="About Missed Night Streaks"
        >
          <Info className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {streaks.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-emerald-600">
          <CheckCircle className="w-4 h-4" />
          No missed night streaks — perfect attendance
        </div>
      ) : (
        <div className="space-y-2">
          {streaks.slice(0, 8).map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div
                  className="h-6 rounded"
                  style={{
                    width: `${Math.max(8, (s / (streaks[0] || 1)) * 100)}%`,
                    backgroundColor: s >= 7 ? '#ef4444' : s >= 3 ? '#f59e0b' : '#94a3b8',
                  }}
                />
              </div>
              <span className="text-xs font-medium text-slate-600 shrink-0 tabular-nums">
                {s} {s === 1 ? 'night' : 'nights'}
              </span>
              <span className="text-xs text-slate-400 shrink-0 w-14">
                {i === 0 ? 'longest' : ''}
              </span>
            </div>
          ))}
          {streaks.length > 8 && (
            <p className="text-xs text-slate-500">+{streaks.length - 8} more streaks</p>
          )}
        </div>
      )}

      {showInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowInfo(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Moon className="w-4 h-4 text-brand-500" />
                Missed Night Streaks
              </h3>
              <button
                onClick={() => setShowInfo(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm text-slate-600">
              <p>
                A missed night streak is a run of consecutive nights with no recorded therapy session.
                Bars are sorted longest-first.
              </p>
              <p>
                Color indicates severity:
              </p>
              <ul className="space-y-1.5 pl-1">
                <li className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm shrink-0 bg-slate-400" />
                  <span>1–2 nights — minor gap</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm shrink-0 bg-amber-400" />
                  <span>3–6 nights — notable gap</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm shrink-0 bg-red-400" />
                  <span>7+ nights — extended gap, may affect compliance</span>
                </li>
              </ul>
              <p className="text-slate-500 text-xs pt-1">
                Only nights since your first recorded session are counted. Nights before therapy began are excluded.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: Status }) {
  if (status === 'good') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold border px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border-emerald-200">
      <CheckCircle className="w-3 h-3" /> Compliant
    </span>
  )
  if (status === 'watch') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold border px-2 py-0.5 rounded bg-amber-50 text-amber-700 border-amber-200">
      <AlertCircle className="w-3 h-3" /> Needs Attention
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold border px-2 py-0.5 rounded bg-red-50 text-red-700 border-red-200">
      <XCircle className="w-3 h-3" /> Non-Compliant
    </span>
  )
}

// Shown in the window table when effective days differ from the requested window
function NewUserNote({ firstDate }: { firstDate: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-sky-600 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded ml-1">
      <Info className="w-2.5 h-2.5 shrink-0" />
      from {firstDate}
    </span>
  )
}

function barColor(hours: number, threshold: number): string {
  if (hours === 0)              return '#e2e8f0'
  if (hours >= threshold)       return '#22c55e'
  if (hours >= threshold / 2)   return '#f59e0b'
  return '#ef4444'
}

function UsageTooltip({ active, payload, label, threshold }: {
  active?: boolean
  payload?: Array<{ value?: number | string | (string | number)[] }>
  label?: string
  threshold: number
}) {
  if (!active || !payload?.length) return null
  const hrs = Number(payload[0].value ?? 0)
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow px-3 py-2 text-xs">
      <p className="font-medium text-slate-700">{label}</p>
      {hrs === 0
        ? <p className="text-slate-400">No session</p>
        : <>
            <p className="text-slate-600">{hrs.toFixed(1)} hrs used</p>
            <p className={hrs >= threshold ? 'text-green-600' : hrs >= threshold / 2 ? 'text-amber-600' : 'text-red-500'}>
              {hrs >= threshold ? `≥ ${threshold}h — compliant` : `< ${threshold}h — below target`}
            </p>
          </>
      }
    </div>
  )
}

interface WindowRowProps {
  label: string
  w7:  React.ReactNode
  w30: React.ReactNode
  w90: React.ReactNode
}

function WindowRow({ label, w7, w30, w90 }: WindowRowProps) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-2.5 text-sm text-slate-700 font-medium">{label}</td>
      <td className="py-2.5 text-sm text-right text-slate-600">{w7}</td>
      <td className="py-2.5 text-sm text-right text-slate-600">{w30}</td>
      <td className="py-2.5 text-sm text-right text-slate-600">{w90}</td>
    </tr>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ComplianceReport() {
  const { data: summariesData, isLoading: sumLoading, isError: sumError } = useQuery({
    queryKey: ['summaries', 90],
    queryFn: () => api.summaries.daily(90),
  })

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['app-settings'],
    queryFn: api.appSettings.get,
  })

  const hoursThreshold = settings?.compliance_hours_threshold ?? 4.0
  const pctThreshold   = settings?.compliance_pct_threshold   ?? 70.0
  const firstSessionDate = settings?.first_session_date ?? null

  const { stats7, stats30, stats90, chartData, streaks, currentStreak } = useMemo(() => {
    const summaries = summariesData?.summaries ?? []
    const filled = fillDateRange(summaries, 90)

    const raw7  = windowStats(filled, 7,  hoursThreshold, firstSessionDate)
    const raw30 = windowStats(filled, 30, hoursThreshold, firstSessionDate)
    const raw90 = windowStats(filled, 90, hoursThreshold, firstSessionDate)

    const stats7  = withStatus(raw7,  pctThreshold)
    const stats30 = withStatus(raw30, pctThreshold)
    const stats90 = withStatus(raw90, pctThreshold)

    const chartData = filled.map(d => ({
      date: fmtDate(d.date),
      hours: d.session_id ? +(d.usage_minutes / 60).toFixed(2) : 0,
      hasSession: !!d.session_id,
      // Grey out days before the first session so they read as "pre-therapy"
      preTherapy: firstSessionDate !== null && d.date < firstSessionDate,
    }))

    const therapyFilled = firstSessionDate
      ? filled.filter(d => d.date >= firstSessionDate)
      : filled
    const streaks = missedStreaks(therapyFilled)
    const currentStreak = currentMissedStreak(therapyFilled)
    return { stats7, stats30, stats90, chartData, streaks, currentStreak }
  }, [summariesData, hoursThreshold, pctThreshold, firstSessionDate])

  if (sumLoading || settingsLoading) return <FullPageSpinner />
  if (sumError) return <ErrorBanner message="Failed to load summary data." />

  const noData = (summariesData?.summaries ?? []).length === 0

  if (noData) {
    return (
      <div className="card p-16 text-center">
        <Moon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">No session data available</p>
        <p className="text-slate-500 text-sm mt-1">Import sessions to generate compliance reports.</p>
      </div>
    )
  }

  const tickInterval = Math.max(0, Math.ceil(chartData.length / 12) - 1)

  // Whether ANY window was affected by new-user trimming
  const anyNewUser = stats7.isNewUser || stats30.isNewUser || stats90.isNewUser

  return (
    <div className="space-y-6">

      {/* ── New-user context banner ─────────────────────────────────────────── */}
      {anyNewUser && (
        <div className="flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-500" />
          <span>
            Therapy started on <strong>{firstSessionDate}</strong>. Compliance percentages are calculated
            from that date — only nights since your first session are counted toward your compliance score.
          </span>
        </div>
      )}

      {/* ── Status banner ─────────────────────────────────────────────────── */}
      <div className={`card p-5 border-l-4 ${
        stats30.status === 'good'  ? 'border-emerald-500 bg-emerald-50/40' :
        stats30.status === 'watch' ? 'border-amber-500  bg-amber-50/40'   :
                                     'border-red-500    bg-red-50/40'
      }`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={stats30.status} />
              <span className="text-xs text-slate-500">
                based on last {stats30.isNewUser ? `${stats30.effectiveDays} days in therapy` : '30 days'}
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {fmt(stats30.compliancePct, 0)}%
              <span className="text-sm font-normal text-slate-500 ml-2">
                of nights ≥ {hoursThreshold}h
              </span>
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Target: ≥ {fmt(pctThreshold, 0)}% of nights with ≥ {hoursThreshold}h of usage
              {anyNewUser && ' · calculated from first session date'}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-6 text-center shrink-0">
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats30.used}</p>
              <p className="text-xs text-slate-500">nights used</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{stats30.missed}</p>
              <p className="text-xs text-slate-500">nights missed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{fmt(stats30.avgUsageHrs)}h</p>
              <p className="text-xs text-slate-500">avg per night</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Window comparison table ────────────────────────────────────────── */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-brand-500" />
          Usage by Period
        </h2>
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left pb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Metric</th>
              <th className="text-right pb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                7 Days{stats7.isNewUser && <NewUserNote firstDate={firstSessionDate!} />}
              </th>
              <th className="text-right pb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                30 Days{stats30.isNewUser && <NewUserNote firstDate={firstSessionDate!} />}
              </th>
              <th className="text-right pb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                90 Days{stats90.isNewUser && <NewUserNote firstDate={firstSessionDate!} />}
              </th>
            </tr>
          </thead>
          <tbody>
            <WindowRow
              label="Days counted"
              w7={stats7.effectiveDays < stats7.total
                ? <span className="text-sky-600">{stats7.effectiveDays} <span className="text-slate-500 text-xs">(of {stats7.total})</span></span>
                : stats7.total}
              w30={stats30.effectiveDays < stats30.total
                ? <span className="text-sky-600">{stats30.effectiveDays} <span className="text-slate-500 text-xs">(of {stats30.total})</span></span>
                : stats30.total}
              w90={stats90.effectiveDays < stats90.total
                ? <span className="text-sky-600">{stats90.effectiveDays} <span className="text-slate-500 text-xs">(of {stats90.total})</span></span>
                : stats90.total}
            />
            <WindowRow
              label="Nights used"
              w7={`${stats7.used} / ${stats7.effectiveDays}`}
              w30={`${stats30.used} / ${stats30.effectiveDays}`}
              w90={`${stats90.used} / ${stats90.effectiveDays}`}
            />
            <WindowRow
              label="Nights missed"
              w7={stats7.missed}
              w30={stats30.missed}
              w90={stats90.missed}
            />
            <WindowRow
              label={`Nights ≥ ${hoursThreshold}h`}
              w7={stats7.compliant}
              w30={stats30.compliant}
              w90={stats90.compliant}
            />
            <WindowRow
              label="Compliance rate"
              w7={<>{fmt(stats7.compliancePct, 0)}% <StatusBadge status={stats7.status} /></>}
              w30={<>{fmt(stats30.compliancePct, 0)}% <StatusBadge status={stats30.status} /></>}
              w90={<>{fmt(stats90.compliancePct, 0)}% <StatusBadge status={stats90.status} /></>}
            />
            <WindowRow
              label="Avg usage (sessions only)"
              w7={`${fmt(stats7.avgUsageHrs)}h`}
              w30={`${fmt(stats30.avgUsageHrs)}h`}
              w90={`${fmt(stats90.avgUsageHrs)}h`}
            />
          </tbody>
        </table>
      </div>

      {/* ── 90-day usage bar chart ─────────────────────────────────────────── */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-brand-500" />
          Nightly Usage — Last 90 Days
          <span className="text-xs font-normal text-slate-400 ml-1">hours per night</span>
        </h2>
        <figure>
          <figcaption className="sr-only">
            Bar chart: nightly CPAP usage in hours over the last 90 days. Green bars meet the usage target, amber bars are below target, red bars are non-compliant. Numeric data available in the compliance table above.
          </figcaption>
        <ResponsiveContainer aria-hidden="true" width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="#94a3b8" interval={tickInterval} />
            <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[0, 'auto']} />
            <ReferenceLine
              y={hoursThreshold} stroke="#22c55e" strokeDasharray="4 2" strokeWidth={1.5}
              label={{ value: `${hoursThreshold}h`, fontSize: 9, fill: '#22c55e', position: 'right' }}
            />
            <Tooltip content={({ active, payload, label }) => (
              <UsageTooltip active={active} payload={payload} label={label} threshold={hoursThreshold} />
            )} />
            <Bar dataKey="hours" radius={[2, 2, 0, 0]} maxBarSize={20}>
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.preTherapy ? '#f1f5f9' : barColor(d.hours, hoursThreshold)}
                  fillOpacity={d.preTherapy ? 0.5 : d.hours === 0 ? 0.3 : 0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        </figure>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          {[
            { color: '#22c55e', label: `≥ ${hoursThreshold}h compliant` },
            { color: '#f59e0b', label: `${hoursThreshold / 2}–${hoursThreshold}h below target` },
            { color: '#ef4444', label: `< ${hoursThreshold / 2}h non-compliant` },
            { color: '#e2e8f0', label: 'No session' },
            ...(anyNewUser ? [{ color: '#f1f5f9', label: 'Pre-therapy' }] : []),
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Missed night streaks ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MissedStreaksCard streaks={streaks} />

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Current Status</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Current missed streak</span>
              <span className={`text-sm font-semibold ${
                currentStreak === 0 ? 'text-emerald-600' :
                currentStreak < 3   ? 'text-amber-600'  : 'text-red-600'
              }`}>
                {currentStreak === 0 ? 'None (active)' : `${currentStreak} ${currentStreak === 1 ? 'night' : 'nights'}`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Longest missed streak (90d)</span>
              <span className="text-sm font-semibold text-slate-800">
                {streaks[0] ? `${streaks[0]} nights` : 'None'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Distinct missed runs (90d)</span>
              <span className="text-sm font-semibold text-slate-800">{streaks.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Total missed nights (90d)</span>
              <span className="text-sm font-semibold text-slate-800">{stats90.missed}</span>
            </div>
            {firstSessionDate && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">First session date</span>
                <span className="text-sm font-semibold text-slate-800">{firstSessionDate}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Print footer note ──────────────────────────────────────────────── */}
      <div className="hidden print:block mt-8 pt-4 border-t border-slate-200 text-xs text-slate-500 text-center">
        Compliance target: ≥ {fmt(pctThreshold, 0)}% of nights with ≥ {hoursThreshold}h of CPAP/APAP usage.
        {anyNewUser && ` Calculated from first session date (${firstSessionDate}) — pre-therapy days excluded.`}
        {' '}This report is for informational purposes and does not constitute medical advice.
      </div>
    </div>
  )
}

