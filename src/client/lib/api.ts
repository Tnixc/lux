import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { queryClient } from './query-client'

export class ApiError extends Error {
  status: number
  statusMessage: string

  constructor(status: number, statusMessage: string) {
    super(`${status}: ${statusMessage}`)
    this.name = 'ApiError'
    this.status = status
    this.statusMessage = statusMessage
  }
}

async function readErrorMessage(res: Response): Promise<string> {
  let statusMessage = res.statusText
  try {
    const payload = (await res.json()) as {
      statusMessage?: string
      message?: string
    }
    statusMessage = payload.statusMessage || payload.message || statusMessage
  } catch {
    // ignore non-JSON error payloads
  }
  return statusMessage || 'request_failed'
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res))
  }
  return res.json() as Promise<T>
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' })
  return handleResponse<T>(res)
}

export async function apiGetText(url: string): Promise<string> {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res))
  }
  return res.text()
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  return handleResponse<T>(res)
}

export async function apiDelete<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: 'DELETE',
    credentials: 'include'
  })
  return handleResponse<T>(res)
}

export const queryKeys = {
  auth: ['auth', 'me'] as const,
  directories: ['directories'] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  projectGitStatus: (id: string) => ['projects', id, 'git-status'] as const,
  projectGitDiff: (id: string, scope: string) => ['projects', id, 'git-diff', scope] as const,
  projectGitBranches: (id: string) => ['projects', id, 'git-branches'] as const,
  projectGitLog: (id: string) => ['projects', id, 'git-log'] as const,
  session: (id: string) => ['sessions', id] as const,
  settings: ['settings'] as const
}

interface User {
  id: number
  login: string
  name: string
  avatarUrl: string
}

export interface DirectoryEntry {
  name: string
  path: string
  isGitRepo: boolean
  isProject: boolean
  projectId: string | null
}

export interface Session {
  id: string
  name: string
  agentCli: string
  desiredStatus: string
  observedStatus: string
  createdAt: number | string
}

export interface Project {
  id: string
  name: string
  path: string
  icon?: string | null
  createdBy: string | null
  createdAt: number | string
  updatedAt: number | string
  sessions?: Session[]
}

interface SessionDetail {
  id: string
  projectId: string
  name: string
  tmuxSession: string
  agentCli: string
  desiredStatus: string
  observedStatus: string
  primaryPaneId: string
  lastError: string | null
  lastSeenAt: string | null
  startedAt: string | null
  stoppedAt: string | null
  activeWsClients: number
  createdAt: string
}

interface ProjectDetail {
  id: string
  name: string
  path: string
  icon: string | null
  isGitRepo: boolean
  sessions: Session[]
  git: {
    branch: string | null
    dirty: boolean
    counts: { staged: number; unstaged: number; untracked: number }
  } | null
}

interface GitStatus {
  snapshotId: string
  head: { ref: string | null; sha: string | null }
  counts: {
    staged: number
    unstaged: number
    untracked: number
    conflicted: number
  }
  dirty: boolean
}

interface DiffFile {
  filename: string
  previous_filename: string | null
  status: string
  sha: string
  additions: number
  deletions: number
  changes: number
  patch: string
}

interface GitDiff {
  snapshotId: string
  scope: string
  base: string
  files: DiffFile[]
}

interface GitBranchEntry {
  name: string
  sha: string
  current: boolean
}

interface GitBranchesResponse {
  current: string
  branches: GitBranchEntry[]
}

interface GitCommitLogEntry {
  sha: string
  shortSha: string
  authorName: string
  authorEmail: string
  authoredAt: string
  subject: string
  refs: string
}

interface GitCommitLogResponse {
  entries: GitCommitLogEntry[]
}

interface Settings {
  defaultAgentCli: string
  homeDir: string
}

export function useAuthMe() {
  return useQuery({
    queryKey: queryKeys.auth,
    queryFn: () => apiGet<{ user: User }>('/api/auth/me'),
    retry: false
  })
}

export function useDirectories() {
  return useQuery({
    queryKey: queryKeys.directories,
    queryFn: () => apiGet<{ root: string; entries: DirectoryEntry[] }>('/api/directories')
  })
}

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => apiGet<{ projects: Project[] }>('/api/projects')
  })
}

export function useProject(id: string) {
  return useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () => apiGet<ProjectDetail>(`/api/projects/${id}`)
  })
}

export function useProjectGitStatus(projectId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.projectGitStatus(projectId),
    queryFn: () => apiGet<GitStatus>(`/api/projects/${projectId}/git/status`),
    refetchInterval: 5000,
    ...options
  })
}

export function useProjectGitDiff(
  projectId: string,
  scope: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.projectGitDiff(projectId, scope),
    queryFn: () => apiGet<GitDiff>(`/api/projects/${projectId}/git/diff?scope=${scope}&base=HEAD`),
    ...options
  })
}

export function useProjectGitBranches(projectId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.projectGitBranches(projectId),
    queryFn: () => apiGet<GitBranchesResponse>(`/api/projects/${projectId}/git/branches`),
    ...options
  })
}

export function useProjectGitLog(
  projectId: string,
  options?: { enabled?: boolean; limit?: number }
) {
  const limit = options?.limit ?? 20
  return useQuery({
    queryKey: [...queryKeys.projectGitLog(projectId), limit],
    queryFn: () =>
      apiGet<GitCommitLogResponse>(`/api/projects/${projectId}/git/log?limit=${limit}`),
    enabled: options?.enabled
  })
}

export async function getProjectGitFileContent(projectId: string, ref: string, filePath: string) {
  const params = new URLSearchParams({ ref, path: filePath })
  return apiGetText(`/api/projects/${projectId}/git/file-content?${params.toString()}`)
}

export function useSession(id: string) {
  return useQuery({
    queryKey: queryKeys.session(id),
    queryFn: () => apiGet<SessionDetail>(`/api/sessions/${id}`)
  })
}

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => apiGet<Settings>('/api/settings')
  })
}

function invalidateProjectGitQueries(qc: QueryClient, projectId: string) {
  qc.invalidateQueries({ queryKey: queryKeys.project(projectId) })
  qc.invalidateQueries({ queryKey: queryKeys.projectGitStatus(projectId) })
  qc.invalidateQueries({ queryKey: ['projects', projectId, 'git-diff'] })
  qc.invalidateQueries({ queryKey: queryKeys.projectGitBranches(projectId) })
  qc.invalidateQueries({ queryKey: queryKeys.projectGitLog(projectId) })
}

export function useStageGitPaths(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { paths?: string[] }) =>
      apiPost<{ ok: true }>(`/api/projects/${projectId}/git/stage`, body),
    onSuccess: () => {
      invalidateProjectGitQueries(qc, projectId)
    }
  })
}

export function useUnstageGitPaths(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { paths?: string[] }) =>
      apiPost<{ ok: true }>(`/api/projects/${projectId}/git/unstage`, body),
    onSuccess: () => {
      invalidateProjectGitQueries(qc, projectId)
    }
  })
}

export function useCommitGit(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { message: string }) =>
      apiPost<{ ok: true; output: string }>(`/api/projects/${projectId}/git/commit`, body),
    onSuccess: () => {
      invalidateProjectGitQueries(qc, projectId)
    }
  })
}

export function usePushGit(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost<{ ok: true; output: string }>(`/api/projects/${projectId}/git/push`),
    onSuccess: () => {
      invalidateProjectGitQueries(qc, projectId)
    }
  })
}

export function useCreateGitBranch(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; from?: string; checkout?: boolean }) =>
      apiPost<{ ok: true; branch: string; checkedOut: boolean; output: string }>(
        `/api/projects/${projectId}/git/branches`,
        body
      ),
    onSuccess: () => {
      invalidateProjectGitQueries(qc, projectId)
    }
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { path: string; name?: string; icon?: string | null }) =>
      apiPost<{ id: string; name: string; path: string; icon: string | null }>(
        '/api/projects',
        body
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.directories })
      qc.invalidateQueries({ queryKey: queryKeys.projects })
    }
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.directories })
      qc.invalidateQueries({ queryKey: queryKeys.projects })
    }
  })
}

export function useUpdateProjectIcon(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { icon?: string | null }) =>
      apiPost<{ ok: true; icon: string | null }>(`/api/projects/${projectId}/icon`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.project(projectId) })
      qc.invalidateQueries({ queryKey: queryKeys.projects })
    }
  })
}

export function useCreateSession(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; agentCli?: string }) =>
      apiPost<{ id: string; name: string; tmuxSession: string; agentCli: string }>(
        `/api/projects/${projectId}/sessions`,
        body
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.project(projectId) })
      qc.invalidateQueries({ queryKey: queryKeys.projects })
    }
  })
}

export function useDeleteSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/sessions/${id}`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.session(id) })
      qc.invalidateQueries({ queryKey: queryKeys.projects })
    }
  })
}

export function useStopSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiPost<{ ok: true }>(`/api/sessions/${id}/stop`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.session(id) })
      qc.invalidateQueries({ queryKey: queryKeys.projects })
    }
  })
}

export function useRestartSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiPost<{ ok: true }>(`/api/sessions/${id}/restart`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.session(id) })
      qc.invalidateQueries({ queryKey: queryKeys.projects })
    }
  })
}

export function useLogout() {
  return useMutation({
    mutationFn: () => apiPost<{ ok: true }>('/api/auth/logout'),
    onSuccess: () => {
      queryClient.clear()
    }
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<Settings>) => apiPost<{ ok: true }>('/api/settings', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings })
    }
  })
}
