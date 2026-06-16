// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

import { useParams, Link } from 'react-router-dom'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, Moon, Activity, Gauge, Wind, TrendingUp,
  Info, X, Maximize2, SlidersHorizontal, Cpu, Printer,
  Volume2, Square, Loader2, ZoomOut, MousePointer2,
} from 'lucide-react'
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea,
  ResponsiveContainer,
} from 'recharts'
import { api } from '@/lib/api'
import { formatDate, formatTime, formatDuration, formatAHI, ahiLabel } from '@/lib/format'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { FullPageSpinner } from '@/components/LoadingSpinner'
import { ErrorBanner } from '@/components/ErrorBanner'
import { FindingsCard } from './FindingsCard'
import { EventsCard } from './EventsCard'
import type { Event, Finding, SignalPoint } from '@/types'

// ─── Helpers ────────────────────────────────────────────────────────────────

// Returns tick and tooltip formatters anchored to a real start timestamp.
function makeTimeFmts(startTimeISO: string) {
  const startMs = new Date(startTimeISO).getTime()
  const tick = (offsetSec: number) =>
    new Date(startMs + offsetSec * 1000)
      .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const tooltip = (offsetSec: number) =>
    new Date(startMs + offsetSec * 1000)
      .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return { tick, tooltip }
}

function niceTicks(data: SignalPoint[]): number[] {
  if (data.length === 0) return []
  const startSec = data[0].t
  const endSec = data[data.length - 1].t
  const durationSec = endSec - startSec
  // Include minute-level steps for when zoomed into a short window
  const steps = [60, 120, 300, 600, 900, 1800, 3600, 7200]
  const step = steps.find(s => Math.ceil(durationSec / s) <= 8) ?? 7200
  const firstTick = Math.ceil(startSec / step) * step
  const ticks: number[] = []
  for (let t = firstTick; t <= endSec; t += step) ticks.push(t)
  return ticks
}

// ─── Signal chart ────────────────────────────────────────────────────────────

interface RefLine {
  y: number
  stroke: string
  dash?: string
  label?: string
}

interface SignalChartProps {
  data: SignalPoint[]
  color: string
  tooltipUnit: string
  startTime: string        // ISO UTC — used to label axes with real wall-clock time
  domain?: [number | 'auto', number | 'auto']
  refLines?: RefLine[]
  type?: 'line' | 'area'
  height?: number
  chartSyncId?: string
  onViewChange?: (range: { startSec: number; endSec: number } | null) => void
  playbackT?: number | null  // absolute session-time position of playback cursor
  zoomDomain?: [number, number] | null  // controlled from parent to keep all charts in sync
}

function SignalChart({
  data, color, tooltipUnit, startTime, domain, refLines,
  type = 'line', height = 160, chartSyncId = 'session',
  onViewChange, playbackT, zoomDomain = null,
}: SignalChartProps) {
  const [selectStart, setSelectStart] = useState<number | null>(null)
  const [selectEnd, setSelectEnd] = useState<number | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)

  // Filter data to the zoomed window so XAxis domain auto-scales correctly
  const visibleData = zoomDomain
    ? data.filter(p => p.t >= zoomDomain[0] && p.t <= zoomDomain[1])
    : data

  const { tick: fmtTick, tooltip: fmtTooltip } = makeTimeFmts(startTime)
  const tickVals = niceTicks(visibleData)

  const commitZoom = useCallback(() => {
    setIsSelecting(false)
    if (selectStart === null || selectEnd === null) { setSelectStart(null); setSelectEnd(null); return }
    const l = Math.min(selectStart, selectEnd)
    const r = Math.max(selectStart, selectEnd)
    setSelectStart(null); setSelectEnd(null)
    if (r - l < 30) return  // too small — treat as a click, not a drag
    onViewChange?.({ startSec: l, endSec: r })
  }, [selectStart, selectEnd, onViewChange])

  const resetZoom = useCallback(() => {
    onViewChange?.(null)
  }, [onViewChange])

  const handleMouseDown = (e: { activeLabel?: string | number }) => {
    if (e?.activeLabel != null) {
      const v = Number(e.activeLabel)
      setSelectStart(v); setSelectEnd(v); setIsSelecting(true)
    }
  }
  const handleMouseMove = (e: { activeLabel?: string | number }) => {
    if (isSelecting && e?.activeLabel != null) setSelectEnd(Number(e.activeLabel))
  }
  const handleMouseLeave = () => {
    if (isSelecting) { setIsSelecting(false); setSelectStart(null); setSelectEnd(null) }
  }

  const xAxis = (
    <XAxis
      dataKey="t"
      type="number"
      domain={['dataMin', 'dataMax']}
      tick={{ fontSize: 9 }}
      stroke="#94a3b8"
      ticks={tickVals}
      tickFormatter={fmtTick}
      interval={0}
    />
  )
  const yAxis = <YAxis tick={{ fontSize: 9 }} stroke="#94a3b8" domain={domain} width={28} />
  const grid = <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
  const tip = (
    <Tooltip
      contentStyle={{ fontSize: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}
      formatter={(v: number) => [`${v.toFixed(2)} ${tooltipUnit}`, '']}
      labelFormatter={(t: number) => fmtTooltip(t)}
      animationDuration={0}
    />
  )
  const refs = refLines?.map((rl, i) => (
    <ReferenceLine key={i} y={rl.y} stroke={rl.stroke}
      strokeDasharray={rl.dash ?? '4 4'} strokeWidth={1} />
  )) ?? []

  const selectionArea = isSelecting && selectStart !== null && selectEnd !== null ? (
    <ReferenceArea
      x1={Math.min(selectStart, selectEnd)}
      x2={Math.max(selectStart, selectEnd)}
      fill="#3b82f6" fillOpacity={0.1}
      stroke="#3b82f6" strokeOpacity={0.4}
    />
  ) : null

  const margin = { top: 4, right: 8, bottom: 0, left: 0 }
  const chartEvents = {
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: commitZoom,
    onMouseLeave: handleMouseLeave,
  }

  const resetBtn = zoomDomain ? (
    <div className="flex justify-end mb-1 pr-1">
      <button
        onClick={resetZoom}
        className="no-print flex items-center gap-1 text-xs text-slate-400 hover:text-brand-500 transition-colors"
      >
        <ZoomOut className="w-3 h-3" aria-hidden="true" />
        Reset zoom
      </button>
    </div>
  ) : null

  const playbackLine = playbackT != null
    ? <ReferenceLine x={playbackT} stroke="#f97316" strokeWidth={1.5} ifOverflow="visible" />
    : null

  if (type === 'area') {
    const gradId = `grad-${color.replace('#', '')}`
    return (
      <div style={{ userSelect: 'none', cursor: 'crosshair' }}>
        {resetBtn}
        <ResponsiveContainer aria-hidden="true" width="100%" height={height}>
          <AreaChart data={visibleData} margin={margin} syncId={chartSyncId} syncMethod="value" {...chartEvents}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {grid}{xAxis}{yAxis}{tip}{refs}
            <Area type="monotone" dataKey="v" stroke={color}
              fill={`url(#${gradId})`} dot={false} isAnimationActive={false} strokeWidth={1.5} />
            {selectionArea}
            {playbackLine}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    )
  }

  return (
    <div style={{ userSelect: 'none', cursor: 'crosshair' }}>
      {resetBtn}
      <ResponsiveContainer aria-hidden="true" width="100%" height={height}>
        <LineChart data={visibleData} margin={margin} syncId={chartSyncId} syncMethod="value" {...chartEvents}>
          {grid}{xAxis}{yAxis}{tip}{refs}
          <Line type="monotone" dataKey="v" stroke={color}
            dot={false} isAnimationActive={false} strokeWidth={1.5} />
          {selectionArea}
          {playbackLine}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Chart info ───────────────────────────────────────────────────────────────

interface ChartInfo {
  summary: string
  range?: string
  clinical: string
}

const CHART_INFO = {
  pressure: {
    summary:
      'Air pressure delivered at the mask interface, sampled every 2 seconds. ' +
      'AutoSet devices continuously adjust pressure within your prescribed min/max range to maintain airway patency.',
    range:
      'Therapeutic range: 4–20 cmH₂O. Most patients stabilize between 6–14 cmH₂O. ' +
      'AASM guidelines target a 95th-percentile pressure ≤10 cmH₂O for APAP therapy.',
    clinical:
      'Sustained high pressure (>15 cmH₂O) may indicate positional obstruction or inadequate limits. ' +
      'EPR (Expiratory Pressure Relief) reduces pressure during exhalation, visible as a slight drop on each breath.',
  },
  flow: {
    summary:
      'Airflow rate in liters per second, recorded at 25 Hz and displayed here at 1 Hz. ' +
      'Positive values represent inhalation; negative values represent exhalation.',
    range:
      'Normal peak inspiratory flow: 0.3–0.8 L/s. Peak expiratory flow: −0.3 to −0.6 L/s.',
    clinical:
      'A flattened inspiratory peak indicates flow limitation — partial obstruction that may precede an apnea or hypopnea. ' +
      'Absent cycles indicate apnea. Snoring creates high-frequency oscillations on the signal.',
  },
  resp_rate: {
    summary: 'Breathing rate in breaths per minute, derived from detected breath cycles every 2 seconds.',
    range: 'Normal adult sleeping rate: 12–20 breaths/min. Values below 8 or above 25 br/min may warrant review.',
    clinical:
      'Drops to 0 during apnea. Hypopneas appear as transient reductions. ' +
      'Periodic breathing (Cheyne-Stokes) shows a crescendo-decrescendo cycling pattern.',
  },
  leak: {
    summary:
      'Total mask exit flow in L/min, every 2 seconds. Includes intentional vent flow and unintentional seal leakage.',
    range:
      'Intentional vent flow is typically 20–30 L/min. ResMed defines Large Leak as unintentional leak >24 L/min.',
    clinical:
      'Persistent high leak reduces therapy efficacy. Sudden spikes indicate mask dislodgement or mouth opening.',
  },
} satisfies Record<string, ChartInfo>

// ─── Breathing audio player ───────────────────────────────────────────────────

function FlowAudioPlayer({
  flowData,
  onPlaybackTime,
}: {
  flowData: SignalPoint[]
  onPlaybackTime: (t: number | null) => void
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle')
  const srcRef = useRef<AudioBufferSourceNode | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number>(0)
  const playStartRef = useRef<{ ctxStart: number; dataStart: number } | null>(null)

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    try { srcRef.current?.stop() } catch { /* already stopped */ }
    ctxRef.current?.close()
  }, [])

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    try { srcRef.current?.stop() } catch { /* already stopped */ }
    srcRef.current = null
    ctxRef.current?.close()
    ctxRef.current = null
    playStartRef.current = null
    onPlaybackTime(null)
    setState('idle')
  }, [onPlaybackTime])

  const play = useCallback(async () => {
    setState('loading')
    try {
      const SR = 11025
      const MAX_SEC = 300
      const startT = flowData[0]?.t ?? 0
      const playData = flowData.filter(p => (p.t - startT) <= MAX_SEC)
      const audioDuration = (playData.at(-1)?.t ?? startT) - startT
      if (audioDuration <= 0) { setState('idle'); return }

      const frameCount = Math.ceil(audioDuration * SR)
      const offCtx = new OfflineAudioContext(1, frameCount, SR)

      // White noise source — flat spectrum filtered per phase gives breath quality
      const noiseBuf = offCtx.createBuffer(1, frameCount, SR)
      const nd = noiseBuf.getChannelData(0)
      for (let i = 0; i < frameCount; i++) nd[i] = Math.random() * 2 - 1

      const noise = offCtx.createBufferSource()
      noise.buffer = noiseBuf

      // Inhale chain: HP 200 Hz → LP 1600 Hz = bright airy "shhh" (turbulent inspiratory flow)
      const ihHP = offCtx.createBiquadFilter()
      ihHP.type = 'highpass'; ihHP.frequency.value = 200; ihHP.Q.value = 0.7
      const ihLP = offCtx.createBiquadFilter()
      ihLP.type = 'lowpass'; ihLP.frequency.value = 1600; ihLP.Q.value = 0.9
      const ihGain = offCtx.createGain()
      ihGain.gain.setValueAtTime(0, 0)

      // Exhale chain: HP 60 Hz → LP 180 Hz = deep muffled "huuh" (passive expiratory flow)
      const exHP = offCtx.createBiquadFilter()
      exHP.type = 'highpass'; exHP.frequency.value = 60; exHP.Q.value = 0.5
      const exLP = offCtx.createBiquadFilter()
      exLP.type = 'lowpass'; exLP.frequency.value = 180; exLP.Q.value = 0.5
      const exGain = offCtx.createGain()
      exGain.gain.setValueAtTime(0, 0)

      noise.connect(ihHP); ihHP.connect(ihLP); ihLP.connect(ihGain); ihGain.connect(offCtx.destination)
      noise.connect(exHP); exHP.connect(exLP); exLP.connect(exGain); exGain.connect(offCtx.destination)

      // Interpolate signed flow at local audio time `at`.
      // Positive = inhalation, negative = exhalation — matches the chart axis.
      const getFlow = (at: number): number => {
        const t = at + startT
        let lo = 0, hi = playData.length - 1
        while (lo < hi - 1) {
          const mid = (lo + hi) >> 1
          if (playData[mid].t <= t) lo = mid; else hi = mid
        }
        const p0 = playData[lo], p1 = playData[hi]
        if (p0.t === p1.t) return p0.v
        const frac = Math.max(0, Math.min(1, (t - p0.t) / (p1.t - p0.t)))
        return p0.v + (p1.v - p0.v) * frac
      }

      // Drive gain directly from the signed flow value at 10 ms resolution.
      // Positive flow → inhale chain (bright "shhh"); negative → exhale chain
      // (muffled "huuh"). Near-zero flow (apnea / pause) silences both chains.
      // This locks the audio phase exactly to the chart waveform.
      const TICK = 0.01
      for (let at = 0; at <= audioDuration; at += TICK) {
        const flow = getFlow(at)
        if (flow > 0.02) {
          ihGain.gain.linearRampToValueAtTime(Math.min(flow * 2.8, 0.9), at)
          exGain.gain.linearRampToValueAtTime(0, at)
        } else if (flow < -0.02) {
          ihGain.gain.linearRampToValueAtTime(0, at)
          exGain.gain.linearRampToValueAtTime(Math.min(-flow * 2.0, 0.7), at)
        } else {
          ihGain.gain.linearRampToValueAtTime(0, at)
          exGain.gain.linearRampToValueAtTime(0, at)
        }
      }

      noise.start(0)

      const rendered = await offCtx.startRendering()
      const ctx = new AudioContext()
      ctxRef.current = ctx
      const src = ctx.createBufferSource()
      srcRef.current = src
      src.buffer = rendered
      src.connect(ctx.destination)
      src.onended = () => {
        cancelAnimationFrame(rafRef.current)
        onPlaybackTime(null)
        setState('idle')
      }
      // Capture ctxStart before src.start() so elapsed is measured from the true
      // scheduled start time, not from slightly-later JS execution.
      // Subtract outputLatency so the cursor position matches what's actually heard
      // rather than what's been generated into the hardware buffer.
      const ctxStart = ctx.currentTime
      const outputLatency = ctx.outputLatency ?? ctx.baseLatency ?? 0
      src.start(ctxStart)

      playStartRef.current = { ctxStart, dataStart: startT }
      const tick = () => {
        if (!ctxRef.current || !playStartRef.current) return
        const elapsed = Math.max(
          0,
          ctxRef.current.currentTime - playStartRef.current.ctxStart - outputLatency,
        )
        onPlaybackTime(playStartRef.current.dataStart + elapsed)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)

      setState('playing')
    } catch {
      setState('idle')
    }
  }, [flowData, onPlaybackTime])

  const visibleDurationSec = Math.min(
    (flowData.at(-1)?.t ?? 0) - (flowData[0]?.t ?? 0),
    300,
  )
  const durationLabel = visibleDurationSec < 60
    ? `${Math.round(visibleDurationSec)}s`
    : `${Math.round(visibleDurationSec / 60)}m`

  return (
    <button
      onClick={state === 'playing' ? stop : play}
      disabled={state === 'loading' || flowData.length === 0}
      className="text-slate-300 hover:text-brand-500 transition-colors p-1 rounded disabled:opacity-50"
      title={
        state === 'playing'
          ? 'Stop breathing audio'
          : state === 'loading'
          ? 'Generating audio…'
          : `Play visible window as breathing audio (~${durationLabel})`
      }
      aria-label={
        state === 'playing'
          ? 'Stop breathing audio'
          : state === 'loading'
          ? 'Generating audio…'
          : `Play visible window as breathing audio (~${durationLabel})`
      }
    >
      {state === 'loading' ? (
        <Loader2 className="w-4 h-4 animate-spin text-brand-400" aria-hidden="true" />
      ) : state === 'playing' ? (
        <Square className="w-4 h-4 fill-current" aria-hidden="true" />
      ) : (
        <Volume2 className="w-4 h-4" aria-hidden="true" />
      )}
    </button>
  )
}

// ─── Flow waveform card (passes shared zoom through → audio sync) ────────────

function FlowWaveformCard({
  flowData,
  startTime,
  zoomDomain,
  onViewChange,
}: {
  flowData: SignalPoint[]
  startTime: string
  zoomDomain: [number, number] | null
  onViewChange: (range: { startSec: number; endSec: number } | null) => void
}) {
  const [playbackT, setPlaybackT] = useState<number | null>(null)

  const audioData = zoomDomain
    ? flowData.filter(p => p.t >= zoomDomain[0] && p.t <= zoomDomain[1])
    : flowData

  return (
    <ChartCard
      title="Flow Waveform" subtitle="L/s · 1 s (25 Hz downsampled)"
      icon={<Wind className="w-4 h-4" />}
      info={CHART_INFO.flow}
      extraActions={
        <FlowAudioPlayer
          flowData={audioData}
          onPlaybackTime={setPlaybackT}
        />
      }
      refLegend={[
        { y:  0.8, stroke: '#10b981', dash: '3 3', label: '0.8 L/s — normal peak inspiratory' },
        { y: -0.8, stroke: '#10b981', dash: '3 3', label: '-0.8 L/s — normal peak expiratory' },
      ]}
      render={(h) => (
        <SignalChart
          data={flowData}
          color="#06b6d4"
          startTime={startTime}
          tooltipUnit="L/s"
          type="area"
          height={h}
          chartSyncId="session"
          refLines={[
            { y:  0.8, stroke: '#10b981', dash: '3 3', label: '0.8 L/s' },
            { y: -0.8, stroke: '#10b981', dash: '3 3', label: '-0.8 L/s' },
          ]}
          zoomDomain={zoomDomain}
          onViewChange={onViewChange}
          playbackT={playbackT}
        />
      )}
    />
  )
}

// ─── Chart card with info + expand ───────────────────────────────────────────

interface ChartCardProps {
  title: string
  subtitle: string
  icon: React.ReactNode
  info: ChartInfo
  refLegend?: RefLine[]
  render: (height: number) => React.ReactNode
  extraActions?: React.ReactNode
}

function ChartCard({ title, subtitle, icon, info, refLegend, render, extraActions }: ChartCardProps) {
  const [mode, setMode] = useState<'none' | 'info' | 'expand'>('none')
  const close = useCallback(() => setMode('none'), [])

  useEffect(() => {
    if (mode === 'none') return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, close])

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          {icon}
          {title}
          <span className="text-xs font-normal text-slate-500">{subtitle}</span>
        </h2>
        <div className="no-print flex items-center gap-1">
          {extraActions}
          <button
            onClick={() => setMode('expand')}
            className="text-slate-300 hover:text-brand-500 transition-colors p-1 rounded"
            title="Expand chart"
            aria-label="Expand chart"
          >
            <Maximize2 className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            onClick={() => setMode('info')}
            className="text-slate-300 hover:text-brand-500 transition-colors p-1 rounded"
            title={`About ${title}`}
            aria-label={`About ${title}`}
          >
            <Info className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Reference line legend */}
      {refLegend && refLegend.some(rl => rl.label) && (
        <div className="flex items-center flex-wrap gap-x-5 gap-y-1 mb-2 px-1">
          {refLegend.filter(rl => rl.label).map((rl, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <svg width="16" height="10" className="shrink-0">
                <line x1="0" y1="5" x2="16" y2="5"
                  stroke={rl.stroke}
                  strokeDasharray={rl.dash ?? '4 4'}
                  strokeWidth="1.5" />
              </svg>
              <span className="text-xs font-mono font-medium" style={{ color: rl.stroke }}>
                {rl.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Normal-size chart */}
      {render(130)}

      {/* Modals */}
      {mode !== 'none' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={close}
        >
          {mode === 'expand' ? (
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <span className="text-brand-500">{icon}</span>
                  {title}
                  <span className="text-xs font-normal text-slate-500 ml-1">{subtitle}</span>
                </h3>
                <button onClick={close} aria-label="Close" className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              <div className="p-5">
                {refLegend && refLegend.some(rl => rl.label) && (
                  <div className="flex items-center flex-wrap gap-x-5 gap-y-1 mb-3 px-1">
                    {refLegend.filter(rl => rl.label).map((rl, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <svg width="16" height="10" className="shrink-0">
                          <line x1="0" y1="5" x2="16" y2="5"
                            stroke={rl.stroke}
                            strokeDasharray={rl.dash ?? '4 4'}
                            strokeWidth="1.5" />
                        </svg>
                        <span className="text-xs font-mono font-medium" style={{ color: rl.stroke }}>
                          {rl.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {render(360)}
              </div>
            </div>
          ) : (
            /* Info dialog */
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <span className="text-brand-500">{icon}</span>
                  {title}
                </h3>
                <button onClick={close} aria-label="Close" className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              <div className="px-5 py-4 space-y-3 text-sm text-slate-600">
                <p>{info.summary}</p>
                {info.range && (
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Normal range</p>
                    <p className="text-slate-700">{info.range}</p>
                  </div>
                )}
                <div className="bg-brand-50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide mb-1">Clinical context</p>
                  <p>{info.clinical}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Machine settings card ────────────────────────────────────────────────────

interface SettingGroup {
  title: string
  rows: { label: string; value: string }[]
}

function extractSettingGroups(payload: Record<string, unknown>): SettingGroup[] {
  // Navigate the nested CurrentSettings.json structure
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sp = (payload as any)?.FlowGenerator?.SettingProfiles
  if (!sp) return []

  const fp = sp.FeatureProfiles ?? {}
  const active: string = sp.ActiveProfiles?.TherapyProfile ?? 'AutoSetProfile'
  const tp = sp.TherapyProfiles?.[active] ?? {}
  const epr   = fp.EprFeature             ?? {}
  const ramp  = fp.AutoRampFeature         ?? {}
  const circ  = fp.CircuitFeature          ?? {}
  const clim  = fp.ClimateFeature          ?? {}
  const smart = fp.SmartStartStopFeature   ?? {}
  const tz    = fp.TimeZoneFeature         ?? {}
  const temp  = fp.TemperatureFeature      ?? {}

  const val = (v: unknown, suffix = '') =>
    v != null && v !== '' ? `${v}${suffix}` : '—'

  return [
    {
      title: 'Therapy',
      rows: [
        { label: 'Mode',           value: val(tp.TherapyMode) },
        { label: 'Min Pressure',   value: val(tp.MinPressure, ' cmH₂O') },
        { label: 'Max Pressure',   value: val(tp.MaxPressure, ' cmH₂O') },
        { label: 'Start Pressure', value: val(tp.StartPressure, ' cmH₂O') },
      ],
    },
    {
      title: 'EPR — Expiratory Pressure Relief',
      rows: [
        { label: 'EPR',   value: val(epr.EprEnable) },
        { label: 'Type',  value: val(epr.EprType) },
        { label: 'Level', value: val(epr.EprPressure) },
      ],
    },
    {
      title: 'Ramp',
      rows: [
        { label: 'Ramp',      value: val(ramp.RampEnable) },
        { label: 'Ramp Time', value: val(ramp.RampTime, ' min') },
      ],
    },
    {
      title: 'Mask & Circuit',
      rows: [
        { label: 'Mask Type',             value: val(circ.MaskType) },
        { label: 'Tube Type',             value: val(circ.TubeType) },
        { label: 'Anti-bacterial Filter', value: val(circ.AntiBacterialFilter) },
      ],
    },
    {
      title: 'Climate & Humidifier',
      rows: [
        { label: 'Climate Control', value: val(clim.ClimateControl) },
        { label: 'Humidifier',      value: val(clim.HumidifierSettingEnable) },
        { label: 'Humidity Level',  value: val(clim.HumidifierLevel) },
        { label: 'Heated Tube',     value: val(clim.HeatedTubeSettingEnable) },
        (() => {
          const useFahrenheit = temp.TemperatureUnit === 'Fahrenheit'
          const rawC = clim.HeatedTubeTemperature
          if (rawC == null || rawC === '') return { label: 'Tube Temp', value: '—' }
          if (useFahrenheit) {
            const f = (Number(rawC) * 9) / 5 + 32
            return { label: 'Tube Temp', value: `${f.toFixed(1)} °F` }
          }
          return { label: 'Tube Temp', value: `${rawC} °C` }
        })(),
      ],
    },
    {
      title: 'Smart Features',
      rows: [
        { label: 'Smart Start', value: val(smart.SmartStart) },
        { label: 'Smart Stop',  value: val(smart.SmartStop) },
      ],
    },
    {
      title: 'Device',
      rows: [
        { label: 'Timezone Offset',  value: val(tz.TimeZoneOffset) },
        { label: 'Temperature Unit', value: val(temp.TemperatureUnit) },
      ],
    },
  ]
}

function MachineSettingsCard({ settings }: { settings: Record<string, unknown> }) {
  const groups = extractSettingGroups(settings)
  if (groups.length === 0) return null

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
        <SlidersHorizontal className="w-4 h-4 text-brand-500" />
        Machine Settings
        <span className="text-xs font-normal text-slate-500 ml-1">as captured at import time</span>
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {groups.map(group => (
          <div key={group.title}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{group.title}</p>
            <dl className="space-y-1.5">
              {group.rows.map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="font-mono text-xs text-slate-800 bg-slate-50 px-2 py-0.5 rounded">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Device identification card ───────────────────────────────────────────────

function DeviceIdentificationCard({ payload }: { payload: Record<string, unknown> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profiles = (payload as any)?.FlowGenerator?.IdentificationProfiles ?? {}
  const prod = profiles.Product ?? {}
  const hw   = profiles.Hardware ?? {}
  const sw   = profiles.Software ?? {}

  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: 'Product',
      rows: [
        ['Name',         prod.ProductName                   ?? '—'],
        ['Product Code', prod.ProductCode                   ?? '—'],
        ['Serial No.',   prod.SerialNumber                  ?? '—'],
        ['Region',       prod.ProductGeographicIdentifier   ?? '—'],
        ['FDA UDI',      prod.FdaUniqueDeviceIdentifier || '—'],
      ],
    },
    {
      title: 'Software',
      rows: [
        ['Application',    sw.ApplicationIdentifier    ?? '—'],
        ['Configuration',  sw.ConfigurationIdentifier  ?? '—'],
        ['Bootloader',     sw.BootloaderIdentifier     ?? '—'],
        ['Data Model',     sw.DataModelVersionIdentifier ?? '—'],
      ],
    },
    {
      title: 'Hardware',
      rows: [
        ['Hardware ID', hw.HardwareIdentifier ?? '—'],
      ],
    },
  ]

  return (
    <div className="card p-5 mb-4">
      <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
        <Cpu className="w-4 h-4 text-brand-500" />
        Device Identification
        <span className="text-xs font-normal text-slate-500 ml-1">as captured at import time</span>
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-[repeat(3,minmax(max-content,1fr))] gap-6">
        {groups.map(g => (
          <div key={g.title}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{g.title}</p>
            <dl className="space-y-1.5">
              {g.rows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2 text-xs">
                  <dt className="text-slate-500 shrink-0">{label}</dt>
                  <dd className="text-slate-700 font-mono text-right break-all">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SessionDetail() {
  const { id } = useParams<{ id: string }>()
  const [sharedZoom, setSharedZoom] = useState<[number, number] | null>(null)
  const chartsRef = useRef<HTMLDivElement>(null)

  const handleZoom = useCallback(
    (range: { startSec: number; endSec: number } | null) =>
      setSharedZoom(range ? [range.startSec, range.endSec] : null),
    [],
  )

  const handleFindingClick = useCallback((finding: Finding) => {
    if (finding.start_sec == null) return
    const startSec = finding.start_sec
    const endSec = finding.end_sec ?? startSec
    const duration = endSec - startSec
    const windowSec = Math.min(300, Math.max(90, duration * 4))
    const center = startSec + duration / 2
    const zoomStart = Math.max(0, center - windowSec / 2)
    setSharedZoom([zoomStart, zoomStart + windowSec])
    chartsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleEventClick = useCallback((event: Event, sessionStart: string) => {
    const sessionStartMs = new Date(sessionStart).getTime()
    const eventStartSec = (new Date(event.start_time).getTime() - sessionStartMs) / 1000
    const eventCenterSec = eventStartSec + event.duration_seconds / 2

    // Show at least 90 s of context, scaled up for longer events, capped at 5 min.
    const windowSec = Math.min(300, Math.max(90, event.duration_seconds * 4))
    const half = windowSec / 2
    const startSec = Math.max(0, eventCenterSec - half)

    setSharedZoom([startSec, startSec + windowSec])
    chartsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const { data: sess, isLoading, isError } = useQuery({
    queryKey: ['session', id],
    queryFn: () => api.sessions.get(id!),
    enabled: !!id,
  })

  const { data: signals } = useQuery({
    queryKey: ['session-signals', id],
    queryFn: () => api.sessions.signals(id!),
    enabled: !!id,
    retry: false,
  })

  const { data: machineSettings } = useQuery({
    queryKey: ['session-settings', id],
    queryFn: () => api.sessions.settings(id!),
    enabled: !!id,
    retry: false,
  })

  const { data: deviceIdentification } = useQuery({
    queryKey: ['session-identification', id],
    queryFn: () => api.sessions.identification(id!),
    enabled: !!id,
    retry: false,
  })

  const { data: findingsData } = useQuery({
    queryKey: ['findings', id],
    queryFn: () => api.sessions.findings(id!),
    enabled: !!id,
    retry: false,
  })

  const { data: eventsData } = useQuery({
    queryKey: ['session-events', id],
    queryFn: () => api.sessions.events(id!),
    enabled: !!id,
    retry: false,
  })

  const { data: appSettings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: api.appSettings.get,
  })

  const warnP95 = appSettings?.leak_warn_p95 ?? 24

  if (isLoading) return <FullPageSpinner />
  if (isError) return <ErrorBanner message="Failed to load session." />
  if (!sess) return <ErrorBanner message="Session not found." />

  const { label, color } = ahiLabel(sess.ahi)

  const handlePrint = () => {
    const prev = document.title
    document.title = `SomnaTrace Session Report — ${formatDate(sess.start_time)}`
    window.print()
    document.title = prev
  }

  const printedOn = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div>
      {/* Print-only masthead */}
      <div className="hidden print:block mb-8 pb-5 border-b-2 border-slate-800">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">SomnaTrace</p>
            <h1 className="text-3xl font-bold text-slate-900">Session Report</h1>
            <p className="text-slate-600 mt-1">
              {formatDate(sess.start_time)} · {formatTime(sess.start_time)} → {formatTime(sess.end_time)}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500 space-y-0.5">
            <p className="font-medium text-slate-700">{printedOn}</p>
            <p>SomnaTrace v0.1 · Local-first CPAP analytics</p>
            <p>Not a substitute for professional medical advice</p>
          </div>
        </div>
      </div>

      <PageHeader
        title={`Session — ${formatDate(sess.start_time)}`}
        description={`${formatTime(sess.start_time)} → ${formatTime(sess.end_time)}`}
        action={
          <div className="no-print flex items-center gap-2">
            <Link to="/sessions" className="btn-ghost">
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              All Sessions
            </Link>
            <button onClick={handlePrint} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              <Printer className="w-4 h-4" aria-hidden="true" />
              Print Report
            </button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="AHI" value={formatAHI(sess.ahi)} sub={label} accent={color} />
        <StatCard
          label="Events/hr"
          value={sess.event_count > 0
            ? (sess.event_count / (sess.duration_minutes / 60)).toFixed(1)
            : '—'}
          sub={`${sess.event_count} total`}
        />
        <StatCard label="Duration" value={formatDuration(sess.duration_minutes)} sub="therapy time" />
        <StatCard
          label="Pressure P95"
          value={`${sess.pressure_p95.toFixed(1)} cmH₂O`}
          sub={`P50: ${sess.pressure_p50.toFixed(1)}`}
        />
        <StatCard label="Leak Rate" value={`${sess.leak_rate_median.toFixed(1)} L/min`} sub="median" />
      </div>

      {/* Charts */}
      <div ref={chartsRef} />
      {signals ? (
        <>
          <div className="no-print mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 select-none">
            <span className="flex items-center gap-1.5">
              <MousePointer2 className="w-3 h-3 shrink-0" />
              <span>Click and drag on any chart to zoom into a time window</span>
            </span>
            <span className="hidden sm:inline text-slate-200">·</span>
            <span className="flex items-center gap-1.5">
              <ZoomOut className="w-3 h-3 shrink-0" />
              <span>Use <span className="font-medium text-slate-500">Reset zoom</span> above a chart to restore the full session view</span>
            </span>
            <span className="hidden sm:inline text-slate-200">·</span>
            <span>All charts sync to the same time window</span>
          </div>
          {signals.pressure.length > 0 && (
            <div className="mb-4">
              <ChartCard
                title="Mask Pressure" subtitle="cmH₂O · 2 s"
                icon={<Gauge className="w-4 h-4" />}
                info={CHART_INFO.pressure}
                refLegend={[
                  { y: 10, stroke: '#f59e0b', dash: '4 4', label: '10 cmH₂O — AASM p95 target' },
                  { y: 15, stroke: '#ef4444', dash: '4 4', label: '15 cmH₂O — elevated' },
                ]}
                render={(h) => (
                  <SignalChart data={signals.pressure} color="#3b82f6"
                    startTime={sess.start_time}
                    tooltipUnit="cmH₂O" height={h}
                    refLines={[
                      { y: 10, stroke: '#f59e0b', dash: '4 4', label: '10 cmH₂O' },
                      { y: 15, stroke: '#ef4444', dash: '4 4', label: '15 cmH₂O' },
                    ]}
                    zoomDomain={sharedZoom}
                    onViewChange={handleZoom} />
                )}
              />
            </div>
          )}

          {signals.flow.length > 0 && (
            <div className="mb-4">
              <FlowWaveformCard
                flowData={signals.flow}
                startTime={sess.start_time}
                zoomDomain={sharedZoom}
                onViewChange={handleZoom}
              />
            </div>
          )}

          {(signals.resp_rate.length > 0 || signals.leak.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {signals.resp_rate.length > 0 && (
                <ChartCard
                  title="Respiratory Rate" subtitle="br/min · 2 s"
                  icon={<Activity className="w-4 h-4" />}
                  info={CHART_INFO.resp_rate}
                  refLegend={[
                    { y: 12, stroke: '#10b981', dash: '3 3', label: '12 br/min — lower normal' },
                    { y: 20, stroke: '#10b981', dash: '3 3', label: '20 br/min — upper normal' },
                  ]}
                  render={(h) => (
                    <SignalChart data={signals.resp_rate} color="#8b5cf6"
                      startTime={sess.start_time}
                      tooltipUnit="br/min" height={h}
                      refLines={[
                        { y: 12, stroke: '#10b981', dash: '3 3', label: '12 br/min' },
                        { y: 20, stroke: '#10b981', dash: '3 3', label: '20 br/min' },
                      ]}
                      zoomDomain={sharedZoom}
                      onViewChange={handleZoom} />
                  )}
                />
              )}
              {signals.leak.length > 0 && (
                <ChartCard
                  title="Leak Rate" subtitle="L/min · 2 s"
                  icon={<TrendingUp className="w-4 h-4" />}
                  info={{
                    ...CHART_INFO.leak,
                    range: `Intentional vent flow is typically 20–30 L/min. Large Leak is unintentional leak >${warnP95} L/min.`,
                  }}
                  refLegend={[
                    { y: warnP95, stroke: '#ef4444', dash: '4 4', label: `${warnP95} L/min — large leak threshold` },
                  ]}
                  render={(h) => (
                    <SignalChart data={signals.leak} color="#f59e0b"
                      startTime={sess.start_time}
                      tooltipUnit="L/min" height={h}
                      refLines={[
                        { y: warnP95, stroke: '#ef4444', dash: '4 4', label: `${warnP95} L/min` },
                      ]}
                      zoomDomain={sharedZoom}
                      onViewChange={handleZoom} />
                  )}
                />
              )}
            </div>
          )}
        </>
      ) : (
        <div className="card p-6 mb-4 text-center">
          <p className="text-slate-500 text-sm">
            No EDF signal data available for this session.
            Sessions imported from a real SD card show pressure, flow, and respiratory rate waveforms.
          </p>
        </div>
      )}

      {/* Events */}
      <EventsCard
        events={eventsData?.events ?? []}
        sessionStart={sess.start_time}
        sessionEnd={sess.end_time}
        onEventClick={(event) => handleEventClick(event, sess.start_time)}
      />

      {/* Clinical Findings */}
      <FindingsCard
        findings={findingsData?.findings ?? []}
        sessionStart={sess.start_time}
        sessionId={id!}
        analyzedAt={findingsData?.analyzed_at}
        onFindingClick={handleFindingClick}
      />

      {/* Metadata */}
      <div className="card p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Moon className="w-4 h-4 text-brand-500" />
          Session Metadata
        </h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          {([
            ['Session ID', sess.id],
            ['Start', `${formatDate(sess.start_time)} ${formatTime(sess.start_time)}`],
            ['Device ID', sess.device_id],
            ['End', `${formatDate(sess.end_time)} ${formatTime(sess.end_time)}`],
            ['Import ID', sess.import_id],
            ['Max Pressure', `${sess.pressure_max.toFixed(1)} cmH₂O`],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="text-slate-500 shrink-0 w-32">{k}</dt>
              <dd className="text-slate-800 font-mono text-xs break-all">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Device identification */}
      {deviceIdentification && <DeviceIdentificationCard payload={deviceIdentification} />}

      {/* Machine settings */}
      {machineSettings && <MachineSettingsCard settings={machineSettings} />}

      {/* Print-only disclaimer */}
      <div className="hidden print:block mt-8 pt-4 border-t border-slate-200 text-xs text-slate-400 text-center">
        This report is generated from data recorded by your CPAP/APAP device and is for informational purposes only.
        It does not constitute medical advice. Consult your healthcare provider regarding your therapy results.
      </div>
    </div>
  )
}
