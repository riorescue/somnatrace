// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Wind, CheckCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import type { AppSettings } from '@/types'

function ComplianceSettingsCard() {
  const queryClient = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: api.appSettings.get,
  })

  const [hours, setHours] = useState('')
  const [pct, setPct] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings) {
      setHours(String(settings.compliance_hours_threshold))
      setPct(String(settings.compliance_pct_threshold))
    }
  }, [settings])

  const mutation = useMutation({
    mutationFn: (body: Partial<Pick<AppSettings, 'compliance_hours_threshold' | 'compliance_pct_threshold'>>) =>
      api.appSettings.patch(body),
    onSuccess: (updated) => {
      queryClient.setQueryData(['app-settings'], updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  const hoursNum = parseFloat(hours)
  const pctNum   = parseFloat(pct)
  const hoursValid = !isNaN(hoursNum) && hoursNum >= 0.5 && hoursNum <= 12
  const pctValid   = !isNaN(pctNum)   && pctNum   >= 0   && pctNum   <= 100

  const isDirty = settings
    ? hoursNum !== settings.compliance_hours_threshold || pctNum !== settings.compliance_pct_threshold
    : false

  const handleSave = () => {
    if (!hoursValid || !pctValid) return
    mutation.mutate({
      compliance_hours_threshold: hoursNum,
      compliance_pct_threshold: pctNum,
    })
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
        <ClipboardList className="w-4 h-4 text-brand-500" />
        Compliance Reporting
      </h2>
      <p className="text-xs text-slate-500 mb-4">
        Thresholds used in the Compliance &amp; Usage report. Changes apply immediately on next report load.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-600 mb-1">
            Minimum hours per night
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0.5}
              max={12}
              step={0.5}
              value={hours}
              onChange={e => setHours(e.target.value)}
              className={`w-24 text-sm font-mono px-3 py-1.5 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 ${
                hoursValid ? 'border-slate-300' : 'border-red-400'
              }`}
            />
            <span className="text-sm text-slate-500">hours (default: 4.0)</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            A night counts as "compliant" when therapy is used for at least this many hours.
          </p>
        </div>

        <div>
          <label className="block text-sm text-slate-600 mb-1">
            Compliance threshold
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={pct}
              onChange={e => setPct(e.target.value)}
              className={`w-24 text-sm font-mono px-3 py-1.5 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 ${
                pctValid ? 'border-slate-300' : 'border-red-400'
              }`}
            />
            <span className="text-sm text-slate-500">% of nights (default: 70%)</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            The percentage of nights that must meet the hours threshold to be considered compliant.
            CMS standard is 70% of nights in the first 90 days.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={!isDirty || !hoursValid || !pctValid || mutation.isPending}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" /> Saved
            </span>
          )}
          {mutation.isError && (
            <span className="text-xs text-red-600">Failed to save — try again.</span>
          )}
        </div>
      </div>
    </div>
  )
}

function LeakThresholdsCard() {
  const queryClient = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: api.appSettings.get,
  })

  const [warn, setWarn] = useState('')
  const [alert, setAlert] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings) {
      setWarn(String(settings.leak_warn_p95))
      setAlert(String(settings.leak_alert_p95))
    }
  }, [settings])

  const mutation = useMutation({
    mutationFn: (body: Partial<Pick<AppSettings, 'leak_warn_p95' | 'leak_alert_p95'>>) =>
      api.appSettings.patch(body),
    onSuccess: (updated) => {
      queryClient.setQueryData(['app-settings'], updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  const warnNum  = parseFloat(warn)
  const alertNum = parseFloat(alert)
  const warnValid  = !isNaN(warnNum)  && warnNum  >= 1 && warnNum  <= 200
  const alertValid = !isNaN(alertNum) && alertNum >= 1 && alertNum <= 200 && alertNum > warnNum

  const isDirty = settings
    ? warnNum !== settings.leak_warn_p95 || alertNum !== settings.leak_alert_p95
    : false

  const handleSave = () => {
    if (!warnValid || !alertValid) return
    mutation.mutate({ leak_warn_p95: warnNum, leak_alert_p95: alertNum })
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
        <Wind className="w-4 h-4 text-brand-500" />
        Leak Rate Thresholds
      </h2>
      <p className="text-xs text-slate-500 mb-4">
        P95 unintentional leak thresholds used in the Mask &amp; Device Performance report.
        Changes apply immediately on next report load.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-600 mb-1">
            Elevated leak threshold (P95)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={200}
              step={1}
              value={warn}
              onChange={e => setWarn(e.target.value)}
              className={`w-24 text-sm font-mono px-3 py-1.5 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 ${
                warnValid ? 'border-slate-300' : 'border-red-400'
              }`}
            />
            <span className="text-sm text-slate-500">L/min (default: 24)</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Nights at or above this value are flagged as elevated leak.
          </p>
        </div>

        <div>
          <label className="block text-sm text-slate-600 mb-1">
            Severe leak threshold (P95)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={200}
              step={1}
              value={alert}
              onChange={e => setAlert(e.target.value)}
              className={`w-24 text-sm font-mono px-3 py-1.5 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 ${
                alertValid ? 'border-slate-300' : 'border-red-400'
              }`}
            />
            <span className="text-sm text-slate-500">L/min (default: 40)</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Nights at or above this value are flagged as severe leak. Must be greater than the elevated threshold.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={!isDirty || !warnValid || !alertValid || mutation.isPending}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" /> Saved
            </span>
          )}
          {mutation.isError && (
            <span className="text-xs text-red-600">Failed to save — try again.</span>
          )}
        </div>
      </div>
    </div>
  )
}

export function Settings() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Configure application behavior"
      />
      <div className="space-y-6 max-w-2xl">
        <ComplianceSettingsCard />
        <LeakThresholdsCard />
      </div>
    </div>
  )
}
