// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

export type DeviceFamily = 'resmed' | 'unknown'

export interface Device {
  id: string
  family: DeviceFamily
  manufacturer: string
  model: string
  serial_number: string
  first_seen: string
  last_seen: string
  created_at: string
}

export type ImportStatus = 'pending' | 'running' | 'pending_review' | 'complete' | 'failed'

export interface Import {
  id: string
  device_id: string
  source_path: string
  source_name: string
  status: ImportStatus
  session_count: number
  error_message?: string
  parser_version: string
  started_at: string
  completed_at?: string
  created_at: string
}

export interface Session {
  id: string
  device_id: string
  import_id: string
  start_time: string
  end_time: string
  duration_minutes: number
  ahi: number
  leak_rate_median: number
  pressure_p50: number
  pressure_p95: number
  pressure_max: number
  event_count: number
  created_at: string
}

export type EventType =
  | 'obstructive_apnea'
  | 'central_apnea'
  | 'hypopnea'
  | 'spo2_desaturation'
  | 'large_leak'

export interface Event {
  id: string
  session_id: string
  device_id: string
  type: EventType
  start_time: string
  duration_seconds: number
  created_at: string
}

export interface DailySummary {
  id: string
  device_id: string
  session_id: string
  date: string
  usage_minutes: number
  ahi: number
  ai_index: number
  hi_index: number
  leak_rate_median: number
  leak_rate_p95: number
  pressure_p50: number
  pressure_p95: number
  pressure_max: number
  parser_version: string
  created_at: string
}

export interface DbStats {
  counts: {
    devices: number
    imports: number
    sessions: number
    daily_summaries: number
    events: number
    session_signals: number
  }
  size_bytes: number
}

export interface DetectedCard {
  path: string
}

export interface SessionCandidate {
  id: string
  start_time: string
  end_time: string
  duration_minutes: number
  ahi: number
  event_count: number
  leak_rate: number
  pressure_p50: number
  already_imported: boolean
}

export interface SignalPoint {
  t: number // seconds from session start
  v: number // physical value
}

export interface SessionSignals {
  session_id: string
  pressure: SignalPoint[]  // cmH2O
  leak: SignalPoint[]      // L/min
  resp_rate: SignalPoint[] // breaths/min
  flow_lim: SignalPoint[]  // 0-1
  flow: SignalPoint[]      // L/s, downsampled to 1Hz
}

export type FindingSeverity = 'info' | 'warning' | 'alert' | 'critical'

export interface Finding {
  id: string
  session_id: string
  rule_id: string
  title: string
  detail: string
  severity: FindingSeverity
  start_sec?: number
  end_sec?: number
}

export interface HealthStatus {
  status: string
  version: string
  mode: string
  uptime: string
  go_version: string
  timestamp: string
  db_path: string
}

export interface InsightsData {
  period_days: number
  summaries: DailySummary[]
  event_counts: Record<string, number>
  current_streak: number
  longest_streak: number
}

export interface RuleStatus {
  id: string
  title: string
  description: string
  category: string
  severity: FindingSeverity
  enabled: boolean
}

export interface AppSettings {
  compliance_hours_threshold: number
  compliance_pct_threshold: number
  leak_warn_p95: number
  leak_alert_p95: number
  // null when no sessions have been imported yet
  first_session_date: string | null
}

export interface Backup {
  id: string
  created_at: string
  size_bytes: number
}
