import { Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { Insights } from '@/features/insights/Insights'
import { ImportsList } from '@/features/imports/ImportsList'
import { SessionsList } from '@/features/sessions/SessionsList'
import { SessionDetail } from '@/features/sessions/SessionDetail'
import { Settings } from '@/features/settings/Settings'
import { Utilities } from '@/features/utilities/Utilities'
import { Rules } from '@/features/rules/Rules'
import { Reports } from '@/features/reports/Reports'
import { About } from '@/features/about/About'

export function App() {
  return (
    <div id="app-layout" className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 ml-60 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Routes>
            <Route path="/"                element={<Dashboard />} />
            <Route path="/insights"        element={<Insights />} />
            <Route path="/sessions"        element={<SessionsList />} />
            <Route path="/sessions/:id"    element={<SessionDetail />} />
            <Route path="/rules"           element={<Rules />} />
            <Route path="/reports"         element={<Navigate to="/reports/compliance" replace />} />
            <Route path="/reports/:report" element={<Reports />} />
            <Route path="/imports"         element={<ImportsList />} />
            <Route path="/utilities"       element={<Utilities />} />
            <Route path="/settings"        element={<Settings />} />
            <Route path="/about"           element={<About />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
