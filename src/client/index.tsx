import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/query-client'
import { AuthProvider, RequireAuth } from './contexts/auth'
import { TabProvider } from './contexts/tabs'
import { AppShell } from './components/sidebar-shell'
import { Home } from './components/home'
import { ProjectPage } from './components/project-page'
import { SessionPage } from './components/session-page'
import './index.css'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <RequireAuth>
            <TabProvider>
              <Routes>
                <Route element={<AppShell />}>
                  <Route path='/' element={<Home />} />
                  <Route path='/projects/:projectId' element={<Navigate to='sessions' replace />} />
                  <Route
                    path='/projects/:projectId/sessions'
                    element={<ProjectPage view='sessions' />}
                  />
                  <Route path='/projects/:projectId/git' element={<ProjectPage view='git' />} />
                  <Route
                    path='/projects/:projectId/sessions/:sessionId'
                    element={<SessionPage />}
                  />
                </Route>
              </Routes>
            </TabProvider>
          </RequireAuth>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
