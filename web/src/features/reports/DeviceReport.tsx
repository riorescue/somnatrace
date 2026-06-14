import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area,
  ComposedChart, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts'
import { Wind, Gauge, AlertTriangle, CheckCircle, AlertCircle, XCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { FullPageSpinner } from '@/components/LoadingSpinner'
import { ErrorBanner } from '@/components/ErrorBanner'
import type { DailySummary } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'good' | 'watch' | 'poor'

interface IssueFlag {
  date: string
  issues: string[]
  severity: Status
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 1): string {
  if (isNaN(n) || n === 0) return '—'
  return n.toFixed(decimals)
}

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

function leakStatus(p95: number, warnP95: number, alertP95: number): Status {
  if (p95 < warnP95)  return 'good'
  if (p95 < alertP95) return 'watch'
  return 'poor'
}

function windowLeakStats(filled: DailySummary[], days: number, warnP95: number, alertP95: number) {
  const window = filled.slice(-days).filter(d => d.session_id && d.leak_rate_median > 0)
  if (!window.length) return { avgMedian: NaN, avgP95: NaN, highLeakNights: 0, count: 0 }
  const avgMedian = window.reduce((a, d) => a + d.leak_rate_median, 0) / window.length
  const avgP95    = window.reduce((a, d) => a + d.leak_rate_p95, 0) / window.length
  const highLeakNights = window.filter(d => d.leak_rate_p95 >= warnP95).length
  return { avgMedian, avgP95, highLeakNights, count: window.length, status: leakStatus(avgP95, warnP95, alertP95) }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LeakBadge({ status }: { status: Status }) {
  if (status === 'good') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold border px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border-emerald-200">
      <CheckCircle className="w-3 h-3" /> Good
    </span>
  )
  if (status === 'watch') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold border px-2 py-0.5 rounded bg-amber-50 text-amber-700 border-amber-200">
      <AlertCircle className="w-3 h-3" /> Elevated
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold border px-2 py-0.5 rounded bg-red-50 text-red-700 border-red-200">
      <XCircle className="w-3 h-3" /> High Leak
    </span>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function DeviceReport() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['summaries', 90],
    queryFn: () => api.summaries.daily(90),
  })

  const { data: settingsData } = useQuery({
    queryKey: ['app-settings'],
    queryFn: api.appSettings.get,
  })

  const warnP95  = settingsData?.leak_warn_p95  ?? 24
  const alertP95 = settingsData?.leak_alert_p95 ?? 40

  const {
    leak7, leak30, leak90,
    leakChartData, pressureChartData,
    flags, tableRows,
  } = useMemo(() => {
    const summaries = data?.summaries ?? []
    const filled = fillDateRange(summaries, 90)

    const leak7  = windowLeakStats(filled, 7,  warnP95, alertP95)
    const leak30 = windowLeakStats(filled, 30, warnP95, alertP95)
    const leak90 = windowLeakStats(filled, 90, warnP95, alertP95)

    const withSession = filled.filter(d => d.session_id && d.leak_rate_median > 0)

    const leakChartData = withSession.map(d => ({
      date: fmtDate(d.date),
      median: +d.leak_rate_median.toFixed(1),
      p95:    +d.leak_rate_p95.toFixed(1),
    }))

    const pressureChartData = withSession
      .filter(d => d.pressure_p50 > 0)
      .map(d => ({
        date: fmtDate(d.date),
        p50:  +d.pressure_p50.toFixed(1),
        p95:  +d.pressure_p95.toFixed(1),
        max:  +d.pressure_max.toFixed(1),
      }))

    // Build issue flags per night
    const flags: IssueFlag[] = withSession
      .filter(d => {
        const hasHighLeak = d.leak_rate_p95 >= warnP95
        const hasShortUsage = d.usage_minutes > 0 && d.usage_minutes < 120
        return hasHighLeak || hasShortUsage
      })
      .map(d => {
        const issues: string[] = []
        if (d.leak_rate_p95 >= alertP95) issues.push(`Severe leak (P95 ${d.leak_rate_p95.toFixed(0)} L/min)`)
        else if (d.leak_rate_p95 >= warnP95) issues.push(`Elevated leak (P95 ${d.leak_rate_p95.toFixed(0)} L/min)`)
        if (d.usage_minutes > 0 && d.usage_minutes < 120) issues.push(`Very short session (${(d.usage_minutes / 60).toFixed(1)}h)`)
        const maxSeverity = d.leak_rate_p95 >= alertP95 ? 'poor' : 'watch'
        return { date: d.date, issues, severity: maxSeverity as Status }
      })
      .reverse()
      .slice(0, 15)

    // Table: last 30 sessions with leak and pressure data
    const tableRows = [...withSession].reverse().slice(0, 30).map(d => ({
      date:   d.date,
      hours:  (d.usage_minutes / 60).toFixed(1),
      median: d.leak_rate_median.toFixed(1),
      p95:    d.leak_rate_p95.toFixed(1),
      p50:    d.pressure_p50.toFixed(1),
      p95p:   d.pressure_p95.toFixed(1),
      max:    d.pressure_max.toFixed(1),
      leakStatus: leakStatus(d.leak_rate_p95, warnP95, alertP95),
    }))

    return { leak7, leak30, leak90, leakChartData, pressureChartData, flags, tableRows }
  }, [data, warnP95, alertP95])

  if (isLoading) return <FullPageSpinner />
  if (isError)   return <ErrorBanner message="Failed to load device data." />

  const noData = (data?.summaries ?? []).length === 0
  if (noData) {
    return (
      <div className="card p-16 text-center">
        <Wind className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">No session data available</p>
        <p className="text-slate-400 text-sm mt-1">Import sessions to generate device reports.</p>
      </div>
    )
  }

  const leakTickInterval = Math.max(0, Math.ceil(leakChartData.length / 10) - 1)

  return (
    <div className="space-y-6">

      {/* ── Leak window comparison ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { label: '7-Day Avg Leak P95',  stats: leak7  },
          { label: '30-Day Avg Leak P95', stats: leak30 },
          { label: '90-Day Avg Leak P95', stats: leak90 },
        ].map(({ label, stats }) => (
          <div key={label} className={`card p-5 border-l-4 ${
            !stats.status               ? 'border-slate-200' :
            stats.status === 'good'     ? 'border-emerald-400' :
            stats.status === 'watch'    ? 'border-amber-400'   :
                                          'border-red-400'
          }`}>
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className="text-3xl font-bold text-slate-900 mb-1">
              {stats.count ? fmt(stats.avgP95) : '—'}
            </p>
            <p className="text-xs text-slate-400 mb-2">L/min</p>
            {stats.count ? <LeakBadge status={stats.status!} /> : null}
            {stats.count > 0 && (
              <p className="text-xs text-slate-400 mt-2">
                Median avg: {fmt(stats.avgMedian)} · High-leak nights: {stats.highLeakNights}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* ── Leak threshold reference ───────────────────────────────────────── */}
      <div className="card p-4 bg-slate-50">
        <p className="text-xs font-semibold text-slate-600 mb-2">Leak Rate Reference (P95 unintentional leak)</p>
        <div className="flex gap-6 flex-wrap">
          {[
            { range: `P95 < ${warnP95} L/min`,                    label: 'Good seal',             color: 'bg-emerald-100 text-emerald-700' },
            { range: `P95 ${warnP95}–${alertP95} L/min`,          label: 'Elevated — refit mask', color: 'bg-amber-100 text-amber-700'    },
            { range: `P95 > ${alertP95} L/min`,                   label: 'Severe — investigate',  color: 'bg-red-100 text-red-700'        },
          ].map(t => (
            <div key={t.range} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${t.color}`}>
              <span className="font-mono">{t.range}</span>
              <span className="opacity-75">·</span>
              <span>{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Leak trend chart ───────────────────────────────────────────────── */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <Wind className="w-4 h-4 text-brand-500" />
          Leak Rate Trend
          <span className="text-xs font-normal text-slate-400 ml-1">L/min · median and P95 per night</span>
        </h2>
        {leakChartData.length < 2 ? (
          <div className="h-48 flex items-center justify-center text-slate-400 text-sm">Not enough data.</div>
        ) : (
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={leakChartData} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="#94a3b8" interval={leakTickInterval} />
              <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[0, 'auto']} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                formatter={(v: number, name: string) => [`${v.toFixed(1)} L/min`, name === 'p95' ? 'P95 leak' : 'Median leak']}
              />
              <Legend iconType="line" formatter={(v) => <span className="text-xs text-slate-600">{v === 'p95' ? 'P95' : 'Median'}</span>} />
              <ReferenceLine
                y={warnP95} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1.5}
                label={{ value: String(warnP95), fontSize: 9, fill: '#f59e0b', position: 'right' }}
              />
              <ReferenceLine
                y={alertP95} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1.5}
                label={{ value: String(alertP95), fontSize: 9, fill: '#ef4444', position: 'right' }}
              />
              <Area type="monotone" dataKey="p95"    stroke="#f97316" fill="#fed7aa" strokeWidth={1.5} dot={false} fillOpacity={0.3} />
              <Area type="monotone" dataKey="median" stroke="#0ea5e9" fill="#bae6fd" strokeWidth={2}   dot={false} fillOpacity={0.35} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Pressure delivery + Issue flags ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Pressure delivery chart */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-brand-500" />
            Pressure Delivery
            <span className="text-xs font-normal text-slate-400 ml-1">cmH₂O</span>
          </h2>
          {pressureChartData.length < 2 ? (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">Not enough data.</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={pressureChartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="#94a3b8" interval={Math.max(0, Math.ceil(pressureChartData.length / 8) - 1)} />
                <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  formatter={(v: number, name: string) => {
                    const labels: Record<string, string> = { p50: 'P50', p95: 'P95', max: 'Max' }
                    return [`${v.toFixed(1)} cmH₂O`, labels[name] ?? name]
                  }}
                />
                <Legend iconType="line" formatter={(v: string) => {
                  const labels: Record<string, string> = { p50: 'P50', p95: 'P95', max: 'Max' }
                  return <span className="text-xs text-slate-600">{labels[v] ?? v}</span>
                }} />
                <Bar    dataKey="max" fill="#e0e7ff" fillOpacity={0.4} maxBarSize={12} />
                <Line type="monotone" dataKey="p95" stroke="#818cf8" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="p50" stroke="#6366f1" strokeWidth={2}   dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Issue flags */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-brand-500" />
            Issue Flags
            <span className="text-xs font-normal text-slate-400 ml-1">nights with detected anomalies</span>
          </h2>
          {flags.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600 mt-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              No mask or device issues detected in the last 90 days
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {flags.map((flag, i) => (
                <div key={i} className={`rounded-lg border px-3 py-2 ${
                  flag.severity === 'poor'  ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'
                }`}>
                  <p className={`text-xs font-semibold mb-0.5 ${
                    flag.severity === 'poor' ? 'text-red-700' : 'text-amber-700'
                  }`}>
                    {flag.date}
                  </p>
                  {flag.issues.map((issue, j) => (
                    <p key={j} className={`text-xs ${
                      flag.severity === 'poor' ? 'text-red-600' : 'text-amber-600'
                    }`}>
                      · {issue}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Nightly device table ───────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-700">Nightly Device Summary</h2>
          <p className="text-xs text-slate-400 mt-0.5">Most recent 30 sessions</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {['Date', 'Usage', 'Leak Median', 'Leak P95', 'Pressure P50', 'Pressure P95', 'Max', 'Seal'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tableRows.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-700 font-mono text-xs">{row.date}</td>
                  <td className="px-4 py-2.5 text-slate-600">{row.hours}h</td>
                  <td className="px-4 py-2.5 text-slate-600">{row.median} L/min</td>
                  <td className={`px-4 py-2.5 font-medium ${
                    parseFloat(row.p95) >= alertP95 ? 'text-red-600' :
                    parseFloat(row.p95) >= warnP95  ? 'text-amber-600' : 'text-slate-600'
                  }`}>
                    {row.p95} L/min
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{row.p50} cmH₂O</td>
                  <td className="px-4 py-2.5 text-slate-500">{row.p95p} cmH₂O</td>
                  <td className="px-4 py-2.5 text-slate-500">{row.max} cmH₂O</td>
                  <td className="px-4 py-2.5">
                    {row.leakStatus === 'good'  && <span className="text-xs font-medium text-emerald-600">Good</span>}
                    {row.leakStatus === 'watch' && <span className="text-xs font-medium text-amber-600">Elevated</span>}
                    {row.leakStatus === 'poor'  && <span className="text-xs font-medium text-red-600">High Leak</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="hidden print:block mt-8 pt-4 border-t border-slate-200 text-xs text-slate-400 text-center">
        Leak thresholds (P95 unintentional leak): &lt; {warnP95} L/min = good seal,{' '}
        {warnP95}–{alertP95} = elevated, &gt; {alertP95} = severe.
        This report is for informational purposes and does not constitute medical advice.
      </div>
    </div>
  )
}
