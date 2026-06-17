// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

import { useState, useEffect, useCallback } from 'react'
import { Zap, Info, X, ZoomIn } from 'lucide-react'
import type { Event, EventType } from '@/types'

// ─── Event type display config ────────────────────────────────────────────────

interface EventConfig {
  label: string
  abbr: string
  color: string
  dot: string
  text: string
  border: string
  description: string
}

const EVENT_CONFIG: Record<EventType, EventConfig> = {
  obstructive_apnea: {
    label: 'Obstructive Apnea',
    abbr: 'OA',
    color: 'bg-red-500',
    dot: 'bg-red-500',
    text: 'text-red-700',
    border: 'border-red-200 bg-red-50',
    description: 'Airflow stops ≥10 s while breathing effort continues — upper airway physically blocked.',
  },
  central_apnea: {
    label: 'Central Apnea',
    abbr: 'CA',
    color: 'bg-purple-500',
    dot: 'bg-purple-500',
    text: 'text-purple-700',
    border: 'border-purple-200 bg-purple-50',
    description: 'Airflow and breathing effort both stop ≥10 s — the brain temporarily fails to signal the respiratory muscles.',
  },
  hypopnea: {
    label: 'Hypopnea',
    abbr: 'H',
    color: 'bg-amber-400',
    dot: 'bg-amber-400',
    text: 'text-amber-700',
    border: 'border-amber-200 bg-amber-50',
    description: 'Airflow reduced ≥30% for ≥10 s, typically with arousal or oxygen drop. Counts toward AHI.',
  },
  rera: {
    label: 'RERA',
    abbr: 'R',
    color: 'bg-pink-400',
    dot: 'bg-pink-400',
    text: 'text-pink-700',
    border: 'border-pink-200 bg-pink-50',
    description: 'Flow-limited event ≥10 s that causes an arousal but doesn\'t meet apnea/hypopnea criteria.',
  },
  flow_limitation: {
    label: 'Flow Limitation',
    abbr: 'FL',
    color: 'bg-teal-400',
    dot: 'bg-teal-400',
    text: 'text-teal-700',
    border: 'border-teal-200 bg-teal-50',
    description: 'Flattened inspiratory flow waveform indicating partial upper-airway resistance without full arousal.',
  },
  periodic_breathing: {
    label: 'Periodic Breathing',
    abbr: 'PB',
    color: 'bg-indigo-400',
    dot: 'bg-indigo-400',
    text: 'text-indigo-700',
    border: 'border-indigo-200 bg-indigo-50',
    description: 'Cyclical crescendo-decrescendo tidal volume pattern, often linked to central apnea.',
  },
  spo2_desaturation: {
    label: 'SpO₂ Desat.',
    abbr: 'D',
    color: 'bg-blue-500',
    dot: 'bg-blue-500',
    text: 'text-blue-700',
    border: 'border-blue-200 bg-blue-50',
    description: 'Blood oxygen drops ≥3–4% from baseline, typically triggered by an apnea or hypopnea.',
  },
  large_leak: {
    label: 'Large Leak',
    abbr: 'LL',
    color: 'bg-orange-400',
    dot: 'bg-orange-400',
    text: 'text-orange-700',
    border: 'border-orange-200 bg-orange-50',
    description: 'Unintentional mask leakage well above normal vent flow; reduces effective therapy pressure.',
  },
  csr: {
    label: 'Cheyne-Stokes',
    abbr: 'CS',
    color: 'bg-violet-500',
    dot: 'bg-violet-500',
    text: 'text-violet-700',
    border: 'border-violet-200 bg-violet-50',
    description: 'Waxing-and-waning breathing pattern alternating hyperventilation with central apnea; associated with heart failure.',
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function fmtDuration(sec: number): string {
  if (sec <= 0) return '—'
  if (sec < 60) return `${sec.toFixed(0)}s`
  return `${Math.floor(sec / 60)}m ${(sec % 60).toFixed(0)}s`
}

// ─── Filter badges ────────────────────────────────────────────────────────────

interface FilterBadgesProps {
  events: Event[]
  filter: Set<EventType>
  onToggle: (t: EventType) => void
}

function FilterBadges({ events, filter, onToggle }: FilterBadgesProps) {
  const counts = events.reduce(
    (acc, e) => { acc[e.type] = (acc[e.type] ?? 0) + 1; return acc },
    {} as Partial<Record<EventType, number>>,
  )

  const types: EventType[] = ['obstructive_apnea', 'central_apnea', 'hypopnea', 'rera', 'flow_limitation', 'periodic_breathing', 'spo2_desaturation', 'large_leak', 'csr']
  const present = types.filter(t => (counts[t] ?? 0) > 0)
  if (present.length === 0) return null

  const isFiltered = filter.size > 0

  return (
    <div className="no-print flex flex-wrap gap-2 mb-4">
      {present.map(t => {
        const cfg = EVENT_CONFIG[t]
        const active = !isFiltered || filter.has(t)
        return (
          <button
            key={t}
            onClick={() => onToggle(t)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              active
                ? `${cfg.border} ${cfg.text}`
                : 'border-slate-200 bg-white text-slate-400'
            }`}
          >
            <span className={`w-2 h-2 rounded-full transition-colors ${active ? cfg.dot : 'bg-slate-300'}`} />
            <span className="font-bold tabular-nums">{counts[t]}</span>
            {cfg.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Timeline strip ───────────────────────────────────────────────────────────

interface TimelineProps {
  allEvents: Event[]
  visibleTypes: Set<EventType>
  sessionStart: string
  sessionEnd: string
  onEventClick?: (event: Event) => void
}

function Timeline({ allEvents, visibleTypes, sessionStart, sessionEnd, onEventClick }: TimelineProps) {
  const startMs = new Date(sessionStart).getTime()
  const endMs = new Date(sessionEnd).getTime()
  const durationMs = endMs - startMs
  if (durationMs <= 0) return null

  const isFiltered = visibleTypes.size > 0

  const tickCount = Math.min(8, Math.floor(durationMs / (15 * 60 * 1000)) + 1)
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i / tickCount)

  function fmtTick(frac: number) {
    return new Date(startMs + frac * durationMs).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="mb-5">
      <div className="relative h-8 bg-slate-100 rounded-lg overflow-hidden">
        {allEvents.map(e => {
          const evMs = new Date(e.start_time).getTime()
          const leftPct = Math.max(0, Math.min(100, ((evMs - startMs) / durationMs) * 100))
          const widthPct = Math.max(0.3, (e.duration_seconds / (durationMs / 1000)) * 100)
          const cfg = EVENT_CONFIG[e.type] ?? EVENT_CONFIG.hypopnea
          const dimmed = isFiltered && !visibleTypes.has(e.type)
          return (
            <div
              key={e.id}
              title={`${cfg.label} — ${fmtTime(e.start_time)}, ${fmtDuration(e.duration_seconds)}`}
              className={`absolute top-1 bottom-1 rounded-sm ${cfg.color} min-w-[3px] transition-opacity ${dimmed ? 'opacity-15' : 'opacity-80'} ${onEventClick ? 'cursor-pointer hover:opacity-100 hover:top-0 hover:bottom-0' : 'cursor-default'}`}
              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              onClick={onEventClick ? () => onEventClick(e) : undefined}
            />
          )
        })}
      </div>
      <div className="relative flex justify-between mt-1 px-0.5">
        {ticks.map((frac, i) => (
          <span key={i} className="text-[9px] text-slate-500 font-mono">
            {fmtTick(frac)}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Event list row ───────────────────────────────────────────────────────────

function EventRow({ event, onZoom, timeSinceLast }: { event: Event; onZoom?: () => void; timeSinceLast?: number | null }) {
  const cfg = EVENT_CONFIG[event.type] ?? EVENT_CONFIG.hypopnea
  return (
    <div
      className={`group flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0 -mx-1 px-1 rounded-md transition-colors ${
        onZoom ? 'cursor-pointer hover:bg-slate-50' : ''
      }`}
      onClick={onZoom}
      role={onZoom ? 'button' : undefined}
      title={onZoom ? 'Zoom charts to this event' : undefined}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
      <div className="flex-1 min-w-0">
        <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
      </div>
      <span className="text-[10px] font-mono text-slate-500 w-16 text-right shrink-0" title="Time since previous event">
        {timeSinceLast != null ? `+${fmtDuration(timeSinceLast)}` : ''}
      </span>
      <span className="text-xs font-mono text-slate-500 w-24 shrink-0">{fmtTime(event.start_time)}</span>
      <span className="text-xs font-mono text-slate-500 w-12 text-right shrink-0">
        {fmtDuration(event.duration_seconds)}
      </span>
      {onZoom && (
        <ZoomIn className="w-3.5 h-3.5 text-slate-400 group-hover:text-brand-400 transition-colors shrink-0" />
      )}
    </div>
  )
}

// ─── Main card ────────────────────────────────────────────────────────────────

interface EventsCardProps {
  events: Event[]
  sessionStart: string
  sessionEnd: string
  onEventClick?: (event: Event) => void
}

const EVENT_TYPES: EventType[] = ['obstructive_apnea', 'central_apnea', 'hypopnea', 'rera', 'flow_limitation', 'periodic_breathing', 'spo2_desaturation', 'large_leak', 'csr']

export function EventsCard({ events, sessionStart, sessionEnd, onEventClick }: EventsCardProps) {
  const [filter, setFilter] = useState<Set<EventType>>(new Set())
  const [showInfo, setShowInfo] = useState(false)
  const closeInfo = useCallback(() => setShowInfo(false), [])

  useEffect(() => {
    if (!showInfo) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeInfo() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showInfo, closeInfo])

  const toggle = (t: EventType) => {
    setFilter(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const visible = filter.size === 0 ? events : events.filter(e => filter.has(e.type))
  const countLabel = filter.size > 0
    ? `${visible.length} of ${events.length}`
    : `${events.length} total`

  return (
    <div className="card p-5 mb-4">
      <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
        <Zap className="w-4 h-4 text-brand-500" aria-hidden="true" />
        Events
        <span className="text-xs font-normal text-slate-500 ml-1">device-scored annotations</span>
        <span className="ml-auto text-xs font-normal text-slate-500 tabular-nums">{countLabel}</span>
        <button
          onClick={() => setShowInfo(true)}
          className="no-print text-slate-300 hover:text-brand-500 transition-colors p-1 rounded"
          title="About event types"
          aria-label="About event types"
        >
          <Info className="w-4 h-4" aria-hidden="true" />
        </button>
      </h2>

      {showInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={closeInfo}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Zap className="w-4 h-4 text-brand-500" aria-hidden="true" />
                Event Types
              </h3>
              <button onClick={closeInfo} aria-label="Close" className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 max-h-[60vh] overflow-y-auto">
              {EVENT_TYPES.map(t => {
                const cfg = EVENT_CONFIG[t]
                return (
                  <div key={t} className="flex gap-3">
                    <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                    <div>
                      <p className={`text-sm font-semibold ${cfg.text}`}>{cfg.label}</p>
                      <p className="text-sm text-slate-600 mt-0.5">{cfg.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <div className="rounded-lg bg-slate-50 border border-dashed border-slate-300 p-6 text-center">
          <p className="text-slate-500 text-xs">No events recorded for this session.</p>
        </div>
      ) : (
        <>
          <FilterBadges events={events} filter={filter} onToggle={toggle} />
          <Timeline
            allEvents={events}
            visibleTypes={filter}
            sessionStart={sessionStart}
            sessionEnd={sessionEnd}
            onEventClick={onEventClick}
          />
          <div
            className="max-h-80 overflow-y-auto overflow-x-hidden pr-2 print:max-h-none print:overflow-visible print:pr-0"
            tabIndex={0}
            role="region"
            aria-label="Events list"
          >
            <div className="sticky top-0 bg-white flex items-center gap-3 pb-1.5 -mx-1 px-1 border-b border-slate-100">
              <span className="w-2 h-2 shrink-0" />
              <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Type</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 w-16 text-right shrink-0">Gap</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 w-24 shrink-0">Time</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 w-12 text-right shrink-0">Dur.</span>
              {onEventClick && <span className="w-3.5 shrink-0" />}
            </div>
            {visible.map((e, i) => {
              const prev = i > 0 ? visible[i - 1] : null
              const timeSinceLast = prev
                ? (new Date(e.start_time).getTime() - new Date(prev.start_time).getTime()) / 1000
                : null
              return (
                <EventRow
                  key={e.id}
                  event={e}
                  timeSinceLast={timeSinceLast}
                  onZoom={onEventClick ? () => onEventClick(e) : undefined}
                />
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
