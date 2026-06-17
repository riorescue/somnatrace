// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ComposedChart, Line, AreaChart, Area,
  BarChart, Bar, Cell,
  PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea,
  ResponsiveContainer, Legend,
} from 'recharts'
import { Activity, Gauge, Zap, CheckCircle, AlertCircle, XCircle, Sun, Smile, Meh, Frown } from 'lucide-react'
import { api } from '@/lib/api'
import { FullPageSpinner } from '@/components/LoadingSpinner'
import { ErrorBanner } from '@/components/ErrorBanner'
import type { DailySummary, MorningFeel } from '@/types'

// ─── Types / constants ────────────────────────────────────────────────────────

type Status = 'good' | 'watch' | 'poor'

const AHI_ZONES = [
  { lo: 0,    hi: 5,    fill: '#dcfce7' },
  { lo: 5,    hi: 15,   fill: '#fef9c3' },
  { lo: 15,   hi: 30,   fill: '#fed7aa' },
  { lo: 30,   hi: 9999, fill: '#fecaca' },
]

const EVENT_CFG: Record<string, { label: string; color: string }> = {
  central_apnea:     { label: 'Central Apnea',      color: '#a855f7' },
  hypopnea:          { label: 'Hypopnea',            color: '#f59e0b' },
  obstructive_apnea: { label: 'Obstructive Apnea',  color: '#ef4444' },
  rera:              { label: 'RERA',                color: '#f472b6' },
  flow_limitation:   { label: 'Flow Limitation',     color: '#2dd4bf' },
  periodic_breathing:{ label: 'Periodic Breathing',  color: '#818cf8' },
  spo2_desaturation: { label: 'SpO₂ Desat.',         color: '#3b82f6' },
  large_leak:        { label: 'Large Leak',           color: '#f97316' },
  csr:               { label: 'Cheyne-Stokes',        color: '#7c3aed' },
}

const FEEL_CFG: Record<MorningFeel, { label: string; Icon: React.ElementType; color: string; bg: string; text: string; dot: string }> = {
  good: { label: 'Good', Icon: Smile, color: '#22c55e', bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: '#22c55e' },
  fair: { label: 'Fair', Icon: Meh,   color: '#f59e0b', bg: 'bg-amber-50',    text: 'text-amber-700',   dot: '#f59e0b' },
  poor: { label: 'Poor', Icon: Frown, color: '#ef4444', bg: 'bg-red-50',      text: 'text-red-700',     dot: '#ef4444' },
}

const FEEL_ORDER: MorningFeel[] = ['good', 'fair', 'poor']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${m}/${d}`
}

function fillDateRange(summaries: DailySummary[], days: number): DailySummary[] {
  const byDate = new Map(summaries.map(s => [s.date, s]))
  const result: DailySummary[] = []
  for (let i = days; i >= 1; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
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

function ahiStatus(ahi: number): Status {
  if (ahi < 5)  return 'good'
  if (ahi < 15) return 'watch'
  return 'poor'
}

function windowAHI(filled: DailySummary[], days: number) {
  const window = filled.slice(-days).filter(d => d.session_id && d.ahi > 0)
  if (!window.length) return { avg: NaN, min: NaN, max: NaN, count: 0 }
  const values = window.map(d => d.ahi)
  const avg = values.reduce((a, v) => a + v, 0) / values.length
  return {
    avg,
    min: Math.min(...values),
    max: Math.max(...values),
    count: window.length,
    status: ahiStatus(avg),
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AHIBadge({ status }: { status: Status }) {
  if (status === 'good') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold border px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border-emerald-200">
      <CheckCircle className="w-3 h-3" /> Good (&lt;5)
    </span>
  )
  if (status === 'watch') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold border px-2 py-0.5 rounded bg-amber-50 text-amber-700 border-amber-200">
      <AlertCircle className="w-3 h-3" /> Watch (5–15)
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold border px-2 py-0.5 rounded bg-red-50 text-red-700 border-red-200">
      <XCircle className="w-3 h-3" /> Poor (≥15)
    </span>
  )
}

type FeelDot = { date: string; feel: MorningFeel | null }

function FeelStrip({ days }: { days: FeelDot[] }) {
  const rated = days.filter(d => d.feel !== null)
  if (!rated.length) return null
  return (
    <div className="mt-5 pt-4 border-t border-slate-100">
      <p className="text-xs font-medium text-slate-500 mb-2">90-night feel log</p>
      <div className="flex flex-wrap gap-1">
        {days.map((d, i) => {
          const cfg = d.feel ? FEEL_CFG[d.feel] : null
          return (
            <div
              key={i}
              title={`${d.date}: ${d.feel ?? 'not rated'}`}
              className="w-5 h-5 rounded-sm transition-opacity hover:opacity-70"
              style={{ backgroundColor: cfg?.color ?? '#e2e8f0' }}
            />
          )
        })}
      </div>
      <div className="flex items-center gap-4 mt-2">
        {FEEL_ORDER.map(f => (
          <span key={f} className="flex items-center gap-1 text-xs text-slate-500">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: FEEL_CFG[f].color }} />
            {FEEL_CFG[f].label}
          </span>
        ))}
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <span className="w-3 h-3 rounded-sm inline-block bg-slate-200" />
          Not rated
        </span>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function EffectivenessReport() {
  const summariesQ = useQuery({
    queryKey: ['summaries', 90],
    queryFn: () => api.summaries.daily(90),
  })
  const insightsQ = useQuery({
    queryKey: ['insights', 90],
    queryFn: () => api.insights(90),
  })
  const sessionsQ = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.sessions.list(),
  })

  const {
    ahi7, ahi30, ahi90,
    ahiChartData, pressureChartData, eventBarData, recentRows,
    feelPieData, feelStats, feelStripDays, ahiByFeel,
  } = useMemo(() => {
    const summaries = summariesQ.data?.summaries ?? []
    const filled = fillDateRange(summaries, 90)
    const withSession = filled.filter(d => d.session_id !== '')

    const ahi7  = windowAHI(filled, 7)
    const ahi30 = windowAHI(filled, 30)
    const ahi90 = windowAHI(filled, 90)

    // Build session_id → morning_feel map
    const feelMap = new Map<string, MorningFeel>()
    for (const s of sessionsQ.data?.sessions ?? []) {
      if (s.morning_feel) feelMap.set(s.id, s.morning_feel as MorningFeel)
    }

    // AHI chart data enriched with morning feel for color-coded dots
    const ahiChartData = withSession
      .filter(d => d.ahi > 0)
      .map(d => ({
        date: fmtDate(d.date),
        ahi: +d.ahi.toFixed(2),
        feel: feelMap.get(d.session_id) ?? null,
      }))

    const pressureChartData = withSession
      .filter(d => d.pressure_p50 > 0)
      .map(d => ({
        date: fmtDate(d.date),
        p50: +d.pressure_p50.toFixed(1),
        p95: +d.pressure_p95.toFixed(1),
      }))

    const eventCounts = insightsQ.data?.event_counts ?? {}
    const eventBarData = Object.entries(EVENT_CFG)
      .filter(([k]) => (eventCounts[k] ?? 0) > 0)
      .map(([k, cfg]) => ({ name: cfg.label, count: eventCounts[k] ?? 0, color: cfg.color }))
      .sort((a, b) => b.count - a.count)

    const recentRows = [...withSession].reverse().slice(0, 30).map(d => ({
      date: d.date,
      hours: (d.usage_minutes / 60).toFixed(1),
      ahi: d.ahi.toFixed(2),
      ai: d.ai_index.toFixed(2),
      hi: d.hi_index.toFixed(2),
      p50: d.pressure_p50.toFixed(1),
      status: ahiStatus(d.ahi),
      feel: feelMap.get(d.session_id) ?? null,
    }))

    // Morning feel stats
    const feelCounts: Record<MorningFeel, number> = { good: 0, fair: 0, poor: 0 }
    for (const [, feel] of feelMap) feelCounts[feel]++
    const totalRated = feelCounts.good + feelCounts.fair + feelCounts.poor
    const feelPieData = totalRated > 0 ? FEEL_ORDER
      .filter(f => feelCounts[f] > 0)
      .map(f => ({ name: FEEL_CFG[f].label, count: feelCounts[f], color: FEEL_CFG[f].color }))
      : []

    const wellRestedPct = totalRated > 0
      ? Math.round((feelCounts.good + feelCounts.fair) / totalRated * 100)
      : null

    const feelStats = { counts: feelCounts, total: totalRated, wellRestedPct }

    // 90-night strip (only days with sessions)
    const feelStripDays: FeelDot[] = withSession.map(d => ({
      date: d.date,
      feel: feelMap.get(d.session_id) ?? null,
    }))

    // Average AHI per feel category
    const ahiSumByFeel: Record<MorningFeel, { sum: number; n: number }> = {
      good: { sum: 0, n: 0 },
      fair: { sum: 0, n: 0 },
      poor: { sum: 0, n: 0 },
    }
    for (const d of withSession) {
      const feel = feelMap.get(d.session_id)
      if (feel && d.ahi > 0) {
        ahiSumByFeel[feel].sum += d.ahi
        ahiSumByFeel[feel].n++
      }
    }
    const ahiByFeel = FEEL_ORDER
      .filter(f => ahiSumByFeel[f].n > 0)
      .map(f => ({
        name: FEEL_CFG[f].label,
        ahi: +(ahiSumByFeel[f].sum / ahiSumByFeel[f].n).toFixed(2),
        color: FEEL_CFG[f].color,
      }))

    return {
      ahi7, ahi30, ahi90,
      ahiChartData, pressureChartData, eventBarData, recentRows,
      feelPieData, feelStats, feelStripDays, ahiByFeel,
    }
  }, [summariesQ.data, insightsQ.data, sessionsQ.data])

  if (summariesQ.isLoading || insightsQ.isLoading || sessionsQ.isLoading) return <FullPageSpinner />
  if (summariesQ.isError || insightsQ.isError) return <ErrorBanner message="Failed to load therapy data." />

  const noData = (summariesQ.data?.summaries ?? []).length === 0
  if (noData) {
    return (
      <div className="card p-16 text-center">
        <Activity className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">No session data available</p>
        <p className="text-slate-500 text-sm mt-1">Import sessions to generate effectiveness reports.</p>
      </div>
    )
  }

  const tickInterval = Math.max(0, Math.ceil(ahiChartData.length / 10) - 1)
  const hasFeel = feelStats.total > 0

  return (
    <div className="space-y-6">

      {/* ── AHI period comparison ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { label: '7-Day Avg AHI', stats: ahi7 },
          { label: '30-Day Avg AHI', stats: ahi30 },
          { label: '90-Day Avg AHI', stats: ahi90 },
        ].map(({ label, stats }) => (
          <div key={label} className={`card p-5 border-l-4 ${
            !stats.status                ? 'border-slate-200' :
            stats.status === 'good'      ? 'border-emerald-400' :
            stats.status === 'watch'     ? 'border-amber-400'   :
                                           'border-red-400'
          }`}>
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className="text-3xl font-bold text-slate-900 mb-1">
              {stats.count ? stats.avg.toFixed(1) : '—'}
            </p>
            <p className="text-xs text-slate-500 mb-2">events / hour</p>
            {stats.count ? <AHIBadge status={stats.status!} /> : null}
            {stats.count > 0 && (
              <p className="text-xs text-slate-500 mt-2">
                Range: {stats.min.toFixed(1)} – {stats.max.toFixed(1)} · {stats.count} nights
              </p>
            )}
          </div>
        ))}
      </div>

      {/* ── AHI threshold reference ────────────────────────────────────────── */}
      <div className="card p-4 bg-slate-50">
        <p className="text-xs font-semibold text-slate-600 mb-2">AHI Severity Scale</p>
        <div className="flex gap-6 flex-wrap">
          {[
            { range: 'AHI < 5',   label: 'Normal / Good',        color: 'bg-emerald-100 text-emerald-700' },
            { range: 'AHI 5–15',  label: 'Mild apnea / Watch',   color: 'bg-amber-100 text-amber-700'   },
            { range: 'AHI 15–30', label: 'Moderate / Poor',      color: 'bg-orange-100 text-orange-700' },
            { range: 'AHI ≥ 30',  label: 'Severe / Critical',    color: 'bg-red-100 text-red-700'       },
          ].map(t => (
            <div key={t.range} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${t.color}`}>
              <span className="font-mono">{t.range}</span>
              <span className="opacity-75">·</span>
              <span>{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── AHI trend chart ────────────────────────────────────────────────── */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
          <Activity className="w-4 h-4 text-brand-500" />
          Residual AHI Trend
          <span className="text-xs font-normal text-slate-400 ml-1">nightly AHI over last 90 days</span>
        </h2>
        {hasFeel && (
          <p className="text-xs text-slate-400 mb-3 ml-6">Dots colored by how you felt on waking</p>
        )}
        {ahiChartData.length < 2 ? (
          <div className="h-48 flex items-center justify-center text-slate-500 text-sm">Not enough data.</div>
        ) : (
          <figure>
            <figcaption className="sr-only">
              Line chart: residual AHI trend over the last 90 days with severity zone shading. Data also available in the nightly summary table below.
            </figcaption>
          <ResponsiveContainer aria-hidden="true" width="100%" height={210}>
            <ComposedChart data={ahiChartData} margin={{ top: 4, right: 20, bottom: 0, left: -8 }}>
              {AHI_ZONES.map((z, i) => (
                <ReferenceArea key={i} y1={z.lo} y2={z.hi} fill={z.fill} fillOpacity={0.45} ifOverflow="hidden" />
              ))}
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="#94a3b8" interval={tickInterval} />
              <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[0, 'auto']} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as { date: string; ahi: number; feel: MorningFeel | null }
                  const feel = d.feel ? FEEL_CFG[d.feel] : null
                  return (
                    <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow text-xs">
                      <p className="font-semibold text-slate-700 mb-1">{d.date}</p>
                      <p className="text-slate-600">AHI: <span className="font-bold text-slate-800">{d.ahi}</span></p>
                      {feel && (
                        <p className="flex items-center gap-1 mt-0.5" style={{ color: feel.dot }}>
                          <feel.Icon className="w-3 h-3" />
                          <span className="font-medium">{feel.label}</span>
                        </p>
                      )}
                    </div>
                  )
                }}
              />
              <ReferenceLine y={5}  stroke="#86efac" strokeDasharray="4 2" strokeWidth={1} />
              <ReferenceLine y={15} stroke="#fcd34d" strokeDasharray="4 2" strokeWidth={1} />
              <ReferenceLine y={30} stroke="#f97316" strokeDasharray="4 2" strokeWidth={1} />
              <Line
                type="monotone" dataKey="ahi" stroke="#0ea5e9" strokeWidth={2}
                dot={(props: { cx: number; cy: number; index: number; payload: { feel: MorningFeel | null } }) => {
                  const feel = props.payload.feel
                  const fill = feel ? FEEL_CFG[feel].dot : '#94a3b8'
                  return (
                    <circle
                      key={props.index}
                      cx={props.cx} cy={props.cy} r={3.5}
                      fill={fill} stroke="white" strokeWidth={1}
                    />
                  )
                }}
                activeDot={{ r: 5, stroke: '#0ea5e9', strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
          </figure>
        )}
        {hasFeel && (
          <div className="flex items-center gap-4 mt-3 ml-1 flex-wrap">
            {FEEL_ORDER.map(f => (
              <span key={f} className="flex items-center gap-1.5 text-xs text-slate-500">
                <svg width="10" height="10"><circle cx="5" cy="5" r="4.5" fill={FEEL_CFG[f].dot} /></svg>
                {FEEL_CFG[f].label}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <svg width="10" height="10"><circle cx="5" cy="5" r="4.5" fill="#94a3b8" /></svg>
              Not rated
            </span>
          </div>
        )}
      </div>

      {/* ── Pressure + Events ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Pressure profile */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-brand-500" />
            Pressure Trend
            <span className="text-xs font-normal text-slate-400 ml-1">cmH₂O · P50 and P95</span>
          </h2>
          {pressureChartData.length < 2 ? (
            <div className="h-48 flex items-center justify-center text-slate-500 text-sm">Not enough data.</div>
          ) : (
            <figure>
              <figcaption className="sr-only">
                Area chart: nightly therapy pressure trend in cmH₂O, showing P50 (median) and P95 values.
              </figcaption>
            <ResponsiveContainer aria-hidden="true" width="100%" height={180}>
              <AreaChart data={pressureChartData} margin={{ top: 4, right: 20, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="#94a3b8" interval={Math.max(0, Math.ceil(pressureChartData.length / 8) - 1)} />
                <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  formatter={(v: number, name: string) => [`${v.toFixed(1)} cmH₂O`, name === 'p95' ? 'P95 pressure' : 'P50 pressure']}
                />
                <Legend iconType="line" formatter={(v) => <span className="text-xs text-slate-600">{v === 'p95' ? 'P95' : 'P50'}</span>} />
                <Area type="monotone" dataKey="p95" stroke="#818cf8" fill="#e0e7ff" strokeWidth={1.5} dot={false} fillOpacity={0.35} />
                <Area type="monotone" dataKey="p50" stroke="#6366f1" fill="#c7d2fe" strokeWidth={2}   dot={false} fillOpacity={0.35} />
              </AreaChart>
            </ResponsiveContainer>
            </figure>
          )}
        </div>

        {/* Event breakdown */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-brand-500" />
            Event Totals
            <span className="text-xs font-normal text-slate-400 ml-1">last 90 days</span>
          </h2>
          {eventBarData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-500 text-sm">No events recorded.</div>
          ) : (
            <figure>
              <figcaption className="sr-only">
                Horizontal bar chart: total event counts by type over the last 90 days. Numeric totals also available in the nightly summary table below.
              </figcaption>
            <ResponsiveContainer aria-hidden="true" width="100%" height={180}>
              <BarChart data={eventBarData} layout="vertical" margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" width={110} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  formatter={(v: number) => [v, 'events']}
                />
                <Bar dataKey="count" radius={[0, 3, 3, 0]} maxBarSize={20}>
                  {eventBarData.map((d, i) => (
                    <Cell key={i} fill={d.color} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </figure>
          )}
        </div>
      </div>

      {/* ── Morning Feel ───────────────────────────────────────────────────── */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <Sun className="w-4 h-4 text-brand-500" />
          Morning Feel
          <span className="text-xs font-normal text-slate-400 ml-1">self-reported upon waking</span>
        </h2>

        {!hasFeel ? (
          <div className="py-8 text-center">
            <div className="flex justify-center gap-3 mb-3">
              <Smile className="w-7 h-7 text-slate-200" />
              <Meh   className="w-7 h-7 text-slate-200" />
              <Frown className="w-7 h-7 text-slate-200" />
            </div>
            <p className="text-slate-500 font-medium text-sm">No morning feel ratings yet</p>
            <p className="text-slate-400 text-xs mt-1">
              After each session, open the session detail and rate how you felt on waking. Ratings appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Donut chart */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <PieChart width={180} height={180}>
                    <Pie
                      data={feelPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={78}
                      dataKey="count"
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {feelPieData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      wrapperStyle={{ zIndex: 10 }}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: 'white' }}
                      formatter={(v: number, name: string) => [v, name]}
                    />
                  </PieChart>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-2xl font-bold text-slate-800 leading-none">
                      {feelStats.wellRestedPct}%
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5 text-center leading-tight">
                      well<br />rested
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-1">{feelStats.total} rated night{feelStats.total !== 1 ? 's' : ''}</p>
              </div>

              {/* Feel breakdown + AHI correlation */}
              <div className="space-y-4">
                {/* Per-feel stat boxes */}
                <div className="grid grid-cols-3 gap-2">
                  {FEEL_ORDER.map(f => {
                    const cfg = FEEL_CFG[f]
                    const count = feelStats.counts[f]
                    const pct = feelStats.total > 0 ? Math.round(count / feelStats.total * 100) : 0
                    return (
                      <div key={f} className={`rounded-xl p-3 text-center ${cfg.bg}`}>
                        <cfg.Icon className={`w-5 h-5 mx-auto mb-1 ${cfg.text}`} />
                        <p className={`text-xl font-bold ${cfg.text} leading-none`}>{count}</p>
                        <p className={`text-[10px] font-medium mt-0.5 ${cfg.text} opacity-70`}>{pct}%</p>
                        <p className={`text-[10px] mt-0.5 ${cfg.text} opacity-60`}>{cfg.label}</p>
                      </div>
                    )
                  })}
                </div>

                {/* AHI by feel */}
                {ahiByFeel.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">Average AHI by how you felt</p>
                    <div className="space-y-2">
                      {ahiByFeel.map(f => {
                        const maxAHI = Math.max(...ahiByFeel.map(x => x.ahi), 5)
                        const pct = Math.min(100, (f.ahi / maxAHI) * 100)
                        return (
                          <div key={f.name} className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 w-14 shrink-0 text-right">{f.name}</span>
                            <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div
                                className="h-2 rounded-full transition-all"
                                style={{ width: `${pct}%`, backgroundColor: f.color }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-slate-700 w-8 shrink-0">{f.ahi}</span>
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5">events / hour · rated nights only</p>
                  </div>
                )}
              </div>
            </div>

            <FeelStrip days={feelStripDays} />
          </>
        )}
      </div>

      {/* ── Nightly summary table ──────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-700">Nightly Summary</h2>
          <p className="text-xs text-slate-500 mt-0.5">Most recent 30 sessions</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {['Date', 'Usage', 'AHI', 'AI', 'HI', 'Pressure P50', 'Feel', 'Status'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentRows.map((row, i) => {
                const feelCfg = row.feel ? FEEL_CFG[row.feel] : null
                return (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-700 font-mono text-xs">{row.date}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.hours}h</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{row.ahi}</td>
                    <td className="px-4 py-2.5 text-slate-500">{row.ai}</td>
                    <td className="px-4 py-2.5 text-slate-500">{row.hi}</td>
                    <td className="px-4 py-2.5 text-slate-500">{row.p50} cmH₂O</td>
                    <td className="px-4 py-2.5">
                      {feelCfg ? (
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${feelCfg.text}`}>
                          <feelCfg.Icon className="w-3.5 h-3.5" />
                          {feelCfg.label}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.status === 'good'  && <span className="text-xs font-medium text-emerald-600">Good</span>}
                      {row.status === 'watch' && <span className="text-xs font-medium text-amber-600">Watch</span>}
                      {row.status === 'poor'  && <span className="text-xs font-medium text-red-600">Poor</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="hidden print:block mt-8 pt-4 border-t border-slate-200 text-xs text-slate-500 text-center">
        Therapy effectiveness benchmarks: AHI &lt; 5 = good, 5–15 = mild/watch, 15–30 = moderate/poor, ≥ 30 = severe.
        This report is for informational purposes and does not constitute medical advice.
      </div>
    </div>
  )
}
