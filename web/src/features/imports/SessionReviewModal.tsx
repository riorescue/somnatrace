import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, CheckSquare, Square, AlertCircle, Loader2, DatabaseZap } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, formatTime, formatDuration, formatAHI, ahiLabel } from '@/lib/format'
import type { SessionCandidate } from '@/types'

interface Props {
  importId: string
  onClose: () => void
}

export function SessionReviewModal({ importId, onClose }: Props) {
  const qc = useQueryClient()
  const modalRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement
    const modal = modalRef.current
    if (!modal) return

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

    modal.querySelectorAll<HTMLElement>(focusableSelector)[0]?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const els = Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector))
      const first = els[0]
      const last = els[els.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [onClose])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['import-candidates', importId],
    queryFn: () => api.imports.candidates(importId),
  })

  const sessions = data?.sessions ?? []

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [initialised, setInitialised] = useState(false)

  // Once candidates load, pre-select only sessions not already in the database.
  useEffect(() => {
    if (sessions.length > 0 && !initialised) {
      setSelected(new Set(sessions.filter(s => !s.already_imported).map(s => s.id)))
      setInitialised(true)
    }
  }, [sessions.length, initialised])

  const confirmMut = useMutation({
    mutationFn: (sessionIds: string[]) => api.imports.confirm(importId, sessionIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['imports'] })
      onClose()
    },
  })

  const newSessions = sessions.filter(s => !s.already_imported)
  const existingSessions = sessions.filter(s => s.already_imported)
  const allNewSelected = newSessions.length > 0 && newSessions.every(s => selected.has(s.id))

  function toggleAllNew() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allNewSelected) {
        newSessions.forEach(s => next.delete(s.id))
      } else {
        newSessions.forEach(s => next.add(s.id))
      }
      return next
    })
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 id="review-modal-title" className="text-base font-semibold text-slate-900">Review Sessions</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select which sessions to import into the database
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
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
            <div className="text-center py-16 text-slate-500 text-sm">
              No sessions were discovered in this import.
            </div>
          )}

          {sessions.length > 0 && (
            <table className="w-full text-sm" aria-label="Session candidates">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th scope="col" className="px-4 py-3 w-10">
                    <button
                      onClick={toggleAllNew}
                      role="checkbox"
                      aria-checked={allNewSelected}
                      aria-label={allNewSelected ? 'Deselect all new sessions' : 'Select all new sessions'}
                      className="text-slate-400 hover:text-brand-600 transition-colors"
                    >
                      {allNewSelected
                        ? <CheckSquare className="w-4 h-4 text-brand-600" aria-hidden="true" />
                        : <Square className="w-4 h-4" aria-hidden="true" />}
                    </button>
                  </th>
                  <th scope="col" className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                  <th scope="col" className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Night</th>
                  <th scope="col" className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Duration</th>
                  <th scope="col" className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">AHI</th>
                  <th scope="col" className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Events</th>
                  <th scope="col" className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pressure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map(s => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    checked={selected.has(s.id)}
                    onToggle={() => toggleOne(s.id)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl shrink-0">
          <div className="text-xs text-slate-500 space-y-0.5">
            <p>{selected.size} of {sessions.length} session{sessions.length !== 1 ? 's' : ''} selected</p>
            {existingSessions.length > 0 && (
              <p className="text-amber-600">
                {existingSessions.length} already in database — deselected by default
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-ghost" onClick={onClose} disabled={confirmMut.isPending}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={confirmMut.isPending || isLoading}
              onClick={() => confirmMut.mutate([...selected])}
            >
              {confirmMut.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Importing…</>
                : <>Import {selected.size} session{selected.size !== 1 ? 's' : ''}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SessionRow({
  session, checked, onToggle,
}: {
  session: SessionCandidate
  checked: boolean
  onToggle: () => void
}) {
  const { label, color } = ahiLabel(session.ahi)
  const existing = session.already_imported

  return (
    <tr
      className={`transition-colors ${existing ? 'bg-slate-50/80' : checked ? 'bg-brand-50/40 hover:bg-brand-50 cursor-pointer' : 'hover:bg-slate-50 cursor-pointer'}`}
      onClick={existing ? undefined : onToggle}
    >
      <td className="px-4 py-3 text-center">
        {existing ? (
          <span className="flex items-center justify-center">
            <DatabaseZap className="w-4 h-4 text-slate-300" aria-hidden="true" />
            <span className="sr-only">Already in database</span>
          </span>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); onToggle() }}
            role="checkbox"
            aria-checked={checked}
            aria-label={`${checked ? 'Deselect' : 'Select'} session from ${formatDate(session.start_time)}`}
            className="text-slate-400 hover:text-brand-600 transition-colors"
          >
            {checked
              ? <CheckSquare className="w-4 h-4 text-brand-600" aria-hidden="true" />
              : <Square className="w-4 h-4" aria-hidden="true" />}
          </button>
        )}
      </td>
      <td className={`px-3 py-3 font-medium whitespace-nowrap ${existing ? 'text-slate-500' : 'text-slate-800'}`}>
        {formatDate(session.start_time)}
      </td>
      <td className={`px-3 py-3 tabular-nums whitespace-nowrap text-xs ${existing ? 'text-slate-400' : 'text-slate-500'}`}>
        {formatTime(session.start_time)} → {formatTime(session.end_time)}
      </td>
      <td className={`px-3 py-3 tabular-nums whitespace-nowrap ${existing ? 'text-slate-500' : 'text-slate-700'}`}>
        {formatDuration(session.duration_minutes)}
      </td>
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
      <td className={`px-3 py-3 tabular-nums ${existing ? 'text-slate-500' : 'text-slate-600'}`}>
        {session.event_count}
      </td>
      <td className={`px-3 py-3 tabular-nums text-xs ${existing ? 'text-slate-500' : 'text-slate-600'}`}>
        {existing ? (
          <span className="inline-flex items-center gap-1">
            {session.pressure_p50.toFixed(1)} cmH₂O
            <span className="badge-pending text-[10px] px-1.5 py-0.5">In database</span>
          </span>
        ) : (
          `${session.pressure_p50.toFixed(1)} cmH₂O`
        )}
      </td>
    </tr>
  )
}
