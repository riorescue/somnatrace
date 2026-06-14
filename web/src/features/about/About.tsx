import { useQuery } from '@tanstack/react-query'
import { Server, Database, Cpu, Shield, CheckCircle2, Clock } from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { FullPageSpinner } from '@/components/LoadingSpinner'

export function About() {
  const { data, isLoading } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 30_000,
  })

  const { data: stats } = useQuery({
    queryKey: ['db-stats'],
    queryFn: api.utilities.stats,
  })

  if (isLoading) return <FullPageSpinner />

  return (
    <div>
      <PageHeader
        title="About"
        description="Application status, storage, and device compatibility"
      />

      <div className="space-y-6 max-w-2xl">
        {/* App info */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Server className="w-4 h-4 text-brand-500" />
            Application
          </h2>
          <dl className="space-y-3">
            {[
              ['Version',    data?.version    ?? '—'],
              ['Mode',       data?.mode       ?? '—'],
              ['Runtime',    data?.go_version ?? '—'],
              ['Uptime',     data?.uptime     ?? '—'],
              ['Status',     data?.status     ?? '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <dt className="text-sm text-slate-500">{k}</dt>
                <dd className="text-sm font-mono text-slate-800 bg-slate-50 px-2 py-0.5 rounded">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Storage */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Database className="w-4 h-4 text-brand-500" />
            Storage
          </h2>
          <dl className="space-y-3">
            {[
              ['Driver',         'SQLite (WAL mode, pure-Go)'],
              ['Schema version', '009_app_settings'],
              ['Sessions',       stats ? String(stats.counts.sessions) : '—'],
              ['Signal records', stats ? String(stats.counts.session_signals) : '—'],
              ['Database size',  stats ? fmtBytes(stats.size_bytes) : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <dt className="text-sm text-slate-500">{k}</dt>
                <dd className="text-sm font-mono text-slate-800 bg-slate-50 px-2 py-0.5 rounded">{v}</dd>
              </div>
            ))}
            <div className="pt-1">
              <dt className="text-sm text-slate-500 mb-1.5">Database path</dt>
              <dd className="text-xs font-mono text-slate-800 bg-slate-50 border border-slate-200 px-3 py-2 rounded break-all select-all">
                {data?.db_path ?? '—'}
              </dd>
            </div>
          </dl>
        </div>

        {/* Supported devices */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-brand-500" />
            Supported Devices
          </h2>
          <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
            {[
              { name: 'ResMed AirSense 11',  note: 'Full EDF parsing · SD card import · Signal visualization · Settings & identification capture' },
              { name: 'ResMed AirSense 10',  note: 'Full EDF parsing · SD card import · Signal visualization · Settings & identification capture' },
              { name: 'ResMed AirCurve 11',  note: 'Full EDF parsing · SD card import · Signal visualization · Settings & identification capture' },
              { name: 'ResMed AirCurve 10',  note: 'Full EDF parsing · SD card import · Signal visualization · Settings & identification capture' },
            ].map(({ name, note }) => (
              <div key={name} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm text-slate-700">{name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{note}</p>
                </div>
                <span className="ml-4 shrink-0 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> Working
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-sm text-slate-400">Philips DreamStation series</p>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                <Clock className="w-3 h-3" /> Planned
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-sm text-slate-400">Other EDF-compatible devices</p>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                <Clock className="w-3 h-3" /> Planned
              </span>
            </div>
          </div>
        </div>

        {/* Privacy */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-brand-500" />
            Privacy
          </h2>
          <p className="text-sm text-slate-600">
            SomnaTrace is <strong>local-first</strong>. All data stays on your machine —
            no telemetry, no cloud sync, no accounts required.
            Signal and settings data are stored in a local SQLite database and never leave your device.
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Source code: <span className="font-mono">github.com/somnatrace/somnatrace</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
