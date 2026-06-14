import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FolderOpen, RefreshCw, MemoryStick, ScanSearch, CheckCircle2, ClipboardList } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { FullPageSpinner } from '@/components/LoadingSpinner'
import { ErrorBanner } from '@/components/ErrorBanner'
import { ImportStatusBadge } from '@/components/ImportStatusBadge'
import { SessionReviewModal } from './SessionReviewModal'

export function ImportsList() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [sourcePath, setSourcePath] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [formError, setFormError] = useState('')
  const [reviewImportId, setReviewImportId] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['imports'],
    queryFn: api.imports.list,
    refetchInterval: 5000,
  })

  const { data: detected, refetch: refetchDetect, isFetching: detecting } = useQuery({
    queryKey: ['detect'],
    queryFn: api.utilities.detect,
    refetchInterval: false,
    staleTime: 10_000,
  })

  const createMut = useMutation({
    mutationFn: api.imports.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['imports'] })
      setShowForm(false)
      setSourcePath('')
      setSourceName('')
      setFormError('')
    },
    onError: (err: Error) => setFormError(err.message),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sourcePath.trim()) { setFormError('Source path is required.'); return }
    createMut.mutate({ source_path: sourcePath.trim(), source_name: sourceName.trim() || undefined })
  }

  function selectCard(path: string) {
    setSourcePath(path)
    setShowForm(true)
    const parts = path.split('/')
    const label = parts[parts.length - 1] || path
    setSourceName(label)
    setFormError('')
  }

  if (isLoading) return <FullPageSpinner />
  if (isError) return <ErrorBanner message="Failed to load imports." />

  const imports = data?.imports ?? []
  const cards = detected?.cards ?? []

  return (
    <div>
      <PageHeader
        title="Imports"
        description="Manage your SD card data imports"
        action={
          <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
            <Upload className="w-4 h-4" />
            New Import
          </button>
        }
      />

      {/* Detected SD cards */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <MemoryStick className="w-4 h-4 text-brand-500" />
            Detected SD Cards
          </h3>
          <button
            className="btn-ghost text-xs"
            onClick={() => refetchDetect()}
            disabled={detecting}
          >
            {detecting
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <ScanSearch className="w-3.5 h-3.5" />}
            {detecting ? 'Scanning…' : 'Scan'}
          </button>
        </div>

        {cards.length === 0 ? (
          <p className="text-xs text-slate-400">
            No ResMed SD cards detected. Insert your SD card and click <strong>Scan</strong>, or enter the path manually below.
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
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {card.path.split('/').pop() ?? card.path}
                  </p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5 truncate">{card.path}</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-emerald-700 bg-emerald-100 border border-emerald-200
                                 px-2 py-0.5 rounded-full">
                  ResMed
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* New import form */}
      {showForm && (
        <div className="card p-5 mb-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-brand-500" />
            Import from local path
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Source path <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={sourcePath}
                onChange={e => setSourcePath(e.target.value)}
                placeholder="/Volumes/SD_CARD or /path/to/mirror"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none
                           focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Display name <span className="text-slate-400">(optional)</span>
              </label>
              <input
                type="text"
                value={sourceName}
                onChange={e => setSourceName(e.target.value)}
                placeholder="e.g. SD Mirror Jan 2025"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none
                           focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="btn-primary"
                disabled={createMut.isPending}
              >
                {createMut.isPending
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Starting…</>
                  : <><Upload className="w-4 h-4" /> Start Import</>}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Import list */}
      {imports.length === 0 ? (
        <div className="card p-12 text-center">
          <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No imports yet.</p>
          <p className="text-slate-400 text-xs mt-1">
            Click <strong>New Import</strong> to bring in your first SD card export.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Source</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Sessions</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Started</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {imports.map(imp => (
                <tr key={imp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800">{imp.source_name}</p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5 truncate max-w-xs">{imp.source_path}</p>
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
                        <ClipboardList className="w-3.5 h-3.5" />
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
