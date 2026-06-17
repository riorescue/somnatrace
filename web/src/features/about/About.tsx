// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

import { useQuery } from '@tanstack/react-query'
import { Server, Database, Cpu, Shield, CheckCircle2, Accessibility, TriangleAlert } from 'lucide-react'
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
              ['Schema version', stats?.schema_version ?? '—'],
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
            {([
              { name: 'ResMed AirSense 11',                    detail: 'Full signals, events, settings capture' },
              { name: 'ResMed AirSense 10',                    detail: 'Full signals, events, settings capture' },
              { name: 'ResMed AirCurve 11',                    detail: 'Full signals, events, settings capture' },
              { name: 'ResMed AirCurve 10',                    detail: 'Full signals, events, settings capture' },
              { name: 'Philips DreamStation (DS1)',             detail: 'Pressure stats, OA/CA/HY/RERA/FL events' },
              { name: 'Philips DreamStation 2 (DS2)',           detail: 'Pressure stats, OA/CA/HY/RERA/FL events — decrypted on-device' },
              { name: 'Fisher & Paykel SleepStyle',            detail: 'Nightly summary, flow/pressure/leak waveforms' },
            ] as const).map(({ name, detail }) => (
              <div key={name} className="flex items-start justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm text-slate-700">{name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{detail}</p>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> Supported
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Accessibility */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Accessibility className="w-4 h-4 text-brand-500" aria-hidden="true" />
            Accessibility
          </h2>
          <p className="text-sm text-slate-600 mb-3">
            SomnaTrace targets <strong>WCAG 2.2 Level AA</strong> conformance. The interface is designed to be
            usable with a keyboard alone, with a screen reader, and by users who have configured
            reduced motion or high-contrast preferences at the OS level.
          </p>
          <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 text-sm">
            {[
              ['Keyboard navigation',  'Full tab order throughout; skip-to-content link at page top; Escape closes dialogs and popovers'],
              ['Screen reader support','Landmark regions labelled; all interactive elements have accessible names; dynamic content announced via ARIA live regions'],
              ['Focus visibility',     'Keyboard focus outline always visible (:focus-visible); suppressed for mouse users'],
              ['Color contrast',       'All text meets the 4.5:1 AA minimum ratio'],
              ['Color independence',   'Status and severity information is never conveyed by color alone — text labels accompany all color-coded values'],
              ['Reduced motion',       'All CSS animations and transitions are suppressed when the OS prefers-reduced-motion setting is active'],
              ['Charts',               'Recharts visualizations are hidden from assistive technology; each chart has a screen-reader-only text description as an alternative'],
            ].map(([feature, detail]) => (
              <div key={feature} className="px-4 py-3">
                <p className="font-medium text-slate-700">{feature}</p>
                <p className="text-xs text-slate-500 mt-0.5">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Medical disclaimer */}
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900 mb-3 flex items-center gap-2">
            <TriangleAlert className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
            Not Medical Advice
          </h2>
          <p className="text-sm text-amber-900 font-medium mb-2">
            SomnaTrace is a personal data viewer, not a medical device or clinical tool.
          </p>
          <p className="text-sm text-amber-800 mb-2">
            The information displayed — including AHI, leak rates, pressure statistics, compliance
            figures, and all derived metrics — is for <strong>informational and personal tracking
            purposes only</strong>. It does not constitute medical advice, diagnosis, or treatment
            recommendations of any kind.
          </p>
          <p className="text-sm text-amber-800 mb-2">
            Do not use this application to make decisions about your therapy, equipment, or health
            without first consulting a qualified healthcare provider. PAP therapy settings should only
            be adjusted under the direction of a licensed clinician.
          </p>
          <p className="text-sm text-amber-800">
            If you have questions or concerns about your sleep therapy, contact your prescribing
            physician or a board-certified sleep medicine specialist.
          </p>
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
          <p className="text-xs text-slate-500 mt-2">
            Source code: <span className="font-mono">github.com/riorescue/somnatrace</span>
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
