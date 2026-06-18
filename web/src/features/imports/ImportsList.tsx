// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload, FolderOpen, RefreshCw, MemoryStick, ScanSearch,
  CheckCircle2, ClipboardList, HardDrive, AlertCircle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { FullPageSpinner } from '@/components/LoadingSpinner'
import { ErrorBanner } from '@/components/ErrorBanner'
import { ImportStatusBadge } from '@/components/ImportStatusBadge'
import { SessionReviewModal } from './SessionReviewModal'

function deviceFamilyLabel(family: string): string {
  switch (family) {
    case 'resmed':       return 'ResMed'
    case 'dreamstation': return 'DreamStation'
    case 'sleepstyle':   return 'SleepStyle'
    default:             return family
  }
}

// ─── Import status dialog ─────────────────────────────────────────────────────

type ImportDialogPhase = 'working' | 'success' | 'error'
const FAKE_PROGRESS_MS = 9000

function ImportStatusDialog({
  open,
  phase,
  errorMessage,
  onClose,
}: {
  open: boolean
  phase: ImportDialogPhase
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
      : { width: `${pct}%`, transition: `width ${pct === 85 ? FAKE_PROGRESS_MS : 300}ms ease-out` }

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
                <HardDrive className="w-7 h-7 text-brand-400" aria-hidden="true" />
              </div>
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1.5">Importing Device Data</h3>
            <p className="text-sm text-slate-500 mb-7">
              Scanning files and building your session list…
            </p>
          </>
        )}

        {phase === 'success' && (
          <>
            <div className="flex justify-center mb-6">
              <CheckCircle2 className="w-14 h-14 text-emerald-500" aria-hidden="true" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1.5">Import Ready</h3>
            <p className="text-sm text-slate-500 mb-7">Opening session review…</p>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="flex justify-center mb-6">
              <AlertCircle className="w-14 h-14 text-red-500" aria-hidden="true" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1.5">Import Failed</h3>
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

// ─── Main component ───────────────────────────────────────────────────────────

export function ImportsList() {
  const qc = useQueryClient()
  const [sourcePath, setSourcePath] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [formError, setFormError] = useState('')
  const [reviewImportId, setReviewImportId] = useState<string | null>(null)

  const [importDialogOpen,  setImportDialogOpen]  = useState(false)
  const [importDialogPhase, setImportDialogPhase] = useState<ImportDialogPhase>('working')
  const [importDialogError, setImportDialogError] = useState<string>()
  const [creatingImportId,  setCreatingImportId]  = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['imports'],
    queryFn: api.imports.list,
    refetchInterval: creatingImportId ? 1500 : 5000,
  })

  const { data: detected, refetch: refetchDetect, isFetching: detecting } = useQuery({
    queryKey: ['detect'],
    queryFn: api.utilities.detect,
    refetchInterval: false,
    staleTime: 10_000,
  })

  // Watch for the in-progress import to reach pending_review or fail.
  useEffect(() => {
    if (!creatingImportId || !importDialogOpen) return
    const allImports = data?.imports ?? []
    const imp = allImports.find(i => i.id === creatingImportId)
    if (!imp) return

    if (imp.status === 'pending_review') {
      setImportDialogPhase('success')
      setTimeout(() => {
        setImportDialogOpen(false)
        setCreatingImportId(null)
        setReviewImportId(imp.id)
      }, 1200)
    } else if (imp.status === 'failed' || imp.status === 'cancelled') {
      setImportDialogPhase('error')
      setImportDialogError(imp.error_message || 'Import failed. Check the source path and try again.')
      setCreatingImportId(null)
    }
  }, [data, creatingImportId, importDialogOpen])

  const createMut = useMutation({
    mutationFn: api.imports.create,
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['imports'] })
      setSourcePath('')
      setSourceName('')
      setFormError('')
      setCreatingImportId(created.id)
    },
    onError: (err: Error) => {
      setImportDialogPhase('error')
      setImportDialogError(err.message)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sourcePath.trim()) { setFormError('Source path is required.'); return }
    setImportDialogPhase('working')
    setImportDialogError(undefined)
    setCreatingImportId(null)
    setImportDialogOpen(true)
    setFormError('')
    createMut.mutate({ source_path: sourcePath.trim(), source_name: sourceName.trim() || undefined })
  }

  function pathLabel(path: string): string {
    const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
    return parts[parts.length - 1] ?? path
  }

  function selectCard(path: string) {
    setSourcePath(path)
    setSourceName(pathLabel(path))
    setFormError('')
  }

  if (isLoading) return <FullPageSpinner />
  if (isError) return <ErrorBanner message="Failed to load imports." />

  const allImports = data?.imports ?? []
  const imports = allImports.slice(0, 5)
  const cards = detected?.cards ?? []
  const hasPendingReview = allImports.some(i => i.status === 'pending_review')

  return (
    <div>
      <PageHeader
        title="Imports"
        description="Manage your device data imports"
      />

      <ImportStatusDialog
        open={importDialogOpen}
        phase={importDialogPhase}
        errorMessage={importDialogError}
        onClose={() => {
          setImportDialogOpen(false)
          setCreatingImportId(null)
        }}
      />

      {/* Detected storage media */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <MemoryStick className="w-4 h-4 text-brand-500" aria-hidden="true" />
            Detected Storage Media
          </h3>
          <button
            className="btn-ghost text-xs"
            onClick={() => refetchDetect()}
            disabled={detecting}
          >
            {detecting
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              : <ScanSearch className="w-3.5 h-3.5" aria-hidden="true" />}
            {detecting ? 'Scanning…' : 'Scan'}
          </button>
        </div>

        {cards.length === 0 ? (
          <p className="text-xs text-slate-500">
            No compatible storage media detected. Connect your device's storage media and click <strong>Scan</strong>, or enter the path manually below.
          </p>
        ) : (
          <div className="space-y-2">
            {cards.map(card => (
              <button
                key={card.path}
                onClick={() => selectCard(card.path)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50
                           hover:border-emerald-400 hover:bg-emerald-100 transition-colors text-left"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {pathLabel(card.path)}
                  </p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5 truncate">{card.path}</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-emerald-700 bg-emerald-100 border border-emerald-200
                                 px-2 py-0.5 rounded-full">
                  {deviceFamilyLabel(card.family)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* New import form */}
      <div className="card p-5 mb-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-brand-500" aria-hidden="true" />
          Import from local path
        </h3>
        {hasPendingReview && (
          <p role="alert" className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            An import is awaiting session review. Complete it before starting a new one.
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="import-source-path" className="block text-xs font-medium text-slate-600 mb-1">
              Source path{' '}
              <span aria-hidden="true" className="text-red-500">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="import-source-path"
              type="text"
              value={sourcePath}
              onChange={e => setSourcePath(e.target.value)}
              placeholder="D:\ (Windows) or /Volumes/RESMED (macOS)"
              aria-required="true"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none
                         focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="import-display-name" className="block text-xs font-medium text-slate-600 mb-1">
              Display name <span className="text-slate-500">(optional)</span>
            </label>
            <input
              id="import-display-name"
              type="text"
              value={sourceName}
              onChange={e => setSourceName(e.target.value)}
              placeholder="e.g. Jan 2025 export"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none
                         focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          {formError && <p role="alert" className="text-xs text-red-600">{formError}</p>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="btn-primary"
              disabled={createMut.isPending || hasPendingReview || importDialogOpen}
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              Start Import
            </button>
          </div>
        </form>
      </div>

      {/* Import list */}
      {imports.length === 0 ? (
        <div className="card p-12 text-center">
          <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" aria-hidden="true" />
          <p className="text-slate-500 text-sm">No imports yet.</p>
          <p className="text-slate-500 text-xs mt-1">
            Enter a path above to bring in your first device data export.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm" aria-label="Imports">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th scope="col" className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Source</th>
                <th scope="col" className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th scope="col" className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Sessions</th>
                <th scope="col" className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Started</th>
                <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {imports.map(imp => (
                <tr key={imp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800">{imp.source_name}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5 truncate max-w-xs">{imp.source_path}</p>
                  </td>
                  <td className="px-5 py-3">
                    <ImportStatusBadge status={imp.status} />
                    {imp.error_message && (
                      <p className="text-xs text-red-500 mt-1 max-w-xs truncate">{imp.error_message}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-slate-700">{imp.session_count}</td>
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{formatDateTime(imp.started_at)}</td>
                  <td className="px-5 py-3 text-right">
                    {imp.status === 'pending_review' && (
                      <button
                        className="btn-primary text-xs py-1.5 px-3"
                        onClick={() => setReviewImportId(imp.id)}
                      >
                        <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" />
                        Review Sessions
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Session review modal */}
      {reviewImportId && (
        <SessionReviewModal
          importId={reviewImportId}
          onClose={() => setReviewImportId(null)}
        />
      )}
    </div>
  )
}
