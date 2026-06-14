import { FlaskConical, RefreshCw, CheckCircle2, AlertCircle, ZoomIn } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Finding, FindingSeverity } from '@/types'

// ─── Severity pill ────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<FindingSeverity, { label: string; classes: string }> = {
  critical: { label: 'Critical', classes: 'bg-red-50 text-red-700 border border-red-200' },
  alert:    { label: 'Alert',    classes: 'bg-orange-50 text-orange-700 border border-orange-200' },
  warning:  { label: 'Warning',  classes: 'bg-amber-50 text-amber-700 border border-amber-200' },
  info:     { label: 'Info',     classes: 'bg-blue-50 text-blue-700 border border-blue-200' },
}

function SeverityPill({ severity }: { severity: FindingSeverity }) {
  const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.info
  return (
    <span className={`flex justify-center items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${cfg.classes}`}>
      {cfg.label}
    </span>
  )
}

// ─── Time range label ─────────────────────────────────────────────────────────

function fmtOffset(offsetSec: number, startISO: string): string {
  const ms = new Date(startISO).getTime() + offsetSec * 1000
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function TimeRange({ startSec, endSec, sessionStart }: { startSec?: number; endSec?: number; sessionStart: string }) {
  if (startSec == null) return null
  const from = fmtOffset(startSec, sessionStart)
  const to = endSec != null ? fmtOffset(endSec, sessionStart) : null
  return (
    <span className="text-[10px] font-mono text-slate-400 shrink-0 whitespace-nowrap">
      {from}{to && to !== from ? ` – ${to}` : ''}
    </span>
  )
}

// ─── Single finding row ───────────────────────────────────────────────────────

function FindingRow({ finding, sessionStart, onZoom }: { finding: Finding; sessionStart: string; onZoom?: () => void }) {
  const clickable = onZoom != null && finding.start_sec != null
  return (
    <div
      className={`group flex gap-3 py-3.5 border-b border-slate-100 last:border-0 -mx-1 px-1 rounded-md transition-colors ${
        clickable ? 'cursor-pointer hover:bg-slate-50' : ''
      }`}
      onClick={clickable ? onZoom : undefined}
      role={clickable ? 'button' : undefined}
      title={clickable ? 'Zoom charts to this finding' : undefined}
    >
      <div className="shrink-0 pt-0.5 w-16">
        <SeverityPill severity={finding.severity} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-1">
          <p className="text-sm font-medium text-slate-800 leading-snug">{finding.title}</p>
          <div className="flex items-center gap-2 shrink-0">
            <TimeRange startSec={finding.start_sec} endSec={finding.end_sec} sessionStart={sessionStart} />
            {clickable && (
              <ZoomIn className="w-3.5 h-3.5 text-slate-200 group-hover:text-brand-400 transition-colors shrink-0" />
            )}
          </div>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">{finding.detail}</p>
        <p className="text-[10px] text-slate-300 font-mono mt-1">{finding.rule_id}</p>
      </div>
    </div>
  )
}

// ─── Summary bar ─────────────────────────────────────────────────────────────

function SummaryBar({ findings }: { findings: Finding[] }) {
  const counts = findings.reduce(
    (acc, f) => { acc[f.severity] = (acc[f.severity] ?? 0) + 1; return acc },
    {} as Record<FindingSeverity, number>,
  )
  const items = (['critical', 'alert', 'warning', 'info'] as FindingSeverity[])
    .filter(sev => (counts[sev] ?? 0) > 0)
    .map(sev => ({ sev, label: SEVERITY_CONFIG[sev].label }))

  if (items.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {items.map(({ sev, label }) => (
        <span key={sev} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${SEVERITY_CONFIG[sev].classes}`}>
          <span className="font-bold tabular-nums">{counts[sev]}</span>
          {label}
        </span>
      ))}
    </div>
  )
}

// ─── Reanalyze dialog ─────────────────────────────────────────────────────────

type DialogPhase = 'working' | 'success' | 'error'
const MIN_DISPLAY_MS = 3500

function ReanalyzeDialog({
  open,
  phase,
  errorMessage,
  onClose,
}: {
  open: boolean
  phase: DialogPhase
  errorMessage?: string
  onClose: () => void
}) {
  const [pct, setPct] = useState(0)

  // Drive the progress bar: snap to 0 on open, then animate to 90% over MIN_DISPLAY_MS.
  useEffect(() => {
    if (!open) { setPct(0); return }
    setPct(0)
    const t = setTimeout(() => setPct(90), 50)
    return () => clearTimeout(t)
  }, [open])

  // Complete the bar when analysis finishes.
  useEffect(() => {
    if (phase === 'success' || phase === 'error') setPct(100)
  }, [phase])

  if (!open) return null

  const barStyle: React.CSSProperties =
    pct === 0
      ? { width: '0%' }
      : { width: `${pct}%`, transition: `width ${pct === 90 ? MIN_DISPLAY_MS : 300}ms ease-out` }

  const barColor = phase === 'error' ? 'bg-red-500' : phase === 'success' ? 'bg-emerald-500' : 'bg-brand-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 px-8 py-10 text-center">

        {phase === 'working' && (
          <>
            <div className="flex justify-center mb-6">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-brand-100 border-t-brand-500 animate-spin" />
                <FlaskConical className="w-7 h-7 text-brand-400" />
              </div>
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1.5">Running Clinical Analysis</h3>
            <p className="text-sm text-slate-500 mb-7">
              Evaluating all active rules against stored signal data…
            </p>
          </>
        )}

        {phase === 'success' && (
          <>
            <div className="flex justify-center mb-6">
              <CheckCircle2 className="w-14 h-14 text-emerald-500" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1.5">Analysis Complete</h3>
            <p className="text-sm text-slate-500 mb-7">Findings have been updated.</p>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="flex justify-center mb-6">
              <AlertCircle className="w-14 h-14 text-red-500" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1.5">Analysis Failed</h3>
            <p className="text-sm text-slate-500 mb-7">{errorMessage ?? 'An unexpected error occurred.'}</p>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-medium text-slate-700 transition-colors"
            >
              Close
            </button>
          </>
        )}

        <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
          <div className={`h-1 rounded-full ${barColor}`} style={barStyle} />
        </div>
      </div>
    </div>
  )
}

// ─── Main card ────────────────────────────────────────────────────────────────

interface FindingsCardProps {
  findings: Finding[]
  sessionStart: string
  sessionId: string
  analyzedAt?: string
  onFindingClick?: (finding: Finding) => void
}

function fmtAnalyzedAt(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (isToday) return `Today at ${time}`
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`
}

export function FindingsCard({ findings, sessionStart, sessionId, analyzedAt, onFindingClick }: FindingsCardProps) {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogPhase, setDialogPhase] = useState<DialogPhase>('working')
  const [errorMessage, setErrorMessage] = useState<string>()
  const startedAt = useRef(0)

  const mutation = useMutation({
    mutationFn: () => api.sessions.analyze(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings', sessionId] })
      const remaining = Math.max(0, MIN_DISPLAY_MS - (Date.now() - startedAt.current))
      setTimeout(() => {
        setDialogPhase('success')
        setTimeout(() => setDialogOpen(false), 1200)
      }, remaining)
    },
    onError: (err) => {
      const remaining = Math.max(0, MIN_DISPLAY_MS - (Date.now() - startedAt.current))
      setTimeout(() => {
        setErrorMessage((err as Error).message)
        setDialogPhase('error')
      }, remaining)
    },
  })

  const handleReanalyze = () => {
    mutation.reset()
    setDialogPhase('working')
    setErrorMessage(undefined)
    startedAt.current = Date.now()
    setDialogOpen(true)
    mutation.mutate()
  }

  const ordered: FindingSeverity[] = ['critical', 'alert', 'warning', 'info']
  const sorted = [...findings].sort((a, b) => {
    const ai = ordered.indexOf(a.severity)
    const bi = ordered.indexOf(b.severity)
    if (ai !== bi) return ai - bi
    return (a.start_sec ?? Infinity) - (b.start_sec ?? Infinity)
  })

  return (
    <>
      <ReanalyzeDialog
        open={dialogOpen}
        phase={dialogPhase}
        errorMessage={errorMessage}
        onClose={() => setDialogOpen(false)}
      />

      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-brand-500" />
            Clinical Findings
            <span className="text-xs font-normal text-slate-400 ml-1">automated rule-based analysis</span>
            <Link to="/rules" className="text-xs font-normal text-brand-500 hover:text-brand-600 transition-colors ml-1">Rules</Link>
          </h2>
          <div className="flex items-center gap-3">
            {analyzedAt && (
              <span className="text-[10px] text-slate-400 font-mono" title={new Date(analyzedAt).toLocaleString()}>
                Last analyzed {fmtAnalyzedAt(analyzedAt)}
              </span>
            )}
            <button
              onClick={handleReanalyze}
              disabled={dialogOpen}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Re-run clinical analysis on this session"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Re-analyze
            </button>
          </div>
        </div>

        {findings.length === 0 ? (
          <div className="rounded-lg bg-slate-50 border border-dashed border-slate-300 p-6 text-center">
            <p className="text-slate-400 text-xs">
              No clinical findings for this session. Use Re-analyze to run the current ruleset against the stored signal data.
            </p>
          </div>
        ) : (
          <>
            <SummaryBar findings={findings} />
            <div className="divide-y divide-slate-100">
              {sorted.map(f => (
                <FindingRow
                  key={f.id}
                  finding={f}
                  sessionStart={sessionStart}
                  onZoom={onFindingClick ? () => onFindingClick(f) : undefined}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
