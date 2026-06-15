// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} ${formatTime(iso)}`
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${h}h ${m}m`
}

export function formatAHI(ahi: number): string {
  return ahi.toFixed(1)
}

export function ahiLabel(ahi: number): { label: string; color: string } {
  if (ahi < 5)  return { label: 'Normal',   color: 'text-emerald-600' }
  if (ahi < 15) return { label: 'Mild',     color: 'text-amber-600' }
  if (ahi < 30) return { label: 'Moderate', color: 'text-orange-600' }
  return             { label: 'Severe',   color: 'text-red-600' }
}
