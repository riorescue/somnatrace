// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  CartesianGrid, ResponsiveContainer, LineChart, Line, ReferenceLine,
} from 'recharts'
import { ArrowUpRight, ArrowDownRight, CalendarDays, Layers, ExternalLink } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, formatDuration, formatAHI, ahiLabel } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { FullPageSpinner } from '@/components/LoadingSpinner'
import { ErrorBanner } from '@/components/ErrorBanner'
import type { Session, Event, Finding, DailySummary } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type CompareMode = 'session' | 'period'
interface DateRange { from: string; to: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  { key: 'obstructive_apnea', label: 'Obstructive', color: '#ef4444' },
  { key: 'central_apnea',     label: 'Central',     color: '#8b5cf6' },
  { key: 'hypopnea',          label: 'Hypopnea',    color: '#f59e0b' },
  { key: 'spo2_desaturation', label: 'SpO₂ Desat', color: '#3b82f6' },
  { key: 'large_leak',        label: 'Large Leak',  color: '#f97316' },
] as const

const SEVERITIES = ['critical', 'alert', 'warning', 'info'] as const

const COLOR_A = '#0ea5e9'  // sky-500
const COLOR_B = '#8b5cf6'  // violet-500

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countByType(events: Event[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of events) out[e.type] = (out[e.type] ?? 0) + 1
  return out
}

function countBySeverity(findings: Finding[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const f of findings) out[f.severity] = (out[f.severity] ?? 0) + 1
  return out
}

function avgOf(arr: number[]): number {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0
}

function todayStr() { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10)
}

function filterSummariesByRange(summaries: DailySummary[], range: DateRange): DailySummary[] {
  return summaries.filter(s => s.date >= range.from && s.date <= range.to)
}

// ─── Delta cell ───────────────────────────────────────────────────────────────

function DeltaCell({ a, b, lowerIsBetter = true }: { a: number; b: number; lowerIsBetter?: boolean }) {
  const diff = b - a
  if (Math.abs(diff) < 0.005) return <span className="text-slate-300 text-xs">—</span>
  const better = lowerIsBetter ? diff < 0 : diff > 0
  const cls = better ? 'text-emerald-600' : 'text-red-500'
  const lbl = (diff > 0 ? '+' : '') + (Math.abs(diff) >= 10 ? diff.toFixed(0) : diff.toFixed(1))
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold font-mono ${cls}`}>
      <Icon className="w-3 h-3" aria-hidden="true" />
      {lbl}
    </span>
  )
}

// ─── Comparison table primitives ──────────────────────────────────────────────

interface RowProps {
  label: string
  aVal: string
  bVal: string
  aNum?: number
  bNum?: number
  lowerIsBetter?: boolean
  indent?: boolean
}

function CompareRow({ label, aVal, bVal, aNum, bNum, lowerIsBetter = true, indent }: RowProps) {
  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className={`py-2.5 pr-4 text-sm ${indent ? 'pl-8 text-slate-400' : 'pl-4 font-medium text-slate-700'}`}>
        {label}
      </td>
      <td className="px-4 py-2.5 text-sm tabular-nums text-right font-medium text-slate-800">{aVal}</td>
      <td className="px-2 py-2.5 text-center w-16">
        {aNum !== undefined && bNum !== undefined && (
          <DeltaCell a={aNum} b={bNum} lowerIsBetter={lowerIsBetter} />
        )}
      </td>
      <td className="px-4 py-2.5 text-sm tabular-nums text-right font-medium text-slate-800">{bVal}</td>
    </tr>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={4} className="px-4 pt-5 pb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 bg-slate-50 border-t border-slate-100">
        {label}
      </td>
    </tr>
  )
}

// ─── Snapshot card ────────────────────────────────────────────────────────────

function SnapshotCard({
  label, aLabel, bLabel, aVal, bVal, aNum, bNum, lowerIsBetter = true,
}: {
  label: string
  aLabel: string
  bLabel: string
  aVal: string
  bVal: string
  aNum?: number
  bNum?: number
  lowerIsBetter?: boolean
}) {
  const diff = aNum !== undefined && bNum !== undefined ? bNum - aNum : null
  let deltaEl: React.ReactNode = null
  if (diff !== null && Math.abs(diff) >= 0.005) {
    const better = lowerIsBetter ? diff < 0 : diff > 0
    const cls = better ? 'text-emerald-600' : 'text-red-500'
    const lbl = (diff > 0 ? '+' : '') + (Math.abs(diff) >= 10 ? diff.toFixed(0) : diff.toFixed(1))
    const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight
    deltaEl = (
      <span className={`flex items-center gap-0.5 text-xs font-semibold ${cls} mt-0.5`}>
        <Icon className="w-3 h-3" aria-hidden="true" />
        {lbl} · {better ? 'Better' : 'Watch'}
      </span>
    )
  }
  return (
    <div className="card p-4 flex flex-col gap-2">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      <div className="flex items-center justify-around gap-3">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: COLOR_A }}>{aLabel}</span>
          <span className="text-2xl font-bold tabular-nums text-slate-800">{aVal}</span>
        </div>
        <span className="text-slate-300 text-xl pb-1">→</span>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: COLOR_B }}>{bLabel}</span>
          <span className="text-2xl font-bold tabular-nums text-slate-800">{bVal}</span>
        </div>
      </div>
      {deltaEl ?? <span className="text-xs text-slate-300">No change</span>}
    </div>
  )
}

// ─── Session picker ───────────────────────────────────────────────────────────

function SessionPicker({
  sessions, value, onChange, label, exclude,
}: {
  sessions: Session[]
  value: string
  onChange: (id: string) => void
  label: string
  exclude: string
}) {
  return (
    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
      <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: label === 'Session A' ? COLOR_A : COLOR_B }}>
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
        aria-label={`Select ${label}`}
      >
        <option value="">— Select a session —</option>
        {sessions
          .filter(s => s.id !== exclude)
          .map(s => {
            const { label: sev } = ahiLabel(s.ahi)
            return (
              <option key={s.id} value={s.id}>
                {formatDate(s.start_time)} · AHI {formatAHI(s.ahi)} ({sev}) · {formatDuration(s.duration_minutes)}
              </option>
            )
          })}
      </select>
    </div>
  )
}

// ─── Period picker ────────────────────────────────────────────────────────────

function PeriodPicker({
  value, onChange, label,
}: {
  value: DateRange
  onChange: (r: DateRange) => void
  label: string
}) {
  return (
    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
      <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: label === 'Period A' ? COLOR_A : COLOR_B }}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={value.from}
          max={value.to || todayStr()}
          onChange={e => onChange({ ...value, from: e.target.value })}
          className="flex-1 min-w-0 px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
          aria-label={`${label} start date`}
        />
        <span className="text-slate-400 text-sm shrink-0">to</span>
        <input
          type="date"
          value={value.to}
          min={value.from}
          max={todayStr()}
          onChange={e => onChange({ ...value, to: e.target.value })}
          className="flex-1 min-w-0 px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
          aria-label={`${label} end date`}
        />
      </div>
    </div>
  )
}

// ─── Session comparison ───────────────────────────────────────────────────────

interface SessionCompareProps {
  sessA: Session
  sessB: Session
  eventsA: Event[]
  eventsB: Event[]
  findingsA: Finding[]
  findingsB: Finding[]
  summaryA: DailySummary | null
  summaryB: DailySummary | null
  loadingA: boolean
  loadingB: boolean
}

function SessionComparison({
  sessA, sessB, eventsA, eventsB, findingsA, findingsB,
  summaryA, summaryB, loadingA, loadingB,
}: SessionCompareProps) {
  const countsA = useMemo(() => countByType(eventsA), [eventsA])
  const countsB = useMemo(() => countByType(eventsB), [eventsB])
  const sevsA   = useMemo(() => countBySeverity(findingsA), [findingsA])
  const sevsB   = useMemo(() => countBySeverity(findingsB), [findingsB])

  const labelA = formatDate(sessA.start_time)
  const labelB = formatDate(sessB.start_time)

  // Event breakdown chart data
  const eventChartData = EVENT_TYPES.map(et => ({
    name: et.label,
    A: countsA[et.key] ?? 0,
    B: countsB[et.key] ?? 0,
  }))

  // Pressure chart data
  const pressureData = [
    { name: 'P50', A: sessA.pressure_p50, B: sessB.pressure_p50 },
    { name: 'P95', A: sessA.pressure_p95, B: sessB.pressure_p95 },
    { name: 'Max', A: sessA.pressure_max, B: sessB.pressure_max },
  ]

  const isLoading = loadingA || loadingB

  return (
    <div className="space-y-6">
      {/* Snapshot cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SnapshotCard
          label="AHI" aLabel={labelA} bLabel={labelB}
          aVal={formatAHI(sessA.ahi)} bVal={formatAHI(sessB.ahi)}
          aNum={sessA.ahi} bNum={sessB.ahi} lowerIsBetter
        />
        <SnapshotCard
          label="Duration" aLabel={labelA} bLabel={labelB}
          aVal={formatDuration(sessA.duration_minutes)} bVal={formatDuration(sessB.duration_minutes)}
          aNum={sessA.duration_minutes} bNum={sessB.duration_minutes} lowerIsBetter={false}
        />
        <SnapshotCard
          label="Total Events" aLabel={labelA} bLabel={labelB}
          aVal={String(sessA.event_count)} bVal={String(sessB.event_count)}
          aNum={sessA.event_count} bNum={sessB.event_count} lowerIsBetter
        />
        <SnapshotCard
          label="Leak Median" aLabel={labelA} bLabel={labelB}
          aVal={`${sessA.leak_rate_median.toFixed(1)} L/min`} bVal={`${sessB.leak_rate_median.toFixed(1)} L/min`}
          aNum={sessA.leak_rate_median} bNum={sessB.leak_rate_median} lowerIsBetter
        />
      </div>

      {/* Detailed comparison table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm" aria-label="Session comparison">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="pl-4 pr-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Metric</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: COLOR_A }}>
                <span className="flex items-center justify-end gap-1.5">
                  Session A · {labelA}
                  <Link to={`/sessions/${sessA.id}`} className="opacity-50 hover:opacity-100 transition-opacity" aria-label="Open Session A">
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </Link>
                </span>
              </th>
              <th className="px-2 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide w-16">Δ</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: COLOR_B }}>
                <span className="flex items-center justify-end gap-1.5">
                  Session B · {labelB}
                  <Link to={`/sessions/${sessB.id}`} className="opacity-50 hover:opacity-100 transition-opacity" aria-label="Open Session B">
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </Link>
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">

            <SectionHeader label="Session Info" />
            <CompareRow
              label="Date"
              aVal={formatDate(sessA.start_time)} bVal={formatDate(sessB.start_time)}
            />
            <CompareRow
              label="Duration"
              aVal={formatDuration(sessA.duration_minutes)} bVal={formatDuration(sessB.duration_minutes)}
              aNum={sessA.duration_minutes} bNum={sessB.duration_minutes} lowerIsBetter={false}
            />

            <SectionHeader label="AHI & Breathing Events" />
            <CompareRow
              label="AHI (Apnea-Hypopnea Index)"
              aVal={formatAHI(sessA.ahi)} bVal={formatAHI(sessB.ahi)}
              aNum={sessA.ahi} bNum={sessB.ahi}
            />
            {summaryA && summaryB && (
              <>
                <CompareRow
                  label="Apnea Index (AI)" indent
                  aVal={summaryA.ai_index.toFixed(1)} bVal={summaryB.ai_index.toFixed(1)}
                  aNum={summaryA.ai_index} bNum={summaryB.ai_index}
                />
                <CompareRow
                  label="Hypopnea Index (HI)" indent
                  aVal={summaryA.hi_index.toFixed(1)} bVal={summaryB.hi_index.toFixed(1)}
                  aNum={summaryA.hi_index} bNum={summaryB.hi_index}
                />
              </>
            )}
            <CompareRow
              label="Total Events"
              aVal={String(sessA.event_count)} bVal={String(sessB.event_count)}
              aNum={sessA.event_count} bNum={sessB.event_count}
            />
            {!isLoading && EVENT_TYPES.map(et => (
              <CompareRow
                key={et.key}
                label={et.key === 'spo2_desaturation' ? 'SpO₂ Desaturations' :
                       et.key === 'large_leak' ? 'Large Leak Events' :
                       et.key === 'obstructive_apnea' ? 'Obstructive Apneas' :
                       et.key === 'central_apnea' ? 'Central Apneas' : 'Hypopneas'}
                indent
                aVal={String(countsA[et.key] ?? 0)} bVal={String(countsB[et.key] ?? 0)}
                aNum={countsA[et.key] ?? 0} bNum={countsB[et.key] ?? 0}
              />
            ))}

            <SectionHeader label="Pressure (cmH₂O)" />
            <CompareRow
              label="Median (P50)"
              aVal={`${sessA.pressure_p50.toFixed(1)}`} bVal={`${sessB.pressure_p50.toFixed(1)}`}
              aNum={sessA.pressure_p50} bNum={sessB.pressure_p50} lowerIsBetter={false}
            />
            <CompareRow
              label="95th Percentile (P95)"
              aVal={`${sessA.pressure_p95.toFixed(1)}`} bVal={`${sessB.pressure_p95.toFixed(1)}`}
              aNum={sessA.pressure_p95} bNum={sessB.pressure_p95} lowerIsBetter={false}
            />
            <CompareRow
              label="Maximum"
              aVal={`${sessA.pressure_max.toFixed(1)}`} bVal={`${sessB.pressure_max.toFixed(1)}`}
              aNum={sessA.pressure_max} bNum={sessB.pressure_max} lowerIsBetter={false}
            />

            <SectionHeader label="Leak Rate (L/min)" />
            <CompareRow
              label="Median Leak"
              aVal={`${sessA.leak_rate_median.toFixed(1)}`} bVal={`${sessB.leak_rate_median.toFixed(1)}`}
              aNum={sessA.leak_rate_median} bNum={sessB.leak_rate_median}
            />
            {summaryA && summaryB && (
              <CompareRow
                label="95th Percentile (P95)" indent
                aVal={`${summaryA.leak_rate_p95.toFixed(1)}`} bVal={`${summaryB.leak_rate_p95.toFixed(1)}`}
                aNum={summaryA.leak_rate_p95} bNum={summaryB.leak_rate_p95}
              />
            )}

            {!isLoading && (
              <>
                <SectionHeader label="Findings" />
                {SEVERITIES.map(sev => (
                  <CompareRow
                    key={sev}
                    label={sev.charAt(0).toUpperCase() + sev.slice(1)}
                    aVal={String(sevsA[sev] ?? 0)} bVal={String(sevsB[sev] ?? 0)}
                    aNum={sevsA[sev] ?? 0} bNum={sevsB[sev] ?? 0}
                  />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Charts */}
      {!isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Event breakdown */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Event Breakdown</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={eventChartData} barCategoryGap="30%" barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="A" name={labelA} fill={COLOR_A} radius={[3, 3, 0, 0]} />
                <Bar dataKey="B" name={labelB} fill={COLOR_B} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pressure comparison */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Pressure Profile (cmH₂O)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pressureData} barCategoryGap="30%" barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                  domain={['auto', 'auto']}
                  unit=" cm"
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  cursor={{ fill: '#f8fafc' }}
                  formatter={(v: number) => [`${v.toFixed(1)} cmH₂O`]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="A" name={labelA} fill={COLOR_A} radius={[3, 3, 0, 0]} />
                <Bar dataKey="B" name={labelB} fill={COLOR_B} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Findings by severity */}
          {(findingsA.length > 0 || findingsB.length > 0) && (
            <div className="card p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Findings by Severity</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={SEVERITIES.map(sev => ({
                    name: sev.charAt(0).toUpperCase() + sev.slice(1),
                    A: sevsA[sev] ?? 0,
                    B: sevsB[sev] ?? 0,
                  }))}
                  barCategoryGap="30%"
                  barGap={4}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    cursor={{ fill: '#f8fafc' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="A" name={labelA} fill={COLOR_A} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="B" name={labelB} fill={COLOR_B} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Period comparison ────────────────────────────────────────────────────────

const PERIOD_PRESETS = [
  { label: 'Last 7 vs Prev 7', a: { from: daysAgo(14), to: daysAgo(7) }, b: { from: daysAgo(7), to: todayStr() } },
  { label: 'Last 30 vs Prev 30', a: { from: daysAgo(60), to: daysAgo(30) }, b: { from: daysAgo(30), to: todayStr() } },
  { label: 'Last 90 vs Prev 90', a: { from: daysAgo(180), to: daysAgo(90) }, b: { from: daysAgo(90), to: todayStr() } },
]

function PeriodComparison({
  summaries, periodA, periodB,
}: {
  summaries: DailySummary[]
  periodA: DateRange
  periodB: DateRange
}) {
  const sumsA = useMemo(() => filterSummariesByRange(summaries, periodA), [summaries, periodA])
  const sumsB = useMemo(() => filterSummariesByRange(summaries, periodB), [summaries, periodB])

  const complianceThreshold = 240 // 4 hours in minutes

  function periodStats(sums: DailySummary[]) {
    if (sums.length === 0) return null
    const nights = sums.length
    const compliant = sums.filter(s => s.usage_minutes >= complianceThreshold).length
    return {
      nights,
      compliant,
      compliancePct: nights > 0 ? (compliant / nights) * 100 : 0,
      avgAhi: avgOf(sums.map(s => s.ahi)),
      avgAi: avgOf(sums.map(s => s.ai_index)),
      avgHi: avgOf(sums.map(s => s.hi_index)),
      avgUsage: avgOf(sums.map(s => s.usage_minutes)),
      avgPressP50: avgOf(sums.map(s => s.pressure_p50)),
      avgPressP95: avgOf(sums.map(s => s.pressure_p95)),
      avgLeakMedian: avgOf(sums.map(s => s.leak_rate_median)),
      avgLeakP95: avgOf(sums.map(s => s.leak_rate_p95)),
    }
  }

  const statsA = useMemo(() => periodStats(sumsA), [sumsA])
  const statsB = useMemo(() => periodStats(sumsB), [sumsB])

  // AHI trend chart: align by night index (1..N)
  const trendData = useMemo(() => {
    const maxLen = Math.max(sumsA.length, sumsB.length)
    return Array.from({ length: maxLen }, (_, i) => ({
      night: i + 1,
      A: sumsA[i]?.ahi ?? null,
      B: sumsB[i]?.ahi ?? null,
    }))
  }, [sumsA, sumsB])

  const aLabel = `${periodA.from} – ${periodA.to}`
  const bLabel = `${periodB.from} – ${periodB.to}`

  const noData = sumsA.length === 0 && sumsB.length === 0

  if (noData) {
    return (
      <div className="card p-12 text-center">
        <CalendarDays className="w-10 h-10 text-slate-300 mx-auto mb-3" aria-hidden="true" />
        <p className="text-slate-500 text-sm">No sessions found in the selected date ranges.</p>
        <p className="text-slate-400 text-xs mt-1">Try adjusting the date ranges or importing more data.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Snapshot cards */}
      {statsA && statsB && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SnapshotCard
            label="Avg AHI" aLabel="Period A" bLabel="Period B"
            aVal={formatAHI(statsA.avgAhi)} bVal={formatAHI(statsB.avgAhi)}
            aNum={statsA.avgAhi} bNum={statsB.avgAhi} lowerIsBetter
          />
          <SnapshotCard
            label="Avg Usage" aLabel="Period A" bLabel="Period B"
            aVal={formatDuration(statsA.avgUsage)} bVal={formatDuration(statsB.avgUsage)}
            aNum={statsA.avgUsage} bNum={statsB.avgUsage} lowerIsBetter={false}
          />
          <SnapshotCard
            label="Compliance" aLabel="Period A" bLabel="Period B"
            aVal={`${statsA.compliancePct.toFixed(0)}%`} bVal={`${statsB.compliancePct.toFixed(0)}%`}
            aNum={statsA.compliancePct} bNum={statsB.compliancePct} lowerIsBetter={false}
          />
          <SnapshotCard
            label="Avg Leak Median" aLabel="Period A" bLabel="Period B"
            aVal={`${statsA.avgLeakMedian.toFixed(1)} L/min`} bVal={`${statsB.avgLeakMedian.toFixed(1)} L/min`}
            aNum={statsA.avgLeakMedian} bNum={statsB.avgLeakMedian} lowerIsBetter
          />
        </div>
      )}

      {/* Detailed comparison table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm" aria-label="Period comparison">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="pl-4 pr-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Metric</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: COLOR_A }}>
                Period A · {aLabel}
              </th>
              <th className="px-2 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide w-16">Δ</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: COLOR_B }}>
                Period B · {bLabel}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <SectionHeader label="Overview" />
            <CompareRow
              label="Nights in period"
              aVal={String(sumsA.length)} bVal={String(sumsB.length)}
              aNum={sumsA.length} bNum={sumsB.length} lowerIsBetter={false}
            />
            {statsA && statsB && (
              <>
                <CompareRow
                  label="Compliant nights (≥ 4h)" indent
                  aVal={`${statsA.compliant} / ${statsA.nights}`} bVal={`${statsB.compliant} / ${statsB.nights}`}
                  aNum={statsA.compliant} bNum={statsB.compliant} lowerIsBetter={false}
                />
                <CompareRow
                  label="Compliance %"
                  aVal={`${statsA.compliancePct.toFixed(1)}%`} bVal={`${statsB.compliancePct.toFixed(1)}%`}
                  aNum={statsA.compliancePct} bNum={statsB.compliancePct} lowerIsBetter={false}
                />
                <CompareRow
                  label="Avg nightly usage"
                  aVal={formatDuration(statsA.avgUsage)} bVal={formatDuration(statsB.avgUsage)}
                  aNum={statsA.avgUsage} bNum={statsB.avgUsage} lowerIsBetter={false}
                />

                <SectionHeader label="Sleep Quality" />
                <CompareRow
                  label="Average AHI"
                  aVal={formatAHI(statsA.avgAhi)} bVal={formatAHI(statsB.avgAhi)}
                  aNum={statsA.avgAhi} bNum={statsB.avgAhi}
                />
                <CompareRow
                  label="Average Apnea Index (AI)" indent
                  aVal={statsA.avgAi.toFixed(1)} bVal={statsB.avgAi.toFixed(1)}
                  aNum={statsA.avgAi} bNum={statsB.avgAi}
                />
                <CompareRow
                  label="Average Hypopnea Index (HI)" indent
                  aVal={statsA.avgHi.toFixed(1)} bVal={statsB.avgHi.toFixed(1)}
                  aNum={statsA.avgHi} bNum={statsB.avgHi}
                />

                <SectionHeader label="Pressure (cmH₂O) — averages" />
                <CompareRow
                  label="Avg Pressure Median (P50)"
                  aVal={statsA.avgPressP50.toFixed(1)} bVal={statsB.avgPressP50.toFixed(1)}
                  aNum={statsA.avgPressP50} bNum={statsB.avgPressP50} lowerIsBetter={false}
                />
                <CompareRow
                  label="Avg Pressure P95"
                  aVal={statsA.avgPressP95.toFixed(1)} bVal={statsB.avgPressP95.toFixed(1)}
                  aNum={statsA.avgPressP95} bNum={statsB.avgPressP95} lowerIsBetter={false}
                />

                <SectionHeader label="Leak Rate (L/min) — averages" />
                <CompareRow
                  label="Avg Leak Median"
                  aVal={statsA.avgLeakMedian.toFixed(1)} bVal={statsB.avgLeakMedian.toFixed(1)}
                  aNum={statsA.avgLeakMedian} bNum={statsB.avgLeakMedian}
                />
                <CompareRow
                  label="Avg Leak P95" indent
                  aVal={statsA.avgLeakP95.toFixed(1)} bVal={statsB.avgLeakP95.toFixed(1)}
                  aNum={statsA.avgLeakP95} bNum={statsB.avgLeakP95}
                />
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* AHI trend chart */}
      {trendData.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">AHI Trend — Night by Night</h3>
          <p className="text-xs text-slate-400 mb-4">Each period aligned from night 1 — useful for comparing trajectory, not absolute dates.</p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData} margin={{ right: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="night"
                label={{ value: 'Night', position: 'insideBottomRight', offset: -8, fontSize: 11, fill: '#94a3b8' }}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                domain={[0, 'auto']}
              />
              <ReferenceLine y={5}  stroke="#10b981" strokeDasharray="4 2" strokeWidth={1} label={{ value: 'Normal', position: 'right', fontSize: 9, fill: '#10b981' }} />
              <ReferenceLine y={15} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1} label={{ value: 'Mild', position: 'right', fontSize: 9, fill: '#f59e0b' }} />
              <ReferenceLine y={30} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1} label={{ value: 'Moderate', position: 'right', fontSize: 9, fill: '#ef4444' }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                formatter={(v, name: string) => [
                  v != null ? `AHI ${(v as number).toFixed(1)}` : 'No data',
                  name === 'A' ? `Period A (${aLabel})` : `Period B (${bLabel})`,
                ]}
                labelFormatter={n => `Night ${n}`}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(val) => val === 'A' ? `Period A (${aLabel})` : `Period B (${bLabel})`}
              />
              <Line type="monotone" dataKey="A" stroke={COLOR_A} strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="B" stroke={COLOR_B} strokeWidth={2} dot={false} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-period nightly AHI bars */}
      {(sumsA.length > 0 || sumsB.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[
            { label: `Period A — ${aLabel}`, sums: sumsA, color: COLOR_A },
            { label: `Period B — ${bLabel}`, sums: sumsB, color: COLOR_B },
          ].map(({ label, sums, color }) => (
            <div key={label} className="card p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">{label}</h3>
              {sums.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No sessions in this period.</p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={sums.map(s => ({ date: s.date.slice(5), ahi: s.ahi }))}
                    barCategoryGap="20%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
                    <ReferenceLine y={5}  stroke="#10b981" strokeDasharray="3 2" strokeWidth={1} />
                    <ReferenceLine y={15} stroke="#f59e0b" strokeDasharray="3 2" strokeWidth={1} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                      formatter={(v: number) => [`AHI ${v.toFixed(1)}`]}
                    />
                    <Bar dataKey="ahi" name="AHI" fill={color} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function Compare() {
  const [mode, setMode] = useState<CompareMode>('session')
  const [sessionAId, setSessionAId] = useState('')
  const [sessionBId, setSessionBId] = useState('')
  const [periodA, setPeriodA] = useState<DateRange>({ from: daysAgo(60), to: daysAgo(30) })
  const [periodB, setPeriodB] = useState<DateRange>({ from: daysAgo(30), to: todayStr() })

  const sessionsQ = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.sessions.list(),
  })

  const summariesQ = useQuery({
    queryKey: ['summaries', 365],
    queryFn: () => api.summaries.daily(365),
  })

  const eventsAQ = useQuery({
    queryKey: ['events', sessionAId],
    queryFn: () => api.sessions.events(sessionAId),
    enabled: !!sessionAId,
  })

  const eventsBQ = useQuery({
    queryKey: ['events', sessionBId],
    queryFn: () => api.sessions.events(sessionBId),
    enabled: !!sessionBId,
  })

  const findingsAQ = useQuery({
    queryKey: ['findings', sessionAId],
    queryFn: () => api.sessions.findings(sessionAId),
    enabled: !!sessionAId,
  })

  const findingsBQ = useQuery({
    queryKey: ['findings', sessionBId],
    queryFn: () => api.sessions.findings(sessionBId),
    enabled: !!sessionBId,
  })

  if (sessionsQ.isLoading || summariesQ.isLoading) return <FullPageSpinner />
  if (sessionsQ.isError || summariesQ.isError) return <ErrorBanner message="Failed to load data." />

  const sessions  = sessionsQ.data?.sessions ?? []
  const summaries = summariesQ.data?.summaries ?? []

  const sessA = sessions.find(s => s.id === sessionAId) ?? null
  const sessB = sessions.find(s => s.id === sessionBId) ?? null

  const summaryA = summaries.find(s => s.session_id === sessionAId) ?? null
  const summaryB = summaries.find(s => s.session_id === sessionBId) ?? null

  const bothSelected = !!sessA && !!sessB

  return (
    <div>
      <PageHeader
        title="Compare"
        description="Side-by-side comparison of sessions or time periods"
      />

      {/* Mode toggle */}
      <div className="flex gap-1 mb-6 p-1 bg-slate-100 rounded-xl w-fit">
        {([
          { key: 'session', label: 'Sessions', icon: Layers },
          { key: 'period',  label: 'Periods',  icon: CalendarDays },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            aria-pressed={mode === key}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {mode === 'session' && (
        <div className="space-y-6">
          {/* Session pickers */}
          <div className="card p-5">
            <div className="flex items-end gap-4">
              <SessionPicker
                sessions={sessions}
                value={sessionAId}
                onChange={setSessionAId}
                label="Session A"
                exclude={sessionBId}
              />
              <div className="flex-none pb-2.5">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-400 text-xs font-bold">
                  vs
                </span>
              </div>
              <SessionPicker
                sessions={sessions}
                value={sessionBId}
                onChange={setSessionBId}
                label="Session B"
                exclude={sessionAId}
              />
            </div>
          </div>

          {bothSelected ? (
            <SessionComparison
              sessA={sessA!}
              sessB={sessB!}
              eventsA={eventsAQ.data?.events ?? []}
              eventsB={eventsBQ.data?.events ?? []}
              findingsA={findingsAQ.data?.findings ?? []}
              findingsB={findingsBQ.data?.findings ?? []}
              summaryA={summaryA}
              summaryB={summaryB}
              loadingA={eventsAQ.isLoading || findingsAQ.isLoading}
              loadingB={eventsBQ.isLoading || findingsBQ.isLoading}
            />
          ) : (
            <div className="card p-12 text-center">
              <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" aria-hidden="true" />
              <p className="text-slate-500 text-sm">Select two sessions above to compare them.</p>
              {sessions.length < 2 && (
                <p className="text-slate-400 text-xs mt-1">You need at least two sessions imported.</p>
              )}
            </div>
          )}
        </div>
      )}

      {mode === 'period' && (
        <div className="space-y-6">
          {/* Period pickers */}
          <div className="card p-5 space-y-4">
            <div className="flex items-end gap-4">
              <PeriodPicker value={periodA} onChange={setPeriodA} label="Period A" />
              <div className="flex-none pb-2.5">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-400 text-xs font-bold">
                  vs
                </span>
              </div>
              <PeriodPicker value={periodB} onChange={setPeriodB} label="Period B" />
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100">
              <span className="text-xs text-slate-400 self-center">Quick:</span>
              {PERIOD_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => { setPeriodA(preset.a); setPeriodB(preset.b) }}
                  className="btn-ghost text-xs px-3 py-1.5"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <PeriodComparison
            summaries={summaries}
            periodA={periodA}
            periodB={periodB}
          />
        </div>
      )}
    </div>
  )
}
