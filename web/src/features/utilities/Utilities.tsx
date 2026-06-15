// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Trash2, DatabaseZap, RefreshCw, MemoryStick, Download,
  AlertTriangle, CheckCircle2, Loader2, ChevronRight, ArchiveRestore, HardDrive,
} from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import type { Backup, DailySummary, Session } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}

function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel, danger = false }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden">
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 p-2 rounded-full ${danger ? 'bg-red-50' : 'bg-amber-50'}`}>
              <AlertTriangle className={`w-4 h-4 ${danger ? 'text-red-500' : 'text-amber-500'}`} aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 mb-1">{title}</h3>
              <p className="text-sm text-slate-500">{body}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
          <button onClick={onCancel} className="btn-ghost text-sm">Cancel</button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
              danger
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-amber-500 hover:bg-amber-600'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, ok }: { message: string; ok: boolean }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${
      ok ? 'bg-emerald-500' : 'bg-red-500'
    }`}>
      {ok
        ? <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
        : <AlertTriangle className="w-4 h-4" aria-hidden="true" />}
      {message}
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">{title}</h2>
      <div className="card divide-y divide-slate-100">{children}</div>
    </section>
  )
}

interface RowProps {
  icon: React.ReactNode
  label: string
  description: string
  action: React.ReactNode
}

function Row({ icon, label, description, action }: RowProps) {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="text-slate-400" aria-hidden="true">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  )
}

// ─── Export helper (client-side CSV) ─────────────────────────────────────────

async function exportSessionsCSV() {
  const [{ sessions }, { summaries }] = await Promise.all([
    api.sessions.list(),
    api.summaries.daily(),
  ])

  const summaryMap = new Map<string, DailySummary>()
  summaries.forEach(s => summaryMap.set(s.session_id, s))

  const rows: string[][] = [
    ['Date', 'Start (UTC)', 'End (UTC)', 'Duration (min)',
     'AHI', 'AI', 'HI',
     'Pressure P50 (cmH2O)', 'Pressure P95 (cmH2O)', 'Pressure Max (cmH2O)',
     'Leak Median (L/min)', 'Leak P95 (L/min)',
     'Device ID', 'Session ID'],
  ]

  sessions.forEach((s: Session) => {
    const sum = summaryMap.get(s.id)
    rows.push([
      s.start_time.slice(0, 10),
      s.start_time,
      s.end_time,
      String(s.duration_minutes),
      s.ahi.toFixed(2),
      sum ? sum.ai_index.toFixed(2) : '',
      sum ? sum.hi_index.toFixed(2) : '',
      s.pressure_p50.toFixed(1),
      s.pressure_p95.toFixed(1),
      s.pressure_max.toFixed(1),
      s.leak_rate_median.toFixed(1),
      sum ? sum.leak_rate_p95.toFixed(1) : '',
      s.device_id,
      s.id,
    ])
  })

  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `somnatrace-sessions-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Backup list item ─────────────────────────────────────────────────────────

function fmtBackupDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    + ' at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

interface BackupRowProps {
  backup: Backup
  onRestore: () => void
  onDelete: () => void
  isRestoring: boolean
  isDeleting: boolean
}

function BackupItem({ backup, onRestore, onDelete, isRestoring, isDeleting }: BackupRowProps) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 rounded-xl">
      <HardDrive className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 truncate">{fmtBackupDate(backup.created_at)}</p>
        <p className="text-xs text-slate-500">{fmtBytes(backup.size_bytes)}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onRestore}
          disabled={isRestoring || isDeleting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-600 border border-brand-200 hover:bg-brand-50 transition-colors disabled:opacity-40"
        >
          {isRestoring ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <ArchiveRestore className="w-3 h-3" aria-hidden="true" />}
          Restore
        </button>
        <button
          onClick={onDelete}
          disabled={isRestoring || isDeleting}
          aria-label="Delete backup"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors disabled:opacity-40"
        >
          {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Trash2 className="w-3 h-3" aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function Utilities() {
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState<null | 'delete' | { type: 'restore'; backup: Backup } | { type: 'deleteBackup'; backup: Backup }>(null)
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null)

  function showToast(message: string, ok: boolean) {
    setToast({ message, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['db-stats'],
    queryFn: api.utilities.stats,
    refetchInterval: false,
  })

  const { data: detected, refetch: refetchDetect, isFetching: detecting } = useQuery({
    queryKey: ['detect'],
    queryFn: api.utilities.detect,
    refetchInterval: false,
    enabled: false, // only run on demand
  })

  const deleteMutation = useMutation({
    mutationFn: api.utilities.deleteAll,
    onSuccess: () => {
      qc.invalidateQueries()
      refetchStats()
      setConfirm(null)
      showToast('All data deleted.', true)
    },
    onError: () => {
      setConfirm(null)
      showToast('Delete failed.', false)
    },
  })

  const vacuumMutation = useMutation({
    mutationFn: api.utilities.vacuum,
    onSuccess: () => {
      refetchStats()
      showToast('Database vacuumed.', true)
    },
    onError: () => showToast('Vacuum failed.', false),
  })

  const [exporting, setExporting] = useState(false)
  async function handleExport() {
    setExporting(true)
    try {
      await exportSessionsCSV()
      showToast('CSV exported.', true)
    } catch {
      showToast('Export failed.', false)
    } finally {
      setExporting(false)
    }
  }

  // ── Backup & Restore ──────────────────────────────────────────────────────

  const { data: backupsData, refetch: refetchBackups } = useQuery({
    queryKey: ['backups'],
    queryFn: api.backups.list,
  })
  const backups = backupsData?.backups ?? []

  const [activeBackupOp, setActiveBackupOp] = useState<{ id: string; op: 'restore' | 'delete' } | null>(null)

  const createBackupMutation = useMutation({
    mutationFn: api.backups.create,
    onSuccess: () => {
      refetchBackups()
      showToast('Backup created.', true)
    },
    onError: () => showToast('Backup failed.', false),
  })

  const restoreBackupMutation = useMutation({
    mutationFn: (id: string) => api.backups.restore(id),
    onSuccess: () => {
      qc.invalidateQueries()
      setConfirm(null)
      setActiveBackupOp(null)
      showToast('Restore complete. All data has been replaced.', true)
    },
    onError: () => {
      setConfirm(null)
      setActiveBackupOp(null)
      showToast('Restore failed.', false)
    },
  })

  const deleteBackupMutation = useMutation({
    mutationFn: (id: string) => api.backups.delete(id),
    onSuccess: () => {
      refetchBackups()
      setConfirm(null)
      setActiveBackupOp(null)
      showToast('Backup deleted.', true)
    },
    onError: () => {
      setConfirm(null)
      setActiveBackupOp(null)
      showToast('Delete failed.', false)
    },
  })

  return (
    <div>
      <PageHeader
        title="Utilities"
        description="Database management, exports, and diagnostic tools."
      />

      {/* Database stats */}
      <Section title="Database">
        <div className="px-5 py-4">
          {stats ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {(Object.entries(stats.counts) as [string, number][]).map(([key, val]) => (
                <div key={key} className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-semibold text-slate-800">{val}</p>
                  <p className="text-xs text-slate-500 mt-0.5 capitalize">{key.replace('_', ' ')}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">Loading…</div>
          )}
          {stats && (
            <p className="text-xs text-slate-500 mt-3">
              Database file size: <span className="font-medium text-slate-600">{fmtBytes(stats.size_bytes)}</span>
              {' '}(includes WAL)
            </p>
          )}
        </div>

        <Row
          icon={<DatabaseZap className="w-4 h-4" />}
          label="Vacuum Database"
          description="Reclaim disk space and defragment pages after large deletes."
          action={
            <button
              onClick={() => vacuumMutation.mutate()}
              disabled={vacuumMutation.isPending}
              className="btn-ghost text-sm flex items-center gap-1.5"
            >
              {vacuumMutation.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                : <DatabaseZap className="w-3.5 h-3.5" aria-hidden="true" />}
              Vacuum
            </button>
          }
        />
      </Section>

      {/* Data management */}
      <Section title="Data Management">
        <Row
          icon={<Download className="w-4 h-4" />}
          label="Export Sessions"
          description="Download all sessions as a CSV file for use in spreadsheets or analysis tools."
          action={
            <button
              onClick={handleExport}
              disabled={exporting}
              className="btn-ghost text-sm flex items-center gap-1.5"
            >
              {exporting
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                : <Download className="w-3.5 h-3.5" aria-hidden="true" />}
              Export CSV
            </button>
          }
        />

        <Row
          icon={<Trash2 className="w-4 h-4 text-red-400" />}
          label="Delete All Data"
          description="Permanently remove all devices, imports, sessions, summaries, and signal data. The database schema is preserved."
          action={
            <button
              onClick={() => setConfirm('delete')}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
            >
              Delete All…
            </button>
          }
        />
      </Section>

      {/* Backup & Restore */}
      <Section title="Backup & Restore">
        <Row
          icon={<HardDrive className="w-4 h-4" />}
          label="Create Backup"
          description="Save a complete snapshot of your database. Multiple backups can be stored and restored individually."
          action={
            <button
              onClick={() => createBackupMutation.mutate()}
              disabled={createBackupMutation.isPending}
              className="btn-primary text-sm flex items-center gap-1.5"
            >
              {createBackupMutation.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                : <HardDrive className="w-3.5 h-3.5" aria-hidden="true" />}
              Back Up Now
            </button>
          }
        />

        {backups.length > 0 && (
          <div className="px-5 pb-4 space-y-2">
            {backups.map(backup => (
              <BackupItem
                key={backup.id}
                backup={backup}
                isRestoring={activeBackupOp?.id === backup.id && activeBackupOp.op === 'restore'}
                isDeleting={activeBackupOp?.id === backup.id && activeBackupOp.op === 'delete'}
                onRestore={() => setConfirm({ type: 'restore', backup })}
                onDelete={() => setConfirm({ type: 'deleteBackup', backup })}
              />
            ))}
          </div>
        )}

        {backups.length === 0 && !createBackupMutation.isPending && (
          <div className="px-5 pb-4">
            <p className="text-xs text-slate-500">No backups yet. Click "Back Up Now" to create your first snapshot.</p>
          </div>
        )}
      </Section>

      {/* SD card detection */}
      <Section title="Device Detection">
        <Row
          icon={<MemoryStick className="w-4 h-4" />}
          label="Scan for SD Cards"
          description="Check mounted volumes for ResMed SD cards ready to import."
          action={
            <button
              onClick={() => refetchDetect()}
              disabled={detecting}
              className="btn-ghost text-sm flex items-center gap-1.5"
            >
              {detecting
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                : <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
              Scan
            </button>
          }
        />

        {detected && (
          <div className="px-5 pb-4">
            {detected.cards.length === 0 ? (
              <p className="text-xs text-slate-500">No ResMed SD cards found in mounted volumes.</p>
            ) : (
              <ul className="space-y-2">
                {detected.cards.map(card => (
                  <li key={card.path} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" />
                    <span className="font-mono text-slate-700 text-xs">{card.path}</span>
                    <a
                      href="/imports"
                      onClick={() => {
                        // Pre-fill import path via sessionStorage for the imports page to pick up
                        sessionStorage.setItem('prefill_import_path', card.path)
                        window.location.href = '/imports'
                      }}
                      className="ml-auto flex items-center gap-1 text-brand-600 hover:text-brand-700 text-xs font-medium"
                    >
                      Import <ChevronRight className="w-3 h-3" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Section>

      {/* Confirm dialogs */}
      {confirm === 'delete' && (
        <ConfirmDialog
          title="Delete all data?"
          body={`This will permanently remove ${stats?.counts.sessions ?? 'all'} session(s), ${stats?.counts.devices ?? 'all'} device(s), and all related imports and signal data. This cannot be undone.`}
          confirmLabel="Yes, delete everything"
          danger
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm !== null && typeof confirm === 'object' && confirm.type === 'restore' && (
        <ConfirmDialog
          title="Restore this backup?"
          body={`All current data will be replaced with the snapshot from ${fmtBackupDate(confirm.backup.created_at)}. This cannot be undone.`}
          confirmLabel="Yes, restore"
          danger
          onConfirm={() => {
            setActiveBackupOp({ id: confirm.backup.id, op: 'restore' })
            restoreBackupMutation.mutate(confirm.backup.id)
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm !== null && typeof confirm === 'object' && confirm.type === 'deleteBackup' && (
        <ConfirmDialog
          title="Delete this backup?"
          body={`The snapshot from ${fmtBackupDate(confirm.backup.created_at)} will be permanently removed.`}
          confirmLabel="Delete backup"
          danger={false}
          onConfirm={() => {
            setActiveBackupOp({ id: confirm.backup.id, op: 'delete' })
            deleteBackupMutation.mutate(confirm.backup.id)
          }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} ok={toast.ok} />}
    </div>
  )
}
