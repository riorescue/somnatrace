// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

import type { ImportStatus } from '@/types'

const map: Record<ImportStatus, string> = {
  pending:        'badge-pending',
  running:        'badge-running',
  pending_review: 'badge-warning',
  complete:       'badge-success',
  failed:         'badge-error',
  cancelled:      'badge-neutral',
}

const labels: Record<ImportStatus, string> = {
  pending:        'Pending',
  running:        'Running',
  pending_review: 'Review Needed',
  complete:       'Complete',
  failed:         'Failed',
  cancelled:      'Cancelled',
}

export function ImportStatusBadge({ status }: { status: ImportStatus }) {
  return <span className={map[status]}>{labels[status]}</span>
}
