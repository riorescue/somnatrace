// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

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
import { Compare } from '@/features/compare/Compare'

export function App() {
  return (
    <div id="app-layout" className="flex h-screen overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4
                   focus:px-4 focus:py-2 focus:bg-white focus:text-slate-900 focus:rounded-lg
                   focus:shadow-lg text-sm font-medium"
      >
        Skip to main content
      </a>
      <Sidebar />
      <main id="main-content" className="flex-1 ml-60 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Routes>
            <Route path="/"                element={<Dashboard />} />
            <Route path="/insights"        element={<Insights />} />
            <Route path="/sessions"        element={<SessionsList />} />
            <Route path="/sessions/:id"    element={<SessionDetail />} />
            <Route path="/compare"         element={<Compare />} />
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
