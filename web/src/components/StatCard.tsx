// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

import { useState, useEffect } from 'react'
import { Info, X } from 'lucide-react'

interface Props {
  label: string
  value: React.ReactNode
  sub?: string
  accent?: string
  info?: string
}

export function StatCard({ label, value, sub, accent, info }: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
        {info && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-slate-300 hover:text-slate-500 transition-colors focus:outline-none"
            aria-label={`About ${label}`}
          >
            <Info className="w-3 h-3" aria-hidden="true" />
          </button>
        )}
      </div>
      <span className={`text-2xl font-bold tabular-nums ${accent ?? 'text-slate-900'}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Info className="w-4 h-4 text-brand-500" aria-hidden="true" />
                {label}
              </h3>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="px-5 py-4 text-sm text-slate-600 leading-relaxed">
              {info}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
