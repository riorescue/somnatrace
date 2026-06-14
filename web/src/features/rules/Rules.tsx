import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Stethoscope, Info } from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { FullPageSpinner } from '@/components/LoadingSpinner'
import type { FindingSeverity, RuleStatus } from '@/types'

const SEVERITY_BADGE: Record<FindingSeverity, string> = {
  info:     'bg-sky-50     text-sky-700     border-sky-200',
  warning:  'bg-amber-50   text-amber-700   border-amber-200',
  alert:    'bg-orange-50  text-orange-700  border-orange-200',
  critical: 'bg-red-50     text-red-700     border-red-200',
}

function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-40 ${
        enabled ? 'bg-brand-500' : 'bg-slate-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
          enabled ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function RuleRow({ rule, onToggle, pending }: { rule: RuleStatus; onToggle: (id: string, enabled: boolean) => void; pending: boolean }) {
  return (
    <div className={`flex items-center gap-4 px-4 py-3 transition-opacity ${rule.enabled ? '' : 'opacity-50'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs font-semibold text-slate-500 shrink-0">{rule.id}</span>
          <span className="text-sm font-medium text-slate-800">{rule.title}</span>
          <span className={`shrink-0 inline-flex items-center text-xs font-medium border px-1.5 py-0.5 rounded capitalize ${SEVERITY_BADGE[rule.severity]}`}>
            {rule.severity}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{rule.description}</p>
      </div>
      <Toggle enabled={rule.enabled} onChange={(v) => onToggle(rule.id, v)} disabled={pending} />
    </div>
  )
}

function RuleGroup({ category, rules, onToggle, pendingId }: {
  category: string
  rules: RuleStatus[]
  onToggle: (id: string, enabled: boolean) => void
  pendingId: string | null
}) {
  const allEnabled = rules.every(r => r.enabled)
  const anyEnabled = rules.some(r => r.enabled)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <h2 className="text-sm font-semibold text-slate-700">{category}</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {rules.filter(r => r.enabled).length} / {rules.length} enabled
          </span>
          <Toggle
            enabled={allEnabled || (!allEnabled && anyEnabled ? anyEnabled : false)}
            onChange={(v) => rules.forEach(r => onToggle(r.id, v))}
            disabled={pendingId !== null}
          />
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {rules.map(rule => (
          <RuleRow
            key={rule.id}
            rule={rule}
            onToggle={onToggle}
            pending={pendingId === rule.id}
          />
        ))}
      </div>
    </div>
  )
}

export function Rules() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['rules'],
    queryFn: api.rules.list,
  })

  const mutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.rules.setEnabled(id, enabled),
    onMutate: async ({ id, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ['rules'] })
      const prev = queryClient.getQueryData<{ rules: RuleStatus[] }>(['rules'])
      queryClient.setQueryData<{ rules: RuleStatus[] }>(['rules'], old =>
        old ? { rules: old.rules.map(r => r.id === id ? { ...r, enabled } : r) } : old
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['rules'], ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] })
    },
  })

  if (isLoading) return <FullPageSpinner />

  const rules = data?.rules ?? []

  // Group rules by category in the order they appear
  const groups: { category: string; rules: RuleStatus[] }[] = []
  for (const rule of rules) {
    const existing = groups.find(g => g.category === rule.category)
    if (existing) {
      existing.rules.push(rule)
    } else {
      groups.push({ category: rule.category, rules: [rule] })
    }
  }

  const handleToggle = (id: string, enabled: boolean) => {
    mutation.mutate({ id, enabled })
  }

  const pendingId = mutation.isPending ? (mutation.variables as { id: string }).id : null

  return (
    <div>
      <PageHeader
        title="Clinical Rules"
        description="Configure which analysis rules run when sessions are imported"
      />

      <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 max-w-2xl">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-500" />
        <span>
          Rule changes apply to future imports only. Use the re-analyze function on a session to apply updated rules to existing data.
        </span>
      </div>

      <div className="space-y-4 max-w-2xl">
        {groups.map(({ category, rules: groupRules }) => (
          <RuleGroup
            key={category}
            category={category}
            rules={groupRules}
            onToggle={handleToggle}
            pendingId={pendingId}
          />
        ))}
      </div>

      <p className="mt-6 text-xs text-slate-500 max-w-2xl">
        <Stethoscope className="w-3 h-3 inline mr-1 relative -top-px" />
        {rules.length} rules · {rules.filter(r => r.enabled).length} enabled
      </p>
    </div>
  )
}
