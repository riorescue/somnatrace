import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { ComplianceReport } from './ComplianceReport'
import { EffectivenessReport } from './EffectivenessReport'
import { DeviceReport } from './DeviceReport'

const REPORTS = [
  { id: 'compliance',    label: 'Compliance & Usage',        component: ComplianceReport },
  { id: 'effectiveness', label: 'Therapy Effectiveness',     component: EffectivenessReport },
  { id: 'device',        label: 'Mask & Device Performance', component: DeviceReport },
]

export function Reports() {
  const { report } = useParams<{ report: string }>()
  const navigate = useNavigate()

  const current = REPORTS.find(r => r.id === report)
  if (!current) return <Navigate to="/reports/compliance" replace />

  const ReportComponent = current.component
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Clinical summaries designed for printing and sharing"
        action={
          <button
            onClick={() => window.print()}
            className="no-print flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            Print Report
          </button>
        }
      />

      {/* Screen-only tab bar */}
      <div className="no-print flex gap-1 bg-slate-100 rounded-xl p-1 mb-6">
        {REPORTS.map(r => (
          <button
            key={r.id}
            onClick={() => navigate(`/reports/${r.id}`)}
            className={`flex-1 py-2 px-4 text-sm font-medium rounded-lg transition-all ${
              r.id === report
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Print-only masthead */}
      <div className="hidden print:block mb-8 pb-5 border-b-2 border-slate-800">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">SomnaTrace</p>
            <h1 className="text-3xl font-bold text-slate-900">{current.label}</h1>
            <p className="text-sm text-slate-500 mt-1">Clinical Report</p>
          </div>
          <div className="text-right text-xs text-slate-500 space-y-0.5">
            <p className="font-medium text-slate-700">{today}</p>
            <p>SomnaTrace v0.1 · Local-first CPAP analytics</p>
            <p>Not a substitute for professional medical advice</p>
          </div>
        </div>
      </div>

      <ReportComponent />
    </div>
  )
}
