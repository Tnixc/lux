import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  GitBranch,
  Plus,
  Square,
  Play,
  Trash2,
  Terminal,
  Loader2,
  RefreshCw,
  AlertCircle,
  ArrowLeft,
  GitCommitHorizontal,
  Upload,
  CheckCircle2,
  Pencil,
  FilePlus,
  AlertTriangle,
  ChevronDown,
  Check
} from 'lucide-react'
import { cn } from '../lib/utils'
import {
  ApiError,
  getProjectGitFileContent,
  useProject,
  useProjectGitStatus,
  useProjectGitDiff,
  useProjectGitBranches,
  useProjectGitLog,
  useStageGitPaths,
  useUnstageGitPaths,
  useCommitGit,
  usePushGit,
  useCreateGitBranch,
  useCreateSession,
  useDeleteSession,
  useStopSession,
  useRestartSession,
  useDeleteProject,
  useUpdateProjectIcon,
  useSettings
} from '../lib/api'
import { useTabContext } from '../contexts/tabs'
import { diffService, type ParsedDiff } from '../lib/diff'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'
import { Skeleton } from './ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'
import { Checkbox } from './ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './ui/dropdown-menu'
import { GitFileTree } from './git-file-tree'
import { GitFileHeader } from './git-file-header'
import { ProjectIcon } from './project-icon'
import type { GitReviewFile } from './git-review-types'

function statusDot(status: string) {
  switch (status) {
    case 'running':
      return 'bg-green-500'
    case 'starting':
      return 'bg-yellow-500 animate-pulse'
    case 'stopped':
      return 'bg-gray-500'
    case 'error':
      return 'bg-red-500'
    case 'missing':
      return 'bg-orange-500'
    case 'disconnected':
      return 'bg-yellow-500'
    default:
      return 'bg-gray-500'
  }
}

function diffLineClass(line: string) {
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return 'bg-emerald-500/10 text-emerald-400'
  }
  if (line.startsWith('-') && !line.startsWith('---')) {
    return 'bg-red-500/10 text-red-400'
  }
  if (line.startsWith('@@')) {
    return 'bg-blue-500/10 text-blue-300'
  }
  if (
    line.startsWith('diff --git') ||
    line.startsWith('index ') ||
    line.startsWith('---') ||
    line.startsWith('+++')
  ) {
    return 'text-muted-foreground'
  }
  return ''
}

function actionErrorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.statusMessage
  if (err instanceof Error) return err.message
  return fallback
}

function formatCommitTimestamp(isoTimestamp: string) {
  if (!isoTimestamp) return ''
  const parsed = new Date(isoTimestamp)
  if (Number.isNaN(parsed.getTime())) return isoTimestamp
  return parsed.toLocaleString()
}

function extractPatchBody(rawPatch: string) {
  const lines = rawPatch.split('\n')
  const firstHunkLine = lines.findIndex((line) => line.startsWith('@@'))
  if (firstHunkLine === -1) return ''
  return lines.slice(firstHunkLine).join('\n')
}

function refsForScope(scope: 'unstaged' | 'staged') {
  if (scope === 'staged') {
    return { oldRef: 'HEAD', newRef: 'INDEX' }
  }
  return { oldRef: 'INDEX', newRef: 'WORKTREE' }
}

function CreateSessionDialog({
  open,
  onOpenChange,
  projectId
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
}) {
  const [name, setName] = useState('')
  const [agentCli, setAgentCli] = useState('')
  const { data: settings } = useSettings()
  const createSession = useCreateSession(projectId)
  const navigate = useNavigate()
  const { openSessionTab } = useTabContext()

  const defaultAgent = settings?.defaultAgentCli ?? 'amp'

  const handleCreate = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const result = await createSession.mutateAsync({
      name: trimmed,
      agentCli: agentCli.trim() || undefined
    })
    onOpenChange(false)
    setName('')
    setAgentCli('')
    openSessionTab(projectId, result.id, result.name)
    navigate(`/projects/${projectId}/sessions/${result.id}`)
  }, [name, agentCli, createSession, onOpenChange, openSessionTab, projectId, navigate])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogTitle>New Session</DialogTitle>
        <DialogDescription>Create a new agent session for this project.</DialogDescription>
        <div className='space-y-3'>
          <div>
            <label className='text-xs font-medium text-muted-foreground mb-1 block'>
              Session Name
            </label>
            <input
              type='text'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. fix-auth-bug'
              className='w-full h-9 px-3 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring'
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim() && !createSession.isPending) {
                  handleCreate()
                }
              }}
            />
          </div>
          <div>
            <label className='text-xs font-medium text-muted-foreground mb-1 block'>
              Agent CLI
            </label>
            <input
              type='text'
              value={agentCli}
              onChange={(e) => setAgentCli(e.target.value)}
              placeholder={`Default: ${defaultAgent}`}
              className='w-full h-9 px-3 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring'
            />
          </div>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || createSession.isPending}
            className='w-full'
          >
            {createSession.isPending && <Loader2 className='w-4 h-4 animate-spin' />}
            Create Session
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const PROJECT_ICON_PRESETS = ['🧭', '⚡️', '🧪', '🧩', '🧠', '🧰', '📦', '📝', '🛰️', '🪐']

function ProjectIconDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  currentIcon
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  currentIcon: string | null | undefined
}) {
  const updateProjectIcon = useUpdateProjectIcon(projectId)
  const [iconInput, setIconInput] = useState('')

  useEffect(() => {
    if (!open) return
    setIconInput(currentIcon ?? '')
  }, [currentIcon, open])

  const normalizedCurrent = (currentIcon ?? '').trim()
  const normalizedNext = iconInput.trim()
  const isDirty = normalizedCurrent !== normalizedNext
  const previewIcon = normalizedNext || normalizedCurrent || null

  const handleSave = useCallback(async () => {
    if (!isDirty || updateProjectIcon.isPending) return
    try {
      await updateProjectIcon.mutateAsync({ icon: normalizedNext || null })
      onOpenChange(false)
    } catch (err) {
      window.alert(actionErrorMessage(err, 'Failed to update project icon.'))
    }
  }, [isDirty, normalizedNext, onOpenChange, updateProjectIcon])

  const handlePreset = (preset: string) => {
    setIconInput(preset)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogTitle>Project icon</DialogTitle>
        <DialogDescription>
          Pick an emoji or short label for <span className='font-medium'>{projectName}</span>.
        </DialogDescription>
        <div className='space-y-3'>
          <div className='flex items-center gap-3'>
            <ProjectIcon
              icon={previewIcon}
              name={projectName}
              className='size-10 text-lg bg-muted/50'
              iconClassName='size-6'
            />
            <div className='flex-1'>
              <label className='text-xs font-medium text-muted-foreground mb-1 block'>
                Icon text
              </label>
              <input
                type='text'
                value={iconInput}
                onChange={(event) => setIconInput(event.target.value.slice(0, 8))}
                placeholder='e.g. 🚀'
                className='w-full h-9 px-3 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring'
              />
            </div>
          </div>

          <div className='space-y-2'>
            <p className='text-xs text-muted-foreground'>Quick picks</p>
            <div className='flex flex-wrap gap-2'>
              {PROJECT_ICON_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type='button'
                  onClick={() => handlePreset(preset)}
                  className='flex size-9 items-center justify-center rounded-md border border-border bg-background text-lg transition-colors hover:bg-muted'
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className='flex items-center justify-between'>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => setIconInput('')}
              disabled={!normalizedNext && !normalizedCurrent}
            >
              Clear icon
            </Button>
            <Button onClick={handleSave} disabled={!isDirty || updateProjectIcon.isPending}>
              {updateProjectIcon.isPending && <Loader2 className='w-4 h-4 animate-spin' />}
              Save icon
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { openSessionTab, closeProjectTabs } = useTabContext()
  const { data: project, isLoading, error, refetch: refetchProject } = useProject(projectId!)
  const { data: gitStatus, refetch: refetchGitStatus } = useProjectGitStatus(projectId!, {
    enabled: !!project?.isGitRepo
  })
  const deleteProject = useDeleteProject()
  const stopSession = useStopSession()
  const restartSession = useRestartSession()
  const deleteSession = useDeleteSession()

  const [showCreateSession, setShowCreateSession] = useState(false)
  const [showProjectIconDialog, setShowProjectIconDialog] = useState(false)
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false)
  const [activeView, setActiveView] = useState<'sessions' | 'git'>('sessions')
  const [showCommitModal, setShowCommitModal] = useState(false)
  const [pushAfterCommit, setPushAfterCommit] = useState(false)
  const [showCreateBranchModal, setShowCreateBranchModal] = useState(false)
  const [diffScope, setDiffScope] = useState<'unstaged' | 'staged'>('unstaged')
  const [selectedDiffSha, setSelectedDiffSha] = useState<string | null>(null)
  const [mobileGitPanel, setMobileGitPanel] = useState<'files' | 'diff'>('files')
  const [commitMessage, setCommitMessage] = useState('')
  const [newBranchNameInput, setNewBranchNameInput] = useState('')
  const [parsedDiff, setParsedDiff] = useState<ParsedDiff | null>(null)
  const [parsedDiffLoading, setParsedDiffLoading] = useState(false)
  const [parsedDiffError, setParsedDiffError] = useState<string | null>(null)
  const parsedDiffCacheRef = useRef(new Map<string, ParsedDiff>())
  const [gitActionNotice, setGitActionNotice] = useState<{
    tone: 'success' | 'error'
    text: string
  } | null>(null)

  const {
    data: gitDiff,
    isLoading: gitDiffLoading,
    error: gitDiffError,
    refetch: refetchGitDiff
  } = useProjectGitDiff(projectId!, diffScope, {
    enabled: !!project?.isGitRepo
  })

  const {
    data: gitBranches,
    isLoading: gitBranchesLoading,
    error: gitBranchesError,
    refetch: refetchGitBranches
  } = useProjectGitBranches(projectId!, {
    enabled: !!project?.isGitRepo
  })

  const {
    data: gitLog,
    isLoading: gitLogLoading,
    error: gitLogError,
    refetch: refetchGitLog
  } = useProjectGitLog(projectId!, {
    enabled: !!project?.isGitRepo,
    limit: 20
  })

  const stageGitPaths = useStageGitPaths(projectId!)
  const unstageGitPaths = useUnstageGitPaths(projectId!)
  const commitGit = useCommitGit(projectId!)
  const pushGit = usePushGit(projectId!)
  const createGitBranch = useCreateGitBranch(projectId!)

  const diffFiles = (gitDiff?.files ?? []) as GitReviewFile[]
  const selectedDiffFile =
    diffFiles.find((file) => file.sha === selectedDiffSha) ?? diffFiles[0] ?? null
  const selectedDiffIndex = selectedDiffFile
    ? diffFiles.findIndex((file) => file.sha === selectedDiffFile.sha)
    : -1

  useEffect(() => {
    if (!project?.isGitRepo && activeView === 'git') {
      setActiveView('sessions')
    }
  }, [project?.isGitRepo, activeView])

  useEffect(() => {
    if (diffFiles.length === 0) {
      setSelectedDiffSha(null)
      return
    }

    const stillExists = selectedDiffSha
      ? diffFiles.some((file) => file.sha === selectedDiffSha)
      : false

    if (!stillExists) {
      setSelectedDiffSha(diffFiles[0].sha)
    }
  }, [diffFiles, selectedDiffSha])

  useEffect(() => {
    let cancelled = false
    const file = selectedDiffFile

    if (!projectId || !file?.patch) {
      setParsedDiff(null)
      setParsedDiffError(null)
      setParsedDiffLoading(false)
      return
    }

    const patchBody = extractPatchBody(file.patch)
    if (!patchBody) {
      setParsedDiff(null)
      setParsedDiffError(null)
      setParsedDiffLoading(false)
      return
    }

    const cacheKey = `${diffScope}:${file.sha}`
    const cached = parsedDiffCacheRef.current.get(cacheKey)
    if (cached) {
      setParsedDiff(cached)
      setParsedDiffError(null)
      setParsedDiffLoading(false)
      return
    }

    const readFileAtRef = (ref: string, path: string) =>
      getProjectGitFileContent(projectId, ref, path).catch(() => '')

    const parseSelectedDiff = async () => {
      setParsedDiffLoading(true)
      setParsedDiffError(null)

      try {
        const { oldRef, newRef } = refsForScope(diffScope)
        const status = file.status
        const oldPath = file.previous_filename || file.filename
        const newPath = file.filename

        const oldContentPromise =
          status === 'added' || status === 'untracked'
            ? Promise.resolve('')
            : readFileAtRef(oldRef, oldPath)
        const newContentPromise =
          status === 'deleted' ? Promise.resolve('') : readFileAtRef(newRef, newPath)

        const [oldContent, newContent] = await Promise.all([oldContentPromise, newContentPromise])

        const parsed = await diffService.parseDiff(
          patchBody,
          file.filename,
          file.previous_filename || undefined,
          oldContent,
          newContent
        )

        if (cancelled) return

        parsedDiffCacheRef.current.set(cacheKey, parsed)
        if (parsedDiffCacheRef.current.size > 200) {
          const firstKey = parsedDiffCacheRef.current.keys().next().value
          if (firstKey) {
            parsedDiffCacheRef.current.delete(firstKey)
          }
        }

        setParsedDiff(parsed)
        setParsedDiffError(null)
      } catch (err) {
        if (cancelled) return
        setParsedDiff(null)
        setParsedDiffError(actionErrorMessage(err, 'Failed to parse diff.'))
      } finally {
        if (!cancelled) {
          setParsedDiffLoading(false)
        }
      }
    }

    parseSelectedDiff()

    return () => {
      cancelled = true
    }
  }, [
    diffScope,
    projectId,
    selectedDiffFile,
    selectedDiffFile?.filename,
    selectedDiffFile?.patch,
    selectedDiffFile?.previous_filename,
    selectedDiffFile?.sha,
    selectedDiffFile?.status
  ])

  const handleStageFiles = useCallback(
    async (paths?: string[]) => {
      try {
        await stageGitPaths.mutateAsync(paths?.length ? { paths } : {})
        setGitActionNotice({
          tone: 'success',
          text: paths?.length ? 'File staged.' : 'All changes staged.'
        })
      } catch (err) {
        setGitActionNotice({
          tone: 'error',
          text: actionErrorMessage(err, 'Failed to stage file.')
        })
      }
    },
    [stageGitPaths]
  )

  const handleUnstageFiles = useCallback(
    async (paths?: string[]) => {
      try {
        await unstageGitPaths.mutateAsync(paths?.length ? { paths } : {})
        setGitActionNotice({
          tone: 'success',
          text: paths?.length ? 'File unstaged.' : 'All files unstaged.'
        })
      } catch (err) {
        setGitActionNotice({
          tone: 'error',
          text: actionErrorMessage(err, 'Failed to unstage file.')
        })
      }
    },
    [unstageGitPaths]
  )

  const handleCommit = useCallback(
    async ({ pushAfter = false }: { pushAfter?: boolean } = {}) => {
      const message = commitMessage.trim()
      if (!message) return

      try {
        await commitGit.mutateAsync({ message })
      } catch (err) {
        setGitActionNotice({
          tone: 'error',
          text: actionErrorMessage(err, 'Failed to commit.')
        })
        return
      }

      if (pushAfter) {
        try {
          await pushGit.mutateAsync()
          setGitActionNotice({ tone: 'success', text: 'Commit created and pushed.' })
        } catch (err) {
          setGitActionNotice({
            tone: 'error',
            text: `Commit created, but push failed: ${actionErrorMessage(err, 'Failed to push.')}`
          })
        }
      } else {
        setGitActionNotice({ tone: 'success', text: 'Commit created.' })
      }

      setCommitMessage('')
      setPushAfterCommit(false)
      setShowCommitModal(false)
      setDiffScope('unstaged')
    },
    [commitMessage, commitGit, pushGit]
  )

  const handlePush = useCallback(async () => {
    try {
      await pushGit.mutateAsync()
      setGitActionNotice({ tone: 'success', text: 'Push completed.' })
    } catch (err) {
      setGitActionNotice({
        tone: 'error',
        text: actionErrorMessage(err, 'Failed to push.')
      })
    }
  }, [pushGit])

  const handleRefreshGit = useCallback(() => {
    parsedDiffCacheRef.current.clear()
    setParsedDiff(null)
    void refetchProject()
    void refetchGitStatus()
    void refetchGitDiff()
    void refetchGitBranches()
    void refetchGitLog()
  }, [refetchProject, refetchGitStatus, refetchGitDiff, refetchGitBranches, refetchGitLog])

  const handleCreateBranch = useCallback(async () => {
    const name = newBranchNameInput.trim()
    if (!name) return

    try {
      await createGitBranch.mutateAsync({ name, checkout: true })
      setNewBranchNameInput('')
      setShowCreateBranchModal(false)
      setGitActionNotice({ tone: 'success', text: `Created and switched to ${name}.` })
      handleRefreshGit()
    } catch (err) {
      setGitActionNotice({
        tone: 'error',
        text: actionErrorMessage(err, 'Failed to create branch.')
      })
    }
  }, [newBranchNameInput, createGitBranch, handleRefreshGit])

  const gitActionBusy =
    stageGitPaths.isPending ||
    unstageGitPaths.isPending ||
    commitGit.isPending ||
    pushGit.isPending ||
    createGitBranch.isPending

  const selectPrevDiffFile = useCallback(() => {
    if (diffFiles.length === 0) return
    const current = selectedDiffIndex >= 0 ? selectedDiffIndex : 0
    const prev = (current - 1 + diffFiles.length) % diffFiles.length
    setSelectedDiffSha(diffFiles[prev].sha)
  }, [diffFiles, selectedDiffIndex])

  const selectNextDiffFile = useCallback(() => {
    if (diffFiles.length === 0) return
    const current = selectedDiffIndex >= 0 ? selectedDiffIndex : 0
    const next = (current + 1) % diffFiles.length
    setSelectedDiffSha(diffFiles[next].sha)
  }, [diffFiles, selectedDiffIndex])

  const handleSelectDiffFile = useCallback((sha: string) => {
    setSelectedDiffSha(sha)
    setMobileGitPanel('diff')
  }, [])

  const toggleStageSelectedFile = useCallback(async () => {
    if (!selectedDiffFile) return

    if (diffScope === 'unstaged') {
      await handleStageFiles([selectedDiffFile.filename])
    } else {
      await handleUnstageFiles([selectedDiffFile.filename])
    }
  }, [selectedDiffFile, diffScope, handleStageFiles, handleUnstageFiles])

  useEffect(() => {
    if (activeView !== 'git' || showCommitModal || showCreateBranchModal) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return

      const target = e.target as HTMLElement | null
      if (target) {
        const tagName = target.tagName.toLowerCase()
        const isTextInput =
          tagName === 'input' ||
          tagName === 'textarea' ||
          tagName === 'select' ||
          target.isContentEditable

        if (isTextInput) return
      }

      if (e.key === 'j') {
        e.preventDefault()
        selectPrevDiffFile()
        return
      }

      if (e.key === 'k') {
        e.preventDefault()
        selectNextDiffFile()
        return
      }

      if (e.key === 's' && selectedDiffFile && !gitActionBusy) {
        e.preventDefault()
        void toggleStageSelectedFile()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    activeView,
    gitActionBusy,
    selectNextDiffFile,
    selectedDiffFile,
    selectPrevDiffFile,
    showCommitModal,
    showCreateBranchModal,
    toggleStageSelectedFile
  ])

  const handleDeleteProject = useCallback(() => {
    if (!confirmDeleteProject) {
      setConfirmDeleteProject(true)
      return
    }
    if (projectId) {
      deleteProject.mutate(projectId, {
        onSuccess: () => {
          closeProjectTabs(projectId)
          navigate('/')
        }
      })
    }
  }, [confirmDeleteProject, projectId, deleteProject, closeProjectTabs, navigate])

  // Reset confirm
  useEffect(() => {
    if (!confirmDeleteProject) return
    const timer = setTimeout(() => setConfirmDeleteProject(false), 3000)
    return () => clearTimeout(timer)
  }, [confirmDeleteProject])

  if (isLoading) {
    return (
      <div className='h-full bg-background p-4 space-y-4'>
        <div className='flex items-center gap-3'>
          <Skeleton className='h-8 w-8 rounded' />
          <Skeleton className='h-6 w-48' />
        </div>
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
          <div className='lg:col-span-2 space-y-2'>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className='h-14 w-full rounded-lg' />
            ))}
          </div>
          <Skeleton className='h-40 w-full rounded-lg' />
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className='h-full flex items-center justify-center bg-background'>
        <div className='text-center'>
          <AlertCircle className='w-8 h-8 text-destructive mx-auto mb-2' />
          <p className='text-sm text-muted-foreground'>Project not found</p>
          <Button variant='ghost' size='sm' onClick={() => navigate('/')} className='mt-2'>
            <ArrowLeft className='w-4 h-4' />
            Back to Home
          </Button>
        </div>
      </div>
    )
  }

  const sessions = project.sessions ?? []
  const stagedCount = gitStatus?.counts.staged ?? 0
  const unstagedCount = (gitStatus?.counts.unstaged ?? 0) + (gitStatus?.counts.untracked ?? 0)
  const gitBranchesList = gitBranches?.branches ?? []
  const gitLogEntries = gitLog?.entries ?? []

  return (
    <Tabs
      value={activeView}
      onValueChange={(value) => {
        if (value === 'sessions' || value === 'git') {
          setActiveView(value)
        }
      }}
      className='h-full gap-0 bg-background'
    >
      {/* Header */}
      <div className='border-b border-border px-4 py-2.5 shrink-0 bg-card/30'>
        <nav className='flex min-w-0 items-center gap-2'>
          <Button variant='ghost' size='icon-sm' onClick={() => navigate('/')}>
            <ArrowLeft className='w-4 h-4' />
          </Button>

          <button
            type='button'
            onClick={() => setShowProjectIconDialog(true)}
            className='group flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted/50'
          >
            <ProjectIcon icon={project.icon} name={project.name} className='size-7 text-[13px]' />
            <span className='max-w-[120px] truncate text-sm font-medium sm:max-w-[220px] lg:max-w-[300px]'>
              {project.name}
            </span>
            <Pencil className='w-3.5 h-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100' />
          </button>

          <TabsList className='ml-auto h-8 shrink-0 rounded-md border border-border bg-background/70 p-1'>
            <TabsTrigger value='sessions' className='h-6 px-2.5 text-xs'>
              <Terminal className='w-3.5 h-3.5' />
              <span>Sessions</span>
              <span className='hidden text-[10px] opacity-70 sm:inline'>({sessions.length})</span>
            </TabsTrigger>
            {project.isGitRepo && (
              <TabsTrigger value='git' className='h-6 px-2.5 text-xs'>
                <GitBranch className='w-3.5 h-3.5' />
                Git
              </TabsTrigger>
            )}
          </TabsList>
        </nav>

        {activeView === 'sessions' && (
          <div className='mt-2 flex flex-wrap items-center gap-2'>
            <Button variant='ghost' size='icon-sm' onClick={() => void refetchProject()}>
              <RefreshCw className='w-3.5 h-3.5' />
            </Button>
            <Button variant='outline' size='sm' onClick={() => setShowCreateSession(true)}>
              <Plus className='w-3.5 h-3.5' />
              New Session
            </Button>
            <Button
              variant={confirmDeleteProject ? 'destructive' : 'ghost'}
              size='sm'
              onClick={handleDeleteProject}
              disabled={deleteProject.isPending}
            >
              <Trash2 className='w-3.5 h-3.5' />
              {confirmDeleteProject ? 'Confirm?' : 'Delete'}
            </Button>
          </div>
        )}
      </div>

      {/* Body */}
      <div
        className={cn(
          'flex-1 min-h-0',
          activeView === 'sessions' ? 'overflow-auto p-3 sm:p-4' : 'overflow-hidden'
        )}
      >
        <TabsContent value='sessions' className='h-full'>
          {sessions.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-12 text-muted-foreground'>
              <Terminal className='w-8 h-8 mb-2 opacity-40' />
              <p className='text-xs'>No sessions yet</p>
              <p className='text-[11px] mt-1'>Create one to get started</p>
            </div>
          ) : (
            <div className='divide-y divide-border/60 overflow-hidden rounded-md border border-border/70 bg-card/20'>
              {sessions.map((session) => {
                const canStop = ['running', 'starting', 'disconnected'].includes(
                  session.observedStatus
                )
                const canRestart = ['stopped', 'error', 'missing'].includes(session.observedStatus)

                return (
                  <div
                    key={session.id}
                    className='group flex items-center gap-2 px-2.5 py-2 transition-colors hover:bg-muted/40 sm:px-3'
                  >
                    <span
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        statusDot(session.observedStatus)
                      )}
                    />

                    <div className='min-w-0 flex-1'>
                      <div className='flex items-center gap-2'>
                        <span className='truncate text-[13px] font-medium leading-tight'>
                          {session.name}
                        </span>
                        <span className='hidden rounded border border-border/70 bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline'>
                          {session.agentCli}
                        </span>
                      </div>
                      <div className='mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground'>
                        <span className='max-w-[38vw] truncate sm:hidden'>{session.agentCli}</span>
                        <span className='capitalize'>{session.observedStatus}</span>
                      </div>
                    </div>

                    <div className='flex shrink-0 items-center gap-1'>
                      <Button
                        variant='ghost'
                        size='sm'
                        className='h-7 px-2 text-[11px]'
                        onClick={() => {
                          openSessionTab(projectId!, session.id, session.name)
                          navigate(`/projects/${projectId}/sessions/${session.id}`)
                        }}
                        title={`Open session ${session.name}`}
                      >
                        <Terminal className='size-3.5' />
                        <span className='hidden sm:inline'>Open</span>
                      </Button>
                      {canStop && (
                        <Button
                          variant='ghost'
                          size='icon-sm'
                          className='size-7'
                          onClick={() => stopSession.mutate(session.id)}
                          disabled={stopSession.isPending}
                          aria-label={`Stop ${session.name}`}
                          title='Stop session'
                        >
                          <Square className='size-3.5' />
                        </Button>
                      )}
                      {canRestart && (
                        <Button
                          variant='ghost'
                          size='icon-sm'
                          className='size-7'
                          onClick={() => restartSession.mutate(session.id)}
                          disabled={restartSession.isPending}
                          aria-label={`Restart ${session.name}`}
                          title='Restart session'
                        >
                          <Play className='size-3.5' />
                        </Button>
                      )}
                      <Button
                        variant='ghost'
                        size='icon-sm'
                        className='size-7 text-muted-foreground hover:text-destructive'
                        onClick={() => {
                          if (confirm(`Delete session "${session.name}"?`)) {
                            deleteSession.mutate(session.id)
                          }
                        }}
                        disabled={deleteSession.isPending}
                        aria-label={`Delete ${session.name}`}
                        title='Delete session'
                      >
                        <Trash2 className='size-3.5' />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        {project.isGitRepo && (
          <TabsContent value='git' className='h-full flex flex-col'>
            <div className='lg:hidden border-b border-border bg-card/20 px-3 py-2'>
              <div className='grid grid-cols-2 gap-1 rounded-md border border-border bg-background/70 p-1'>
                <Button
                  type='button'
                  size='sm'
                  variant={mobileGitPanel === 'files' ? 'secondary' : 'ghost'}
                  className='h-7 text-xs'
                  onClick={() => setMobileGitPanel('files')}
                >
                  Files ({diffFiles.length})
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant={mobileGitPanel === 'diff' ? 'secondary' : 'ghost'}
                  className='h-7 text-xs'
                  onClick={() => setMobileGitPanel('diff')}
                >
                  Diff
                </Button>
              </div>
            </div>

            <div className='flex-1 min-h-0 overflow-hidden bg-background flex flex-col lg:flex-row'>
              <aside
                className={cn(
                  'w-full shrink-0 border-border flex flex-col min-h-0 bg-card/20 border-b lg:border-b-0 lg:border-r lg:w-80 lg:flex-none',
                  mobileGitPanel === 'files' ? 'flex-1 lg:flex' : 'hidden lg:flex'
                )}
              >
                <div className='px-3 py-2 border-b border-border bg-muted/30'>
                  {gitStatus ? (
                    <>
                      <div className='flex items-center gap-2'>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className='inline-flex items-center gap-1.5 h-7 px-2 rounded-md border border-border bg-background text-xs hover:bg-muted transition-colors min-w-0'>
                              <GitBranch className='w-3.5 h-3.5 text-muted-foreground shrink-0' />
                              <span className='font-mono truncate max-w-[140px]'>
                                {gitStatus.head.ref || '(detached)'}
                              </span>
                              <ChevronDown className='w-3.5 h-3.5 text-muted-foreground shrink-0' />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align='start' className='w-72'>
                            <DropdownMenuLabel>Branches</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {gitBranchesLoading ? (
                              <DropdownMenuItem disabled>Loading branches…</DropdownMenuItem>
                            ) : gitBranchesError ? (
                              <DropdownMenuItem disabled>
                                {actionErrorMessage(gitBranchesError, 'Failed to load branches.')}
                              </DropdownMenuItem>
                            ) : gitBranchesList.length === 0 ? (
                              <DropdownMenuItem disabled>No branches found.</DropdownMenuItem>
                            ) : (
                              gitBranchesList.slice(0, 25).map((branch) => (
                                <DropdownMenuItem
                                  key={`${branch.name}-${branch.sha}`}
                                  disabled
                                  className='justify-between gap-2'
                                >
                                  <span className='truncate font-mono text-xs'>{branch.name}</span>
                                  {branch.current && (
                                    <Check className='w-3.5 h-3.5 text-emerald-400 shrink-0' />
                                  )}
                                </DropdownMenuItem>
                              ))
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setShowCreateBranchModal(true)}
                              disabled={createGitBranch.isPending}
                            >
                              <Plus className='w-4 h-4' />
                              New branch…
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        {gitStatus.dirty && (
                          <span className='text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-500 border border-yellow-500/30'>
                            dirty
                          </span>
                        )}

                        <Button
                          variant='ghost'
                          size='icon-sm'
                          className='ml-auto'
                          onClick={handleRefreshGit}
                        >
                          <RefreshCw className='w-3.5 h-3.5' />
                        </Button>
                      </div>
                      <div className='mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground'>
                        <span className='inline-flex items-center gap-1.5' title='Staged changes'>
                          <CheckCircle2 className='w-3.5 h-3.5 text-emerald-400' />
                          <span className='tabular-nums'>{gitStatus.counts.staged}</span>
                        </span>
                        <span className='inline-flex items-center gap-1.5' title='Unstaged changes'>
                          <Pencil className='w-3.5 h-3.5 text-amber-300' />
                          <span className='tabular-nums'>{gitStatus.counts.unstaged}</span>
                        </span>
                        <span className='inline-flex items-center gap-1.5' title='Untracked files'>
                          <FilePlus className='w-3.5 h-3.5 text-blue-300' />
                          <span className='tabular-nums'>{gitStatus.counts.untracked}</span>
                        </span>
                        <span className='inline-flex items-center gap-1.5' title='Conflicted files'>
                          <AlertTriangle className='w-3.5 h-3.5 text-red-400' />
                          <span className='tabular-nums'>{gitStatus.counts.conflicted}</span>
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className='space-y-2'>
                      <Skeleton className='h-4 w-32' />
                      <Skeleton className='h-14 w-full' />
                    </div>
                  )}
                </div>

                <div className='px-3 py-2 border-b border-border space-y-2'>
                  <div className='flex items-center justify-between gap-2'>
                    <span className='text-xs font-medium text-muted-foreground'>
                      Files ({diffFiles.length})
                    </span>

                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        if (diffScope === 'unstaged') {
                          void handleStageFiles()
                        } else {
                          void handleUnstageFiles()
                        }
                      }}
                      disabled={diffFiles.length === 0 || gitActionBusy}
                    >
                      {diffScope === 'unstaged' ? 'Stage all' : 'Unstage all'}
                    </Button>
                  </div>

                  <div className='flex items-center gap-1'>
                    <Button
                      variant={diffScope === 'unstaged' ? 'secondary' : 'ghost'}
                      size='sm'
                      className='flex-1'
                      onClick={() => setDiffScope('unstaged')}
                    >
                      Unstaged ({unstagedCount})
                    </Button>
                    <Button
                      variant={diffScope === 'staged' ? 'secondary' : 'ghost'}
                      size='sm'
                      className='flex-1'
                      onClick={() => setDiffScope('staged')}
                    >
                      Staged ({stagedCount})
                    </Button>
                  </div>
                </div>

                <div className='flex-1 min-h-0'>
                  {gitDiffLoading ? (
                    <div className='p-3 space-y-2'>
                      {Array.from({ length: 9 }).map((_, i) => (
                        <Skeleton key={i} className='h-7 w-full' />
                      ))}
                    </div>
                  ) : gitDiffError ? (
                    <div className='p-3 text-xs text-red-400'>
                      {actionErrorMessage(gitDiffError, 'Failed to load diff.')}
                    </div>
                  ) : (
                    <GitFileTree
                      files={diffFiles}
                      selectedFileSha={selectedDiffFile?.sha ?? null}
                      onSelectFile={handleSelectDiffFile}
                    />
                  )}
                </div>
              </aside>

              <main
                className={cn(
                  'flex-1 min-w-0 flex flex-col',
                  mobileGitPanel === 'diff' ? 'flex' : 'hidden lg:flex'
                )}
              >
                <div className='px-3 py-2 border-b border-border bg-muted/20 flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3'>
                  <div className='text-xs text-muted-foreground break-words'>
                    {gitLogEntries[0]
                      ? `Latest commit: ${gitLogEntries[0].shortSha} · ${gitLogEntries[0].subject || '(no subject)'}`
                      : 'No commits yet.'}
                  </div>
                  <div className='text-[10px] text-muted-foreground shrink-0'>
                    {gitLogEntries[0] ? formatCommitTimestamp(gitLogEntries[0].authoredAt) : ''}
                  </div>
                </div>

                {selectedDiffFile ? (
                  <div className='px-3 py-2 border-b border-border bg-muted/30'>
                    <GitFileHeader
                      file={selectedDiffFile}
                      diffScope={diffScope}
                      currentIndex={selectedDiffIndex}
                      totalFiles={diffFiles.length}
                      onPrevFile={selectPrevDiffFile}
                      onNextFile={selectNextDiffFile}
                      onToggleStage={() => void toggleStageSelectedFile()}
                      busy={gitActionBusy}
                    />
                  </div>
                ) : (
                  <div className='px-3 py-2 border-b border-border text-xs text-muted-foreground flex items-center justify-between gap-2'>
                    <span>Select a file to review its diff.</span>
                    <Button
                      variant='ghost'
                      size='sm'
                      className='h-7 text-[11px] lg:hidden'
                      onClick={() => setMobileGitPanel('files')}
                    >
                      Browse files
                    </Button>
                  </div>
                )}

                <div className='flex-1 overflow-auto bg-muted/20'>
                  {parsedDiffLoading ? (
                    <div className='p-3 space-y-1'>
                      {Array.from({ length: 10 }).map((_, i) => (
                        <Skeleton key={i} className='h-5 w-full rounded-sm' />
                      ))}
                    </div>
                  ) : parsedDiffError ? (
                    <div className='p-4 text-xs text-red-400'>{parsedDiffError}</div>
                  ) : parsedDiff && parsedDiff.hunks.length > 0 ? (
                    <div className='font-mono text-[11px] leading-5'>
                      {parsedDiff.hunks.map((hunk, hunkIndex) => {
                        if (hunk.type === 'skip') {
                          return (
                            <div
                              key={`skip-${hunkIndex}`}
                              className='px-3 py-1 text-[10px] text-muted-foreground border-b border-border/30 bg-muted/40'
                            >
                              … {hunk.count} lines omitted
                            </div>
                          )
                        }

                        return (
                          <div key={`hunk-${hunkIndex}`}>
                            <div className='px-3 py-1 text-[10px] text-blue-300 bg-blue-500/10 border-y border-border/30'>
                              @@ -{hunk.oldStart} +{hunk.newStart} @@
                            </div>
                            {hunk.lines.map((line, lineIndex) => (
                              <div
                                key={`line-${hunkIndex}-${lineIndex}`}
                                className={cn(
                                  'flex border-b border-border/20',
                                  line.type === 'insert' && 'bg-emerald-500/10',
                                  line.type === 'delete' && 'bg-red-500/10'
                                )}
                              >
                                <div className='w-11 shrink-0 text-right px-2 py-0.5 text-muted-foreground/70 select-none border-r border-border/30'>
                                  {line.type !== 'insert' ? line.oldLineNumber : ''}
                                </div>
                                <div className='w-11 shrink-0 text-right px-2 py-0.5 text-muted-foreground/70 select-none border-r border-border/30'>
                                  {line.type !== 'delete' ? line.newLineNumber : ''}
                                </div>
                                <div className='flex-1 py-0.5 pl-2 pr-3 whitespace-pre-wrap break-words [overflow-wrap:anywhere]'>
                                  <span
                                    className={cn(
                                      'mr-1 select-none',
                                      line.type === 'insert' && 'text-emerald-400',
                                      line.type === 'delete' && 'text-red-400',
                                      line.type === 'normal' && 'text-muted-foreground'
                                    )}
                                  >
                                    {line.type === 'insert'
                                      ? '+'
                                      : line.type === 'delete'
                                        ? '-'
                                        : ' '}
                                  </span>
                                  {line.content.map((segment, segmentIndex) => (
                                    <span
                                      key={segmentIndex}
                                      className={cn(
                                        segment.type === 'insert' && 'bg-emerald-500/20',
                                        segment.type === 'delete' && 'bg-red-500/20'
                                      )}
                                      dangerouslySetInnerHTML={{ __html: segment.html }}
                                    />
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  ) : selectedDiffFile?.patch ? (
                    <pre className='text-[11px] leading-5 font-mono p-3 whitespace-pre-wrap break-words [overflow-wrap:anywhere]'>
                      {selectedDiffFile.patch.split('\n').map((line, index) => (
                        <div
                          key={`${selectedDiffFile.sha}-${index}`}
                          className={cn('px-1', diffLineClass(line))}
                        >
                          {line || ' '}
                        </div>
                      ))}
                    </pre>
                  ) : (
                    <div className='p-4 text-xs text-muted-foreground'>
                      {diffFiles.length === 0
                        ? 'No diff to display.'
                        : 'Select a file to view its diff.'}
                    </div>
                  )}
                </div>

                <div className='border-t border-border p-3 space-y-3 bg-card/20'>
                  <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                    <div
                      className={cn(
                        'text-xs',
                        gitActionNotice?.tone === 'error' ? 'text-red-400' : 'text-muted-foreground'
                      )}
                    >
                      {gitActionNotice?.text ||
                        'Use Commit to open the modal, then optionally push immediately or later.'}
                    </div>

                    <div className='flex items-center gap-2'>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => setShowCommitModal(true)}
                        disabled={stagedCount === 0 || gitActionBusy}
                      >
                        <GitCommitHorizontal className='w-3.5 h-3.5' />
                        Commit
                      </Button>
                      <Button
                        size='sm'
                        onClick={handlePush}
                        disabled={pushGit.isPending || gitActionBusy}
                      >
                        {pushGit.isPending ? (
                          <Loader2 className='w-3.5 h-3.5 animate-spin' />
                        ) : (
                          <Upload className='w-3.5 h-3.5' />
                        )}
                        Push
                      </Button>
                    </div>
                  </div>

                  <details className='group'>
                    <summary className='cursor-pointer text-xs text-muted-foreground hover:text-foreground'>
                      Recent commits ({gitLogEntries.length})
                    </summary>
                    <div className='mt-2 max-h-40 overflow-auto rounded-md border border-border divide-y divide-border themed-scrollbar'>
                      {gitLogLoading ? (
                        <div className='p-3 text-xs text-muted-foreground'>Loading commits…</div>
                      ) : gitLogError ? (
                        <div className='p-3 text-xs text-red-400'>
                          {actionErrorMessage(gitLogError, 'Failed to load commit log.')}
                        </div>
                      ) : gitLogEntries.length === 0 ? (
                        <div className='p-3 text-xs text-muted-foreground'>No commits yet.</div>
                      ) : (
                        gitLogEntries.map((entry) => (
                          <div key={entry.sha} className='px-3 py-2'>
                            <div className='text-xs font-medium truncate'>
                              {entry.subject || '(no subject)'}
                            </div>
                            <div className='mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground'>
                              <span className='font-mono'>{entry.shortSha}</span>
                              <span className='truncate' title={entry.authoredAt}>
                                {formatCommitTimestamp(entry.authoredAt)}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </details>
                </div>
              </main>
            </div>
          </TabsContent>
        )}
      </div>

      {/* Create Branch Dialog */}
      <Dialog
        open={showCreateBranchModal}
        onOpenChange={(open) => {
          setShowCreateBranchModal(open)
          if (!open) {
            setNewBranchNameInput('')
          }
        }}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogTitle>Create branch</DialogTitle>
          <DialogDescription>
            Create and switch from{' '}
            <span className='font-mono'>{gitStatus?.head.ref || 'HEAD'}</span>
          </DialogDescription>

          <div className='space-y-3'>
            <input
              type='text'
              value={newBranchNameInput}
              onChange={(e) => setNewBranchNameInput(e.target.value)}
              placeholder='feature/my-branch'
              className='w-full h-9 px-3 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring'
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newBranchNameInput.trim() && !createGitBranch.isPending) {
                  void handleCreateBranch()
                }
              }}
            />

            <div className='flex items-center justify-end gap-2'>
              <Button
                variant='ghost'
                size='sm'
                onClick={() => setShowCreateBranchModal(false)}
                disabled={createGitBranch.isPending}
              >
                Cancel
              </Button>
              <Button
                size='sm'
                onClick={() => void handleCreateBranch()}
                disabled={!newBranchNameInput.trim() || createGitBranch.isPending}
              >
                {createGitBranch.isPending ? (
                  <Loader2 className='w-3.5 h-3.5 animate-spin' />
                ) : (
                  <Plus className='w-3.5 h-3.5' />
                )}
                Create branch
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Commit Dialog */}
      <Dialog
        open={showCommitModal}
        onOpenChange={(open) => {
          setShowCommitModal(open)
          if (!open) {
            setPushAfterCommit(false)
          }
        }}
      >
        <DialogContent className='sm:max-w-lg'>
          <DialogTitle>Create Commit</DialogTitle>
          <DialogDescription>
            {stagedCount} staged {stagedCount === 1 ? 'file' : 'files'} on{' '}
            <span className='font-mono'>{gitStatus?.head.ref || 'current branch'}</span>
          </DialogDescription>

          <div className='space-y-4'>
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder='Commit message'
              className='w-full min-h-28 px-3 py-2 rounded-md border border-border bg-background text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring'
              autoFocus
            />

            <label className='flex items-center gap-2 text-sm cursor-pointer'>
              <Checkbox
                checked={pushAfterCommit}
                onCheckedChange={(checked) => setPushAfterCommit(checked === true)}
              />
              <span>Push after commit</span>
            </label>

            <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
              <p className='text-xs text-muted-foreground'>
                {pushAfterCommit
                  ? 'Commit will be created and pushed immediately.'
                  : 'You can push later from the dashboard.'}
              </p>

              <div className='flex items-center gap-2'>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => setShowCommitModal(false)}
                  disabled={commitGit.isPending || pushGit.isPending}
                >
                  Cancel
                </Button>
                <Button
                  size='sm'
                  onClick={() => void handleCommit({ pushAfter: pushAfterCommit })}
                  disabled={
                    !commitMessage.trim() ||
                    commitGit.isPending ||
                    (pushAfterCommit && pushGit.isPending)
                  }
                >
                  {commitGit.isPending || (pushAfterCommit && pushGit.isPending) ? (
                    <Loader2 className='w-3.5 h-3.5 animate-spin' />
                  ) : (
                    <GitCommitHorizontal className='w-3.5 h-3.5' />
                  )}
                  {commitGit.isPending
                    ? 'Committing...'
                    : pushAfterCommit && pushGit.isPending
                      ? 'Pushing...'
                      : pushAfterCommit
                        ? 'Commit & Push'
                        : 'Commit'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Session Dialog */}
      <CreateSessionDialog
        open={showCreateSession}
        onOpenChange={setShowCreateSession}
        projectId={projectId!}
      />

      <ProjectIconDialog
        open={showProjectIconDialog}
        onOpenChange={setShowProjectIconDialog}
        projectId={projectId!}
        projectName={project.name}
        currentIcon={project.icon}
      />
    </Tabs>
  )
}
