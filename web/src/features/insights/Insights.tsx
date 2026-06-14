import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area,
  BarChart, Bar,
  ComposedChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, ReferenceLine,
  Legend,
} from 'recharts'
import {
  TrendingUp, Flame, Trophy, Star, Moon, Zap, Activity,
  Gauge, Target, Info,
} from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { FullPageSpinner } from '@/components/LoadingSpinner'
import { ErrorBanner } from '@/components/ErrorBanner'
import type { DailySummary } from '@/types'

// ─── Period selector ──────────────────────────────────────────────────────────

const PERIODS = [
  { label: 'Week',     days: 7   },
  { label: 'Month',    days: 30  },
  { label: '3 Months', days: 90  },
  { label: '6 Months', days: 180 },
  { label: '1 Year',   days: 365 },
]

// ─── AHI severity zones ───────────────────────────────────────────────────────

const AHI_ZONES = [
  { lo: 0,    hi: 5,    fill: '#dcfce7', label: 'Normal'   },
  { lo: 5,    hi: 15,   fill: '#fef9c3', label: 'Mild'     },
  { lo: 15,   hi: 30,   fill: '#fed7aa', label: 'Moderate' },
  { lo: 30,   hi: 9999, fill: '#fecaca', label: 'Severe'   },
]

// ─── Event display config ─────────────────────────────────────────────────────

const EVENT_CFG: Record<string, { label: string; color: string }> = {
  central_apnea:     { label: 'Central Apnea',   color: '#a855f7' },
  hypopnea:          { label: 'Hypopnea',         color: '#f59e0b' },
  obstructive_apnea: { label: 'Obstructive Apnea',color: '#ef4444' },
  spo2_desaturation: { label: 'SpO₂ Desat.',      color: '#3b82f6' },
  large_leak:        { label: 'Large Leak',        color: '#f97316' },
}

const EVENT_ORDER = ['central_apnea', 'hypopnea', 'obstructive_apnea', 'spo2_desaturation', 'large_leak']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | undefined, decimals = 1): string {
  if (n === undefined || isNaN(n)) return '—'
  return n.toFixed(decimals)
}

function fmtDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${m}/${d}`
}

function usageColor(hours: number): string {
  if (hours >= 4)  return '#22c55e'
  if (hours >= 2)  return '#f59e0b'
  return '#ef4444'
}

function ahiColor(ahi: number): string {
  if (ahi < 5)  return '#22c55e'
  if (ahi < 15) return '#f59e0b'
  if (ahi < 30) return '#f97316'
  return '#ef4444'
}

// Fill a date range with DailySummary data, returning an array of N entries
// where missing nights have a sentinel entry (session_id = '').
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

// ─── Night quality calendar ───────────────────────────────────────────────────

interface CalendarProps {
  summaries: DailySummary[]
  days: number
  firstSessionDate: string | null
}

function NightCalendar({ summaries, days, firstSessionDate }: CalendarProps) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState<string | null>(null)

  const byDate = new Map(summaries.map(s => [s.date, s]))

  // Determine the grid: start on Sunday of the earliest week
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startDate = new Date(today)
  startDate.setDate(startDate.getDate() - days + 1)
  // Rewind to Sunday
  startDate.setDate(startDate.getDate() - startDate.getDay())

  const cells: { date: string; inRange: boolean }[] = []
  const cur = new Date(startDate)
  while (cur <= today) {
    const key = cur.toISOString().slice(0, 10)
    const inRange = cur >= new Date(today.getTime() - days * 86400_000 + 1)
    cells.push({ date: key, inRange })
    cur.setDate(cur.getDate() + 1)
  }
  // Pad to complete last column
  while (cells.length % 7 !== 0) {
    const key = cur.toISOString().slice(0, 10)
    cells.push({ date: key, inRange: false })
    cur.setDate(cur.getDate() + 1)
  }

  const numCols = cells.length / 7

  // Month labels: find the first day of each month in our cell list
  const monthLabels: { col: number; label: string }[] = []
  cells.forEach(({ date }, idx) => {
    const col = Math.floor(idx / 7)
    if (date.endsWith('-01') || idx === 0) {
      const d = new Date(date + 'T12:00:00')
      const label = d.toLocaleString('default', { month: 'short' })
      if (!monthLabels.length || monthLabels[monthLabels.length - 1].col !== col) {
        monthLabels.push({ col, label })
      }
    }
  })

  const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

  function cellColor(date: string, inRange: boolean): string {
    if (!inRange) return 'transparent'
    if (firstSessionDate && date < firstSessionDate) return '#e0f2fe'
    const s = byDate.get(date)
    if (!s) return '#f1f5f9'
    if (s.usage_minutes === 0) return '#f1f5f9'
    const h = s.usage_minutes / 60
    if (h >= 4) return ahiColor(s.ahi)
    if (h >= 2) return '#f59e0b'
    return '#fca5a5'
  }

  const GAP = 3
  const LABEL_W = 18
  const CELL_H = 30
  const cols = `${LABEL_W}px repeat(${numCols}, 1fr)`

  return (
    <div className="w-full">
      {/* Month row */}
      <div
        className="grid mb-1"
        style={{ gridTemplateColumns: cols, columnGap: GAP }}
      >
        <div />
        {Array.from({ length: numCols }, (_, col) => {
          const ml = monthLabels.find(m => m.col === col)
          return (
            <div key={col} className="text-[10px] text-slate-400 font-medium">
              {ml?.label ?? ''}
            </div>
          )
        })}
      </div>

      {/* Day rows */}
      {DAY_LABELS.map((day, row) => (
        <div
          key={row}
          className="grid mb-0.5"
          style={{ gridTemplateColumns: cols, columnGap: GAP }}
        >
          <div className="text-[10px] text-slate-400 leading-none self-center">{day}</div>
          {Array.from({ length: numCols }, (_, col) => {
            const cellIdx = col * 7 + row
            const cell = cells[cellIdx]
            if (!cell) return <div key={col} />
            const { date, inRange } = cell
            const s = byDate.get(date)
            const bg = cellColor(date, inRange)
            const isToday = date === today.toISOString().slice(0, 10)

            return (
              <div
                key={col}
                title={
                  !inRange ? undefined :
                  firstSessionDate && date < firstSessionDate ? `${date}  Before therapy started` :
                  s ? `${date}  AHI ${s.ahi.toFixed(1)}  ${(s.usage_minutes / 60).toFixed(1)}h` :
                  `${date}  No session`
                }
                onClick={() => { if (s?.session_id) navigate(`/sessions/${s.session_id}`) }}
                onMouseEnter={() => setHovered(date)}
                onMouseLeave={() => setHovered(null)}
                className={`
                  rounded-sm transition-opacity
                  ${inRange && s?.session_id ? 'cursor-pointer hover:opacity-70' : ''}
                  ${isToday ? 'ring-1 ring-brand-500 ring-offset-1' : ''}
                `}
                style={{ backgroundColor: bg, height: CELL_H }}
              />
            )
          })}
        </div>
      ))}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        {firstSessionDate && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#e0f2fe' }} /> Before therapy
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <div className="w-3 h-3 rounded-sm bg-slate-100" /> No session
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <div className="w-3 h-3 rounded-sm bg-green-500" /> AHI &lt;5 (normal)
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <div className="w-3 h-3 rounded-sm bg-amber-400" /> AHI 5–15
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <div className="w-3 h-3 rounded-sm bg-orange-400" /> AHI 15–30
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <div className="w-3 h-3 rounded-sm bg-red-400" /> AHI &gt;30
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <div className="w-3 h-3 rounded-sm bg-amber-400/60" /> Short (&lt;4h)
        </div>
      </div>
    </div>
  )
}

// ─── Custom tooltip for usage bar chart ───────────────────────────────────────

function UsageTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const hours = payload[0].value
  if (hours === 0) return (
    <div className="bg-white border border-slate-200 rounded-lg shadow px-3 py-2 text-xs">
      <p className="font-medium text-slate-700">{label}</p>
      <p className="text-slate-400">No session</p>
    </div>
  )
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow px-3 py-2 text-xs">
      <p className="font-medium text-slate-700">{label}</p>
      <p className="text-slate-600">{hours.toFixed(1)} hrs used</p>
      <p className={hours >= 4 ? 'text-green-600' : hours >= 2 ? 'text-amber-600' : 'text-red-500'}>
        {hours >= 4 ? 'Compliant' : hours >= 2 ? 'Below target' : 'Non-compliant'}
      </p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Insights() {
  const navigate = useNavigate()
  const [days, setDays] = useState(30)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['insights', days],
    queryFn: () => api.insights(days),
  })

  const { data: settingsData } = useQuery({
    queryKey: ['app-settings'],
    queryFn: api.appSettings.get,
  })

  const hoursThreshold = settingsData?.compliance_hours_threshold ?? 4.0
  const pctThreshold = settingsData?.compliance_pct_threshold ?? 70.0
  const firstSessionDate = settingsData?.first_session_date ?? null

  const { isNewUser, effectiveDays } = useMemo(() => {
    const today = new Date()
    const windowStart = new Date(today)
    windowStart.setDate(windowStart.getDate() - days)
    const windowStartDate = windowStart.toISOString().slice(0, 10)
    const isNewUser = firstSessionDate !== null && firstSessionDate > windowStartDate
    let effectiveDays = days
    if (isNewUser && firstSessionDate) {
      const first = new Date(firstSessionDate + 'T12:00:00')
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      effectiveDays = Math.max(1, Math.round((yesterday.getTime() - first.getTime()) / 86400_000) + 1)
    }
    return { isNewUser, effectiveDays }
  }, [firstSessionDate, days])

  const stats = useMemo(() => {
    const summaries = data?.summaries ?? []
    if (!summaries.length) return null

    const compliantNights = summaries.filter(s => s.usage_minutes >= hoursThreshold * 60)
    const nightsWithSession = summaries.filter(s => s.session_id !== '')

    const avgAHI = nightsWithSession.length
      ? nightsWithSession.reduce((a, s) => a + s.ahi, 0) / nightsWithSession.length
      : 0
    const avgUsageHrs = nightsWithSession.length
      ? nightsWithSession.reduce((a, s) => a + s.usage_minutes, 0) / nightsWithSession.length / 60
      : 0
    const complianceRate = (compliantNights.length / effectiveDays) * 100
    const bestNight = nightsWithSession.reduce<DailySummary | null>(
      (best, s) => (!best || s.ahi < best.ahi) ? s : best, null
    )
    const totalEvents = Object.values(data?.event_counts ?? {}).reduce((a, v) => a + v, 0)
    const mostCommonEvent = EVENT_ORDER.find(t => data?.event_counts?.[t])

    return { avgAHI, avgUsageHrs, complianceRate, bestNight, totalEvents, mostCommonEvent, nightsWithSession }
  }, [data, days, hoursThreshold, effectiveDays])

  // Chart data
  const allDates = useMemo(() => fillDateRange(data?.summaries ?? [], days), [data, days])

  const ahiChartData = useMemo(
    () => allDates
      .filter(s => s.session_id)
      .map(s => ({ date: fmtDate(s.date), ahi: +s.ahi.toFixed(2), session_id: s.session_id })),
    [allDates],
  )

  const usageChartData = useMemo(
    () => allDates.map(s => ({
      date: fmtDate(s.date),
      hours: s.session_id ? +(s.usage_minutes / 60).toFixed(2) : 0,
      hasSession: !!s.session_id,
    })),
    [allDates],
  )

  const pressureChartData = useMemo(
    () => allDates
      .filter(s => s.session_id && s.pressure_p50 > 0)
      .map(s => ({
        date: fmtDate(s.date),
        p50: +s.pressure_p50.toFixed(1),
        p95: +s.pressure_p95.toFixed(1),
      })),
    [allDates],
  )

  const sinceDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString().slice(0, 10)
  }, [days])

  const eventPieData = useMemo(
    () => EVENT_ORDER
      .filter(t => (data?.event_counts?.[t] ?? 0) > 0)
      .map(t => ({
        name: EVENT_CFG[t]?.label ?? t,
        value: data?.event_counts?.[t] ?? 0,
        color: EVENT_CFG[t]?.color ?? '#94a3b8',
        eventType: t,
      })),
    [data],
  )

  const goToEventSessions = (eventType: string) => {
    navigate(`/sessions?event_type=${eventType}&since=${sinceDate}`)
  }

  // Returns a Recharts interval value that keeps at most ~8 labels visible.
  function nTicks(dataLen: number): number {
    return Math.max(0, Math.ceil(dataLen / 8) - 1)
  }

  if (isLoading) return <FullPageSpinner />
  if (isError) return <ErrorBanner message="Failed to load insights data." />

  const periodSelector = (
    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
      {PERIODS.map(p => (
        <button
          key={p.days}
          onClick={() => setDays(p.days)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            days === p.days
              ? 'bg-white text-brand-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )

  const noData = (data?.summaries ?? []).length === 0

  return (
    <div>
      <PageHeader
        title="Insights"
        description="Therapy trends and long-term analysis"
        action={periodSelector}
      />

      {noData ? (
        <div className="card p-16 text-center mt-4">
          <TrendingUp className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No data for this period</p>
          <p className="text-slate-400 text-sm mt-1">
            Import sessions or generate seed data to see insights.
          </p>
        </div>
      ) : (
        <>
          {isNewUser && firstSessionDate && (
            <div className="flex items-start gap-3 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 mb-6 text-sm text-sky-800">
              <Info className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
              <span>
                Metrics are calculated from your first session on{' '}
                <strong>{firstSessionDate}</strong>.
                Only nights since then count toward your compliance rate.
              </span>
            </div>
          )}

          {/* ── KPI row ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Avg AHI"
              value={stats ? fmt(stats.avgAHI) : '—'}
              sub="events / hour"
              accent={stats && stats.avgAHI < 5 ? 'text-emerald-600' : stats && stats.avgAHI < 15 ? 'text-amber-600' : 'text-red-600'}
            />
            <StatCard
              label="Compliance Rate"
              value={stats ? `${fmt(stats.complianceRate, 0)}%` : '—'}
              sub={`nights ≥ ${hoursThreshold}h`}
              accent={stats && stats.complianceRate >= pctThreshold ? 'text-emerald-600' : 'text-amber-600'}
            />
            <StatCard
              label="Avg Usage"
              value={stats ? `${fmt(stats.avgUsageHrs)}h` : '—'}
              sub="per night with session"
            />
            <StatCard
              label="Therapy Nights"
              value={stats ? stats.nightsWithSession.length : '—'}
              sub={isNewUser ? `of ${effectiveDays} days (from first session)` : `of ${days} days`}
            />
          </div>

          {/* ── AHI trend ── */}
          <div className="card p-5 mb-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-brand-500" />
              AHI Trend
              <span className="text-xs font-normal text-slate-400 ml-1">Apnea-Hypopnea Index per night</span>
            </h2>
            {ahiChartData.length < 2 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart
                  data={ahiChartData}
                  margin={{ top: 4, right: 4, bottom: 0, left: -8 }}
                  style={{ cursor: 'pointer' }}
                  onClick={(state) => {
                    const id = state?.activePayload?.[0]?.payload?.session_id
                    if (id) navigate(`/sessions/${id}`)
                  }}
                >
                  {AHI_ZONES.map(z => (
                    <ReferenceArea
                      key={z.label} y1={z.lo} y2={z.hi}
                      fill={z.fill} fillOpacity={0.5} ifOverflow="hidden"
                    />
                  ))}
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" interval={nTicks(ahiChartData.length)} />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[0, 'auto']} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    formatter={(v: number) => [v.toFixed(2), 'AHI']}
                  />
                  <ReferenceLine y={5}  stroke="#86efac" strokeDasharray="4 2" strokeWidth={1} />
                  <ReferenceLine y={15} stroke="#fcd34d" strokeDasharray="4 2" strokeWidth={1} />
                  <ReferenceLine y={30} stroke="#f97316" strokeDasharray="4 2" strokeWidth={1} />
                  <Line
                    type="monotone" dataKey="ahi" stroke="#0ea5e9"
                    strokeWidth={2} dot={ahiChartData.length <= 60 ? { r: 3 } : false}
                    activeDot={{ r: 5, cursor: 'pointer' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ── Usage + Pressure ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Nightly usage */}
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Moon className="w-4 h-4 text-brand-500" />
                Nightly Usage
                <span className="text-xs font-normal text-slate-400 ml-1">hours / night</span>
              </h2>
              {usageChartData.every(d => !d.hasSession) ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={usageChartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" interval={nTicks(usageChartData.length)} />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[0, 'auto']} />
                    <ReferenceLine y={4} stroke="#22c55e" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: '4h', fontSize: 9, fill: '#22c55e', position: 'right' }} />
                    <Tooltip content={<UsageTooltip />} />
                    <Bar dataKey="hours" radius={[2, 2, 0, 0]} maxBarSize={24}>
                      {usageChartData.map((d, i) => (
                        <Cell
                          key={i}
                          fill={d.hours === 0 ? '#e2e8f0' : usageColor(d.hours)}
                          fillOpacity={d.hours === 0 ? 0.4 : 0.85}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Pressure profile */}
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Gauge className="w-4 h-4 text-brand-500" />
                Pressure Profile
                <span className="text-xs font-normal text-slate-400 ml-1">cmH₂O · P50 and P95</span>
              </h2>
              {pressureChartData.length < 2 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={pressureChartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" interval={nTicks(pressureChartData.length)} />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                      formatter={(v: number, name: string) => [
                        `${v.toFixed(1)} cmH₂O`,
                        name === 'p95' ? 'P95 pressure' : 'P50 pressure',
                      ]}
                    />
                    <Legend
                      iconType="line"
                      formatter={(v) => <span className="text-xs text-slate-600">{v === 'p95' ? 'P95' : 'P50'}</span>}
                    />
                    <Area
                      type="monotone" dataKey="p95" stroke="#818cf8" fill="#e0e7ff"
                      strokeWidth={1.5} dot={false} fillOpacity={0.4}
                    />
                    <Area
                      type="monotone" dataKey="p50" stroke="#6366f1" fill="#c7d2fe"
                      strokeWidth={2} dot={false} fillOpacity={0.4}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* ── Event donut + Calendar ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Event breakdown donut */}
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-brand-500" />
                Event Breakdown
                <span className="text-xs font-normal text-slate-400 ml-1">{stats?.totalEvents ?? 0} total events</span>
              </h2>
              {eventPieData.length === 0 ? (
                <div className="h-44 flex items-center justify-center text-slate-400 text-sm">
                  No events recorded.
                </div>
              ) : (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart style={{ cursor: 'pointer' }}>
                      <Pie
                        data={eventPieData} dataKey="value"
                        cx="50%" cy="50%"
                        innerRadius={46} outerRadius={72}
                        strokeWidth={2} stroke="#fff"
                        onClick={(entry) => goToEventSessions(entry.eventType)}
                      >
                        {eventPieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                        formatter={(v: number, name: string) => [v, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1">
                    {eventPieData.map(e => {
                      const pct = stats?.totalEvents
                        ? ((e.value / stats.totalEvents) * 100).toFixed(0)
                        : '0'
                      return (
                        <button
                          key={e.name}
                          onClick={() => goToEventSessions(e.eventType)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors text-left group"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: e.color }}
                          />
                          <span className="text-xs text-slate-600 flex-1 group-hover:text-slate-900">{e.name}</span>
                          <span className="text-xs font-mono text-slate-500">{e.value}</span>
                          <span className="text-xs text-slate-400 w-8 text-right">{pct}%</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Night quality calendar */}
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Target className="w-4 h-4 text-brand-500" />
                Night Quality
                <span className="text-xs font-normal text-slate-400 ml-1">click a cell to open that session</span>
              </h2>
              <NightCalendar summaries={data?.summaries ?? []} days={days} firstSessionDate={firstSessionDate} />
            </div>
          </div>

          {/* ── Highlights strip ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <HighlightCard
              icon={<Flame className="w-5 h-5 text-orange-500" />}
              label="Current Streak"
              value={data?.current_streak ?? 0}
              unit={data?.current_streak === 1 ? 'night' : 'nights'}
              bg="bg-orange-50 border-orange-100"
            />
            <HighlightCard
              icon={<Trophy className="w-5 h-5 text-amber-500" />}
              label="Longest Streak"
              value={data?.longest_streak ?? 0}
              unit={data?.longest_streak === 1 ? 'night' : 'nights'}
              bg="bg-amber-50 border-amber-100"
            />
            <HighlightCard
              icon={<Star className="w-5 h-5 text-blue-500" />}
              label="Best Night AHI"
              value={stats?.bestNight ? fmt(stats.bestNight.ahi) : '—'}
              unit={stats?.bestNight ? `on ${fmtDate(stats.bestNight.date)}` : ''}
              bg="bg-blue-50 border-blue-100"
            />
            <HighlightCard
              icon={<Zap className="w-5 h-5 text-purple-500" />}
              label="Top Event Type"
              value={stats?.mostCommonEvent ? EVENT_CFG[stats.mostCommonEvent]?.label ?? '—' : '—'}
              unit={stats?.mostCommonEvent ? `${data?.event_counts?.[stats.mostCommonEvent] ?? 0} events` : ''}
              bg="bg-purple-50 border-purple-100"
            />
          </div>
        </>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyChart() {
  return (
    <div className="h-44 flex items-center justify-center text-slate-400 text-sm">
      Not enough data for this period.
    </div>
  )
}

interface HighlightCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  unit: string
  bg: string
}

function HighlightCard({ icon, label, value, unit, bg }: HighlightCardProps) {
  return (
    <div className={`card border p-4 ${bg}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-800 leading-none">{value}</p>
      {unit && <p className="text-xs text-slate-400 mt-1">{unit}</p>}
    </div>
  )
}
