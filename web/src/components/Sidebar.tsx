import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Upload,
  Moon,
  Settings,
  Activity,
  Wrench,
  TrendingUp,
  Stethoscope,
  FileText,
  Info,
} from 'lucide-react'

const nav = [
  { to: '/',          label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/insights',  label: 'Insights',  icon: TrendingUp },
  { to: '/sessions',  label: 'Sessions',  icon: Moon },
  { to: '/rules',     label: 'Rules',     icon: Stethoscope },
  { to: '/reports',   label: 'Reports',   icon: FileText },
  { to: '/imports',   label: 'Imports',   icon: Upload },
  { to: '/utilities', label: 'Utilities', icon: Wrench },
  { to: '/settings',  label: 'Settings',  icon: Settings },
  { to: '/about',     label: 'About',     icon: Info },
]

export function Sidebar() {
  return (
    <aside aria-label="Application navigation" className="fixed inset-y-0 left-0 flex flex-col w-60 bg-slate-900 text-slate-100">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-800">
        <Activity className="w-5 h-5 text-brand-400" aria-hidden="true" />
        <span className="font-semibold tracking-tight text-white">SomnaTrace</span>
        <span className="ml-auto text-xs text-slate-500" aria-hidden="true">v0.1</span>
      </div>

      {/* Navigation */}
      <nav aria-label="Main" className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-800 text-xs text-slate-500">
        Local-first · Open source
      </div>
    </aside>
  )
}
