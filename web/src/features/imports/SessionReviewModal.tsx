// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, CheckSquare, Square, AlertCircle, CheckCircle2, Loader2, DatabaseZap, Smile, Meh, Frown, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, formatTime, formatDuration, formatAHI, ahiLabel } from '@/lib/format'
import type { Mask, MorningFeel, SessionCandidate } from '@/types'

// ─── Shared: mask grouped select ─────────────────────────────────────────────

function MaskSelect({
  value, onChange, masks, disabled, className,
}: {
  value: string
  onChange: (v: string) => void
  masks: Mask[]
  disabled?: boolean
  className?: string
}) {
  const groups = new Map<string, Mask[]>()
  const catchalls: Mask[] = []
  for (const m of masks) {
    if (m.is_catchall) { catchalls.push(m); continue }
    const arr = groups.get(m.manufacturer) ?? []
    arr.push(m)
    groups.set(m.manufacturer, arr)
  }
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className={className}
    >
      <option value="">— no mask —</option>
      {[...groups.entries()].map(([mfr, ms]) => (
        <optgroup key={mfr} label={mfr}>
          {ms.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </optgroup>
      ))}
      {catchalls.length > 0 && (
        <optgroup label="Other">
          {catchalls.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </optgroup>
      )}
    </select>
  )
}

// ─── Shared: morning feel picker ─────────────────────────────────────────────

const FEEL_OPTIONS: { value: MorningFeel; Icon: React.ElementType; label: string; activeClass: string }[] = [
  { value: 'good', Icon: Smile, label: 'Good', activeClass: 'text-emerald-500 bg-emerald-50 border-emerald-300' },
  { value: 'fair', Icon: Meh,   label: 'Fair', activeClass: 'text-amber-500  bg-amber-50  border-amber-300'  },
  { value: 'poor', Icon: Frown, label: 'Poor', activeClass: 'text-red-500    bg-red-50    border-red-300'    },
]

function MorningFeelPicker({
  value, onChange, disabled,
}: {
  value: MorningFeel | ''
  onChange: (v: MorningFeel | '') => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-1">
      {FEEL_OPTIONS.map(({ value: v, Icon, label, activeClass }) => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value === v ? '' : v)}
          title={label}
          aria-label={label}
          aria-pressed={value === v}
          className={`p-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
            value === v
              ? activeClass
              : 'text-slate-300 border-slate-200 hover:text-slate-500 hover:border-slate-300'
          }`}
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

// ─── Confirm status dialog ────────────────────────────────────────────────────

type ConfirmPhase = 'working' | 'success' | 'error'
const CONFIRM_PROGRESS_MS = 4000

function ConfirmStatusDialog({
  open,
  phase,
  errorMessage,
  onClose,
}: {
  open: boolean
  phase: ConfirmPhase
  errorMessage?: string
  onClose: () => void
}) {
  const [pct, setPct] = useState(0)

  useEffect(() => {
    if (!open) { setPct(0); return }
    setPct(0)
    const t = setTimeout(() => setPct(85), 50)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (phase === 'success' || phase === 'error') setPct(100)
  }, [phase])

  if (!open) return null

  const barStyle: React.CSSProperties =
    pct === 0
      ? { width: '0%' }
      : { width: `${pct}%`, transition: `width ${pct === 85 ? CONFIRM_PROGRESS_MS : 300}ms ease-out` }

  const barColor = phase === 'error' ? 'bg-red-500' : phase === 'success' ? 'bg-emerald-500' : 'bg-brand-500'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 px-8 py-10 text-center">

        {phase === 'working' && (
          <>
            <div className="flex justify-center mb-6">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-brand-100 border-t-brand-500 animate-spin" />
                <DatabaseZap className="w-7 h-7 text-brand-400" aria-hidden="true" />
              </div>
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1.5">Saving Sessions</h3>
            <p className="text-sm text-slate-500 mb-7">
              Writing selected sessions to your local database…
            </p>
          </>
        )}

        {phase === 'success' && (
          <>
            <div className="flex justify-center mb-6">
              <CheckCircle2 className="w-14 h-14 text-emerald-500" aria-hidden="true" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1.5">Import Complete</h3>
            <p className="text-sm text-slate-500 mb-7">Your sessions have been saved.</p>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="flex justify-center mb-6">
              <AlertCircle className="w-14 h-14 text-red-500" aria-hidden="true" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1.5">Save Failed</h3>
            <p className="text-sm text-slate-500 mb-7">{errorMessage ?? 'An unexpected error occurred.'}</p>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-medium text-slate-700 transition-colors mb-7"
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

// ─── Modal ────────────────────────────────────────────────────────────────────

interface Props {
  importId: string
  onClose: () => void
}

export function SessionReviewModal({ importId, onClose }: Props) {
  const qc = useQueryClient()
  const modalRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [discarding, setDiscarding] = useState(false)

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement
    const modal = modalRef.current
    if (!modal) return
    const sel = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    modal.querySelectorAll<HTMLElement>(sel)[0]?.focus()
    function onKey(e: KeyboardEvent) {
      if (!modal) return
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const els = Array.from(modal.querySelectorAll<HTMLElement>(sel))
      const first = els[0], last = els[els.length - 1]
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last?.focus() } }
      else            { if (document.activeElement === last)  { e.preventDefault(); first?.focus() } }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previousFocusRef.current?.focus() }
  }, [onClose])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['import-candidates', importId],
    queryFn: () => api.imports.candidates(importId),
  })
  const { data: masksData } = useQuery({ queryKey: ['masks'], queryFn: api.masks.list })
  const { data: appSettings } = useQuery({ queryKey: ['app-settings'], queryFn: api.appSettings.get })

  const masks    = masksData?.masks ?? []
  const sessions = data?.sessions ?? []

  const [selected,     setSelected]     = useState<Set<string>>(new Set())
  const [sessionMasks, setSessionMasks] = useState<Record<string, string>>({})
  const [sessionFeel,  setSessionFeel]  = useState<Record<string, MorningFeel | ''>>({})
  const [sessionNotes, setSessionNotes] = useState<Record<string, string>>({})
  const [initialised,  setInitialised]  = useState(false)

  const [confirmOpen,  setConfirmOpen]  = useState(false)
  const [confirmPhase, setConfirmPhase] = useState<ConfirmPhase>('working')
  const [confirmError, setConfirmError] = useState<string>()

  const { data: importsData } = useQuery({
    queryKey: ['imports'],
    queryFn: api.imports.list,
    refetchInterval: confirmOpen && confirmPhase === 'working' ? 1500 : false,
    enabled: confirmOpen,
  })

  useEffect(() => {
    if (!confirmOpen || confirmPhase !== 'working') return
    const imp = importsData?.imports?.find(i => i.id === importId)
    if (!imp) return
    if (imp.status === 'complete') {
      setConfirmPhase('success')
      qc.invalidateQueries({ queryKey: ['sessions'] })
      setTimeout(() => { setConfirmOpen(false); onClose() }, 1500)
    } else if (imp.status === 'failed') {
      setConfirmPhase('error')
      setConfirmError(imp.error_message || 'Sessions could not be saved.')
    }
  }, [importsData, confirmOpen, confirmPhase, importId, qc, onClose])

  useEffect(() => {
    if (sessions.length > 0 && appSettings !== undefined && !initialised) {
      const newSessions = sessions.filter(s => !s.already_imported)
      setSelected(new Set(newSessions.map(s => s.id)))
      if (appSettings?.default_mask_id) {
        const def = appSettings.default_mask_id
        setSessionMasks(Object.fromEntries(newSessions.map(s => [s.id, def])))
      }
      setInitialised(true)
    }
  }, [sessions.length, appSettings, initialised])

  const confirmMut = useMutation({
    mutationFn: (sessionIds: string[]) => {
      const metadata: Record<string, { mask_id?: string; notes?: string; morning_feel?: string }> = {}
      for (const id of sessionIds) {
        const mask_id     = sessionMasks[id] || undefined
        const notes       = sessionNotes[id]?.trim() || undefined
        const morning_feel = sessionFeel[id] || undefined
        if (mask_id || notes || morning_feel) metadata[id] = { mask_id, notes, morning_feel }
      }
      return api.imports.confirm(importId, sessionIds, metadata)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['imports'] })
      setConfirmPhase('working')
      setConfirmError(undefined)
      setConfirmOpen(true)
    },
    onError: (err: Error) => {
      setConfirmPhase('error')
      setConfirmError(err.message)
      setConfirmOpen(true)
    },
  })

  const discardMut = useMutation({
    mutationFn: () => api.imports.cancel(importId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['imports'] }); onClose() },
  })

  const newSessions      = sessions.filter(s => !s.already_imported)
  const existingSessions = sessions.filter(s => s.already_imported)
  const allNewSelected   = newSessions.length > 0 && newSessions.every(s => selected.has(s.id))

  function toggleAllNew() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allNewSelected) newSessions.forEach(s => next.delete(s.id))
      else                newSessions.forEach(s => next.add(s.id))
      return next
    })
  }
  function toggleOne(id: string) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  const isBusy = confirmMut.isPending || discardMut.isPending

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div
        ref={modalRef}
        role="dialog" aria-modal="true" aria-labelledby="review-modal-title"
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 id="review-modal-title" className="text-base font-semibold text-slate-900">Review Sessions</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select sessions to import. Choose the mask used, rate how you felt that morning, and add optional notes.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              <span className="text-sm">Loading sessions…</span>
            </div>
          )}
          {isError && (
            <div role="alert" className="flex items-center gap-2 m-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              Failed to load session candidates.
            </div>
          )}
          {!isLoading && !isError && sessions.length === 0 && (
            <div className="text-center py-16 text-slate-500 text-sm">No sessions were discovered in this import.</div>
          )}
          {sessions.length > 0 && (
            <table className="w-full text-sm" aria-label="Session candidates">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th scope="col" className="px-4 py-3 w-10">
                    <button onClick={toggleAllNew} role="checkbox" aria-checked={allNewSelected}
                      aria-label={allNewSelected ? 'Deselect all new' : 'Select all new'}
                      className="text-slate-400 hover:text-brand-600 transition-colors">
                      {allNewSelected
                        ? <CheckSquare className="w-4 h-4 text-brand-600" aria-hidden="true" />
                        : <Square className="w-4 h-4" aria-hidden="true" />}
                    </button>
                  </th>
                  <th scope="col" className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                  <th scope="col" className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Night</th>
                  <th scope="col" className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Duration</th>
                  <th scope="col" className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">AHI</th>
                  <th scope="col" className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pressure</th>
                  <th scope="col" className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Morning</th>
                  <th scope="col" className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[190px]">Mask</th>
                  <th scope="col" className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[150px]">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map(s => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    checked={selected.has(s.id)}
                    onToggle={() => toggleOne(s.id)}
                    masks={masks}
                    maskValue={sessionMasks[s.id] ?? ''}
                    onMaskChange={v => setSessionMasks(prev => ({ ...prev, [s.id]: v }))}
                    feelValue={sessionFeel[s.id] ?? ''}
                    onFeelChange={v => setSessionFeel(prev => ({ ...prev, [s.id]: v }))}
                    notesValue={sessionNotes[s.id] ?? ''}
                    onNotesChange={v => setSessionNotes(prev => ({ ...prev, [s.id]: v }))}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl shrink-0">
          {discarding ? (
            /* Discard confirmation */
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-slate-700">
                <span className="font-medium text-red-600">Discard this import?</span>
                {' '}All discovered sessions will be permanently discarded. This cannot be undone.
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button className="btn-ghost text-sm" onClick={() => setDiscarding(false)} disabled={isBusy}>Keep reviewing</button>
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                  onClick={() => discardMut.mutate()}
                  disabled={isBusy}
                >
                  {discardMut.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Discarding…</>
                    : <><Trash2 className="w-4 h-4" aria-hidden="true" /> Discard import</>}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-xs text-slate-500 space-y-0.5">
                  <p>{selected.size} of {sessions.length} session{sessions.length !== 1 ? 's' : ''} selected</p>
                  {existingSessions.length > 0 && (
                    <p className="text-amber-600">{existingSessions.length} already in database — deselected by default</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setDiscarding(true)}
                  disabled={isBusy}
                  className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40"
                  title="Discard this import entirely"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Discard import
                </button>
                <div className="w-px h-5 bg-slate-200" />
                <button className="btn-ghost" onClick={onClose} disabled={isBusy}>Cancel</button>
                <button
                  className="btn-primary"
                  disabled={isBusy || isLoading}
                  onClick={() => confirmMut.mutate([...selected])}
                >
                  {confirmMut.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Importing…</>
                    : <>Import {selected.size} session{selected.size !== 1 ? 's' : ''}</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    <ConfirmStatusDialog
      open={confirmOpen}
      phase={confirmPhase}
      errorMessage={confirmError}
      onClose={() => { setConfirmOpen(false); onClose() }}
    />
    </>
  )
}

// ─── Session row ──────────────────────────────────────────────────────────────

function SessionRow({
  session, checked, onToggle,
  masks, maskValue, onMaskChange,
  feelValue, onFeelChange,
  notesValue, onNotesChange,
}: {
  session: SessionCandidate
  checked: boolean
  onToggle: () => void
  masks: Mask[]
  maskValue: string
  onMaskChange: (v: string) => void
  feelValue: MorningFeel | ''
  onFeelChange: (v: MorningFeel | '') => void
  notesValue: string
  onNotesChange: (v: string) => void
}) {
  const { label, color } = ahiLabel(session.ahi)
  const existing = session.already_imported

  return (
    <tr
      className={`transition-colors ${existing ? 'bg-slate-50/80' : checked ? 'bg-brand-50/40 hover:bg-brand-50 cursor-pointer' : 'hover:bg-slate-50 cursor-pointer'}`}
      onClick={existing ? undefined : onToggle}
    >
      {/* Checkbox */}
      <td className="px-4 py-3 text-center">
        {existing ? (
          <span className="flex items-center justify-center">
            <DatabaseZap className="w-4 h-4 text-slate-300" aria-hidden="true" />
            <span className="sr-only">Already in database</span>
          </span>
        ) : (
          <button onClick={e => { e.stopPropagation(); onToggle() }} role="checkbox" aria-checked={checked}
            aria-label={`${checked ? 'Deselect' : 'Select'} session from ${formatDate(session.start_time)}`}
            className="text-slate-400 hover:text-brand-600 transition-colors">
            {checked
              ? <CheckSquare className="w-4 h-4 text-brand-600" aria-hidden="true" />
              : <Square className="w-4 h-4" aria-hidden="true" />}
          </button>
        )}
      </td>

      {/* Date */}
      <td className={`px-3 py-3 font-medium whitespace-nowrap ${existing ? 'text-slate-500' : 'text-slate-800'}`}>
        {formatDate(session.start_time)}
      </td>

      {/* Night */}
      <td className={`px-3 py-3 tabular-nums whitespace-nowrap text-xs ${existing ? 'text-slate-400' : 'text-slate-500'}`}>
        {formatTime(session.start_time)} → {formatTime(session.end_time)}
      </td>

      {/* Duration */}
      <td className={`px-3 py-3 tabular-nums whitespace-nowrap ${existing ? 'text-slate-500' : 'text-slate-700'}`}>
        {formatDuration(session.duration_minutes)}
      </td>

      {/* AHI */}
      <td className="px-3 py-3 tabular-nums whitespace-nowrap">
        {existing ? (
          <span className="text-slate-400">{formatAHI(session.ahi)}</span>
        ) : (
          <>
            <span className={`font-medium ${color}`}>{formatAHI(session.ahi)}</span>
            <span className={`ml-1.5 text-xs ${color}`}>{label}</span>
          </>
        )}
      </td>

      {/* Pressure */}
      <td className={`px-3 py-3 tabular-nums text-xs ${existing ? 'text-slate-500' : 'text-slate-600'}`}>
        {existing ? (
          <span className="inline-flex items-center gap-1">
            {session.pressure_p50.toFixed(1)} cmH₂O
            <span className="badge-pending text-[10px] px-1.5 py-0.5">In database</span>
          </span>
        ) : `${session.pressure_p50.toFixed(1)} cmH₂O`}
      </td>

      {/* Morning feel */}
      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
        {existing
          ? <span className="text-slate-300 text-xs">—</span>
          : <MorningFeelPicker value={feelValue} onChange={onFeelChange} />}
      </td>

      {/* Mask */}
      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
        {existing
          ? <span className="text-slate-300 text-xs">—</span>
          : <MaskSelect value={maskValue} onChange={onMaskChange} masks={masks}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 text-slate-700" />}
      </td>

      {/* Notes */}
      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
        {existing
          ? <span className="text-slate-300 text-xs">—</span>
          : <input type="text" value={notesValue} onChange={e => onNotesChange(e.target.value)}
              placeholder="Add notes…"
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 text-slate-700 placeholder:text-slate-300" />}
      </td>
    </tr>
  )
}
