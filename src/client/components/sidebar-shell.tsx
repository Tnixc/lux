import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { Outlet, useNavigate, useParams } from 'react-router-dom'
import {
  ChevronRight,
  FolderKanban,
  FolderOpen,
  GitBranch,
  Loader2,
  LogOut,
  PanelLeft,
  Plus,
  Search,
  X
} from 'lucide-react'
import {
  ApiError,
  useCreateProject,
  useCreateSession,
  useDirectories,
  useProjects,
  useSettings,
  type DirectoryEntry,
  type Project,
  type Session
} from '../lib/api'
import { useAuth, useUser } from '../contexts/auth'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'
import { Skeleton } from './ui/skeleton'
import { ProjectIcon } from './project-icon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './ui/dropdown-menu'

const DEFAULT_VISIBLE_SESSIONS = 5

const SIDEBAR_SIZE = {
  default: 280,
  min: 220,
  max: 360,
  collapsed: 64,
  collapseThreshold: 96
}

const SIDEBAR_STORAGE = {
  width: 'lux.sidebar.width',
  collapsed: 'lux.sidebar.collapsed'
}

const SIDEBAR_MOTION = {
  chevronMs: 180,
  collapseMs: 220
}

function sessionStatusDot(status?: string) {
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function toEpoch(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? timestamp : 0
  }
  return 0
}

function sortSessionsDesc(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => toEpoch(b.createdAt) - toEpoch(a.createdAt))
}

function actionErrorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.statusMessage
  if (err instanceof Error) return err.message
  return fallback
}

function NewProjectDialog({
  open,
  onOpenChange,
  onOpenProject
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenProject: (projectId: string) => void
}) {
  const { data, isLoading } = useDirectories()
  const createProject = useCreateProject()
  const [search, setSearch] = useState('')
  const [pendingPath, setPendingPath] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setSearch('')
      setPendingPath(null)
    }
  }, [open])

  const entries = data?.entries ?? []

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return entries
    return entries.filter(
      (entry) =>
        entry.name.toLowerCase().includes(term) ||
        entry.path.toLowerCase().includes(term) ||
        (entry.isProject && 'project'.includes(term))
    )
  }, [entries, search])

  const handleSelectDirectory = useCallback(
    async (entry: DirectoryEntry) => {
      if (entry.isProject && entry.projectId) {
        onOpenProject(entry.projectId)
        onOpenChange(false)
        return
      }

      setPendingPath(entry.path)
      try {
        const result = await createProject.mutateAsync({
          path: entry.path,
          name: entry.name
        })
        onOpenProject(result.id)
        onOpenChange(false)
      } catch (err) {
        window.alert(actionErrorMessage(err, 'Failed to create project.'))
      } finally {
        setPendingPath(null)
      }
    },
    [createProject, onOpenChange, onOpenProject]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-3xl'>
        <DialogTitle>New project</DialogTitle>
        <DialogDescription>
          Choose a directory to add as a project. Existing projects can be opened directly.
        </DialogDescription>

        <div className='space-y-3'>
          <div className='relative'>
            <Search className='pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
            <input
              type='text'
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder='Filter directories...'
              className='h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring'
            />
          </div>

          {data?.roots && data.roots.length > 0 && (
            <p className='truncate text-[11px] text-muted-foreground font-precise'>
              {data.roots.join(':')}
            </p>
          )}

          <div className='max-h-[55vh] overflow-y-auto rounded-md border border-border bg-card/30'>
            {isLoading ? (
              <div className='space-y-2 p-3'>
                {Array.from({ length: 8 }).map((_, index) => (
                  <div
                    key={index}
                    className='flex items-center gap-2 rounded-md border border-border/70 p-2'
                  >
                    <Skeleton className='size-4 shrink-0 rounded' />
                    <div className='min-w-0 flex-1 space-y-1'>
                      <Skeleton className='h-3 w-1/3' />
                      <Skeleton className='h-3 w-2/3' />
                    </div>
                    <Skeleton className='h-8 w-16' />
                  </div>
                ))}
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className='py-12 text-center text-sm text-muted-foreground'>
                {search ? 'No directories match your search.' : 'No directories found.'}
              </div>
            ) : (
              <div className='divide-y divide-border/70'>
                {filteredEntries.map((entry) => {
                  const isPending = pendingPath === entry.path

                  return (
                    <div
                      key={entry.path}
                      className='flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40'
                    >
                      <FolderOpen className='size-4 shrink-0 text-muted-foreground' />

                      <div className='min-w-0 flex-1'>
                        <div className='flex items-center gap-2'>
                          <span className='truncate text-sm font-medium'>{entry.name}</span>
                          {entry.isGitRepo && (
                            <span className='inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400'>
                              <GitBranch className='size-3' />
                              git
                            </span>
                          )}
                        </div>
                        <p className='truncate text-[11px] text-muted-foreground font-precise'>
                          {entry.path}
                        </p>
                      </div>

                      <Button
                        variant={entry.isProject ? 'ghost' : 'outline'}
                        size='sm'
                        disabled={isPending || createProject.isPending}
                        onClick={() => void handleSelectDirectory(entry)}
                      >
                        {isPending ? <Loader2 className='size-3.5 animate-spin' /> : null}
                        {entry.isProject ? 'Open' : 'Add'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CreateSessionDialog({
  open,
  projectId,
  projectName,
  onOpenChange,
  onCreated
}: {
  open: boolean
  projectId: string
  projectName: string
  onOpenChange: (open: boolean) => void
  onCreated: (sessionId: string) => void
}) {
  const [name, setName] = useState('')
  const [agentCli, setAgentCli] = useState('')
  const { data: settings } = useSettings()
  const createSession = useCreateSession(projectId)

  const defaultAgent = settings?.defaultAgentCli ?? 'amp'

  useEffect(() => {
    if (!open) return
    setName('')
    setAgentCli('')
  }, [open, projectId])

  const handleCreate = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed || createSession.isPending) return

    try {
      const result = await createSession.mutateAsync({
        name: trimmed,
        agentCli: agentCli.trim() || undefined
      })
      onOpenChange(false)
      setName('')
      setAgentCli('')
      onCreated(result.id)
    } catch (err) {
      window.alert(actionErrorMessage(err, 'Failed to create a session.'))
    }
  }, [agentCli, createSession, name, onCreated, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogTitle>New session</DialogTitle>
        <DialogDescription>
          Name a new agent session for <span className='font-medium'>{projectName}</span>.
        </DialogDescription>
        <div className='space-y-3'>
          <div>
            <label className='mb-1 block text-xs font-medium text-muted-foreground'>
              Session name
            </label>
            <input
              type='text'
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder='e.g. fix-auth-bug'
              className='h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring'
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter' && name.trim() && !createSession.isPending) {
                  handleCreate()
                }
              }}
            />
          </div>
          <div>
            <label className='mb-1 block text-xs font-medium text-muted-foreground'>
              Agent CLI
            </label>
            <input
              type='text'
              value={agentCli}
              onChange={(event) => setAgentCli(event.target.value)}
              placeholder={`Default: ${defaultAgent}`}
              className='h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring'
            />
          </div>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || createSession.isPending}
            className='w-full'
          >
            {createSession.isPending && <Loader2 className='size-4 animate-spin' />}
            Create session
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProjectGroup({
  project,
  isExpanded,
  isCollapsed,
  isProjectActive,
  activeSessionId,
  visibleSessionCount,
  onToggle,
  onOpenProject,
  onOpenSession,
  onCreateSession,
  onLoadMore
}: {
  project: Project
  isExpanded: boolean
  isCollapsed: boolean
  isProjectActive: boolean
  activeSessionId: string | null
  visibleSessionCount: number
  onToggle: (projectId: string) => void
  onOpenProject: (projectId: string) => void
  onOpenSession: (projectId: string, sessionId: string) => void
  onCreateSession: (projectId: string, projectName: string) => void
  onLoadMore: (projectId: string) => void
}) {
  const sessions = project.sessions ?? []

  const visibleSessions = sessions.slice(0, visibleSessionCount)
  const hasMoreSessions = sessions.length > visibleSessionCount

  return (
    <section className='px-1.5'>
      <div
        className={cn(
          'group flex items-center rounded-md py-0.5 transition-colors motion-reduce:transition-none',
          isProjectActive ? 'bg-accent/80 text-accent-foreground' : 'hover:bg-muted/50',
          isCollapsed ? 'justify-center px-0.5' : 'gap-0.5 px-1'
        )}
      >
        {!isCollapsed && (
          <button
            type='button'
            onClick={() => onToggle(project.id)}
            className='inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted'
            aria-label={isExpanded ? `Collapse ${project.name}` : `Expand ${project.name}`}
          >
            <ChevronRight
              className={cn(
                'size-3.5 transition-transform ease-out motion-reduce:transition-none',
                isExpanded ? 'rotate-90' : 'rotate-0'
              )}
              style={{ transitionDuration: `${SIDEBAR_MOTION.chevronMs}ms` }}
            />
          </button>
        )}

        <button
          type='button'
          onClick={() => onOpenProject(project.id)}
          className={cn(
            'flex items-center rounded-md text-left',
            isCollapsed ? 'size-7 justify-center' : 'min-w-0 flex-1 gap-1.5 px-1 py-0.5'
          )}
          title={project.path}
        >
          <ProjectIcon icon={project.icon} name={project.name} className='size-5 text-[11px]' />
          {!isCollapsed && (
            <span className='truncate text-[13px] font-medium leading-tight' title={project.name}>
              {project.name}
            </span>
          )}
          {!isCollapsed && (
            <span className='ml-auto text-[9px] tabular-nums text-muted-foreground font-precise'>
              {sessions.length}
            </span>
          )}
        </button>

        <Button
          variant='ghost'
          size='icon-sm'
          className={cn(
            'h-6 w-6 shrink-0',
            isCollapsed
              ? 'opacity-100'
              : 'opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100'
          )}
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation()
            onCreateSession(project.id, project.name)
          }}
          aria-label={`Create new session for ${project.name}`}
          title='Create session'
        >
          <Plus className='size-3' />
        </Button>
      </div>

      {!isCollapsed && (
        <div
          className={cn(
            'grid transition-[grid-template-rows,opacity] ease-out motion-reduce:transition-none',
            isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
          style={{ transitionDuration: `${SIDEBAR_MOTION.collapseMs}ms` }}
        >
          <div className='overflow-hidden'>
            <div className='ml-6 space-y-0.5 pb-1.5 pr-1.5 pt-0.5'>
              {visibleSessions.length === 0 ? (
                <p className='px-1.5 py-0.5 text-[10px] text-muted-foreground'>No sessions yet</p>
              ) : (
                visibleSessions.map((session) => {
                  const isSessionActive = activeSessionId === session.id

                  return (
                    <button
                      key={session.id}
                      type='button'
                      onClick={() => onOpenSession(project.id, session.id)}
                      className={cn(
                        'flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-[11px] leading-tight transition-colors motion-reduce:transition-none',
                        isSessionActive
                          ? 'bg-primary/15 text-foreground'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      )}
                      title={`${session.name} (${session.observedStatus})`}
                    >
                      <span
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          sessionStatusDot(session.observedStatus)
                        )}
                      />
                      <span className='truncate'>{session.name}</span>
                    </button>
                  )
                })
              )}

              {hasMoreSessions && (
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => onLoadMore(project.id)}
                  className='h-6 w-full justify-start px-1.5 text-[10px] text-muted-foreground hover:text-foreground'
                >
                  Load 5 more
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export function AppShell() {
  const navigate = useNavigate()
  const params = useParams<{ projectId: string; sessionId: string }>()
  const { data, isLoading } = useProjects()

  const [search, setSearch] = useState('')
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [sessionDialog, setSessionDialog] = useState<{
    projectId: string
    projectName: string
  } | null>(null)
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  const [visibleSessionsByProject, setVisibleSessionsByProject] = useState<Record<string, number>>(
    {}
  )
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') return SIDEBAR_SIZE.default
    const stored = Number(window.localStorage.getItem(SIDEBAR_STORAGE.width))
    if (Number.isFinite(stored)) {
      return clamp(stored, SIDEBAR_SIZE.min, SIDEBAR_SIZE.max)
    }
    return SIDEBAR_SIZE.default
  })
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(SIDEBAR_STORAGE.collapsed) === 'true'
  })
  const [isResizing, setIsResizing] = useState(false)
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const isSidebarCollapsed = !isMobile && isCollapsed
  const projects = data?.projects ?? []
  const activeProjectId = params.projectId ?? null
  const activeSessionId = params.sessionId ?? null

  const sortedProjectSessions = useMemo(() => {
    return new Map(
      projects.map((project) => [project.id, sortSessionsDesc(project.sessions ?? [])])
    )
  }, [projects])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(max-width: 768px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!isMobile) {
      setIsMobileOpen(false)
      document.body.style.overflow = ''
      return
    }
    document.body.style.overflow = isMobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobile, isMobileOpen])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SIDEBAR_STORAGE.width, String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SIDEBAR_STORAGE.collapsed, String(isCollapsed))
  }, [isCollapsed])

  useEffect(() => {
    if (!isSidebarCollapsed || !search.trim()) return
    setSearch('')
  }, [isSidebarCollapsed, search])

  useEffect(() => {
    if (!activeProjectId) return
    setExpandedProjects((prev) => {
      if (prev[activeProjectId] === undefined) {
        return { ...prev, [activeProjectId]: true }
      }
      return prev
    })
  }, [activeProjectId])

  useEffect(() => {
    if (!isMobile) return
    setIsMobileOpen(false)
  }, [activeProjectId, activeSessionId, isMobile])

  useEffect(() => {
    if (!activeProjectId || !activeSessionId) return
    const sessions = sortedProjectSessions.get(activeProjectId) ?? []
    const sessionIndex = sessions.findIndex((session) => session.id === activeSessionId)
    if (sessionIndex === -1) return

    const requiredVisible = sessionIndex + 1
    setVisibleSessionsByProject((prev) => {
      const currentVisible = prev[activeProjectId] ?? DEFAULT_VISIBLE_SESSIONS
      if (currentVisible >= requiredVisible) return prev
      return { ...prev, [activeProjectId]: requiredVisible }
    })
  }, [activeProjectId, activeSessionId, sortedProjectSessions])

  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return projects

    return projects.filter((project) => {
      if (project.name.toLowerCase().includes(term) || project.path.toLowerCase().includes(term)) {
        return true
      }
      return (project.sessions ?? []).some((session) => session.name.toLowerCase().includes(term))
    })
  }, [projects, search])

  const handleOpenProject = useCallback(
    (projectId: string) => {
      if (isMobile) setIsMobileOpen(false)
      navigate(`/projects/${projectId}/sessions`)
    },
    [isMobile, navigate]
  )

  const handleOpenSession = useCallback(
    (projectId: string, sessionId: string) => {
      if (isMobile) setIsMobileOpen(false)
      navigate(`/projects/${projectId}/sessions/${sessionId}`)
    },
    [isMobile, navigate]
  )

  const isProjectExpanded = useCallback(
    (projectId: string) => {
      if (search.trim()) return true
      return expandedProjects[projectId] ?? activeProjectId === projectId
    },
    [activeProjectId, expandedProjects, search]
  )

  const handleToggleProject = useCallback(
    (projectId: string) => {
      setExpandedProjects((prev) => {
        const open = prev[projectId] ?? activeProjectId === projectId
        return { ...prev, [projectId]: !open }
      })
    },
    [activeProjectId]
  )

  const handleEnsureExpanded = useCallback((projectId: string) => {
    setExpandedProjects((prev) => {
      if (prev[projectId]) return prev
      return { ...prev, [projectId]: true }
    })
  }, [])

  const handleLoadMoreSessions = useCallback(
    (projectId: string) => {
      setVisibleSessionsByProject((prev) => {
        const currentVisible = prev[projectId] ?? DEFAULT_VISIBLE_SESSIONS
        return {
          ...prev,
          [projectId]: currentVisible + DEFAULT_VISIBLE_SESSIONS
        }
      })
      handleEnsureExpanded(projectId)
    },
    [handleEnsureExpanded]
  )

  const handleRequestSession = useCallback((projectId: string, projectName: string) => {
    setSessionDialog({ projectId, projectName })
  }, [])

  const handleSessionCreated = useCallback(
    (projectId: string, sessionId: string) => {
      handleEnsureExpanded(projectId)
      handleOpenSession(projectId, sessionId)
    },
    [handleEnsureExpanded, handleOpenSession]
  )

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsResizing(true)
      resizeStateRef.current = {
        startX: event.clientX,
        startWidth: isSidebarCollapsed ? SIDEBAR_SIZE.collapsed : sidebarWidth
      }
    },
    [isSidebarCollapsed, sidebarWidth]
  )

  useEffect(() => {
    if (!isResizing) return

    const handleMove = (event: PointerEvent) => {
      if (!resizeStateRef.current) return
      event.preventDefault()

      const nextWidth =
        resizeStateRef.current.startWidth + (event.clientX - resizeStateRef.current.startX)

      if (nextWidth <= SIDEBAR_SIZE.collapseThreshold) {
        setIsCollapsed(true)
        return
      }

      setIsCollapsed(false)
      setSidebarWidth(clamp(nextWidth, SIDEBAR_SIZE.min, SIDEBAR_SIZE.max))
    }

    const handleUp = () => {
      setIsResizing(false)
    }

    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)

    return () => {
      document.body.style.cursor = ''
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [isResizing])

  const sidebarWidthValue = isMobile
    ? SIDEBAR_SIZE.default
    : isSidebarCollapsed
      ? SIDEBAR_SIZE.collapsed
      : sidebarWidth

  return (
    <div className='flex h-screen overflow-hidden bg-background'>
      {isMobile && isMobileOpen && (
        <button
          type='button'
          aria-label='Close sidebar'
          onClick={() => setIsMobileOpen(false)}
          className='fixed inset-0 z-30 bg-black/45'
        />
      )}
      {isMobile && !isMobileOpen && (
        <Button
          variant='secondary'
          size='icon-sm'
          className='fixed left-3 top-3 z-30 shadow-md md:hidden'
          onClick={() => setIsMobileOpen(true)}
          aria-label='Open sidebar'
        >
          <PanelLeft className='size-4' />
        </Button>
      )}
      <aside
        className={cn(
          'relative flex h-full shrink-0 flex-col border-r border-border/70 bg-sidebar motion-reduce:transition-none',
          isMobile
            ? 'fixed inset-y-0 left-0 z-40 max-w-[82vw] shadow-lg transition-transform duration-200 ease-out'
            : 'transition-[width] duration-200 ease-out',
          isMobile && (isMobileOpen ? 'translate-x-0' : '-translate-x-full'),
          !isMobile && isResizing && 'transition-none'
        )}
        style={{ width: sidebarWidthValue }}
        data-collapsed={isSidebarCollapsed}
      >
        <div className={cn('border-b border-border/70 py-2', isSidebarCollapsed ? 'px-2' : 'px-3')}>
          <div
            className={cn(
              'flex items-center gap-2',
              isSidebarCollapsed ? 'flex-col items-center' : 'flex-row'
            )}
          >
            <button
              type='button'
              className={cn(
                'rounded-md p-0.5 hover:bg-muted/50',
                isSidebarCollapsed ? 'flex w-full items-center justify-center' : 'flex items-center'
              )}
              onClick={() => navigate('/')}
              aria-label='Go to home'
            >
              <img
                src='/logo.png'
                alt='Lux'
                className={cn(
                  'shrink-0 rounded-md object-cover',
                  isSidebarCollapsed ? 'size-10' : 'size-9'
                )}
              />
            </button>

            <Button
              variant='secondary'
              size={isSidebarCollapsed ? 'icon-sm' : 'sm'}
              className={cn(!isSidebarCollapsed && 'ml-1')}
              onClick={() => setNewProjectOpen(true)}
              aria-label='New project'
            >
              <Plus className='size-3.5' />
              {!isSidebarCollapsed && 'New project'}
            </Button>

            <div
              className={cn(
                isSidebarCollapsed ? 'flex items-center' : 'ml-auto flex items-center gap-1.5'
              )}
            >
              <UserMenu />
              {isMobile && (
                <Button
                  variant='ghost'
                  size='icon-sm'
                  onClick={() => setIsMobileOpen(false)}
                  aria-label='Close sidebar'
                >
                  <X className='size-4' />
                </Button>
              )}
            </div>
          </div>
        </div>

        {!isSidebarCollapsed && (
          <div className='border-b border-border/70 px-3 py-2'>
            <div className='relative'>
              <Search className='pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
              <input
                type='text'
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder='Filter projects or sessions...'
                className='h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-ring'
              />
            </div>
          </div>
        )}

        <div className='flex-1 overflow-y-auto py-1.5'>
          {isLoading ? (
            <div className='space-y-2 px-2'>
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className='space-y-1 rounded-md border border-border/70 px-2 py-2'>
                  <Skeleton className='h-5 w-3/4' />
                  <Skeleton className='h-4 w-2/3' />
                </div>
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className='px-4 py-12 text-center'>
              <FolderKanban className='mx-auto mb-2 size-8 text-muted-foreground/40' />
              <p className='text-sm text-muted-foreground'>
                {search ? 'No matching projects' : 'No projects yet'}
              </p>
              <p className='mt-1 text-xs text-muted-foreground'>Create one to start a session.</p>
            </div>
          ) : (
            <div className='space-y-0.5'>
              {filteredProjects.map((project) => {
                const sessions = sortedProjectSessions.get(project.id) ?? []
                const visibleSessionCount =
                  visibleSessionsByProject[project.id] ?? DEFAULT_VISIBLE_SESSIONS
                const isExpanded = isProjectExpanded(project.id)

                return (
                  <ProjectGroup
                    key={project.id}
                    project={{ ...project, sessions }}
                    isExpanded={isExpanded}
                    isCollapsed={isSidebarCollapsed}
                    isProjectActive={activeProjectId === project.id}
                    activeSessionId={activeSessionId}
                    visibleSessionCount={visibleSessionCount}
                    onToggle={handleToggleProject}
                    onOpenProject={handleOpenProject}
                    onOpenSession={handleOpenSession}
                    onCreateSession={handleRequestSession}
                    onLoadMore={handleLoadMoreSessions}
                  />
                )
              })}
            </div>
          )}
        </div>

        {!isMobile && (
          <div
            role='separator'
            aria-orientation='vertical'
            aria-label='Resize sidebar'
            onPointerDown={handleResizeStart}
            className={cn(
              'absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none bg-transparent transition-colors',
              isResizing ? 'bg-border/80' : 'hover:bg-border/50'
            )}
          />
        )}
      </aside>

      <main className='min-w-0 flex-1 overflow-hidden'>
        <Outlet />
      </main>

      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        onOpenProject={handleOpenProject}
      />

      {sessionDialog && (
        <CreateSessionDialog
          open={!!sessionDialog}
          projectId={sessionDialog.projectId}
          projectName={sessionDialog.projectName}
          onOpenChange={(open) => {
            if (!open) setSessionDialog(null)
          }}
          onCreated={(sessionId) => {
            handleSessionCreated(sessionDialog.projectId, sessionId)
            setSessionDialog(null)
          }}
        />
      )}
    </div>
  )
}

function UserMenu() {
  const { logout } = useAuth()
  const user = useUser()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className='flex items-center gap-1.5 rounded-md p-1 transition-colors hover:bg-white/5 focus:outline-none'>
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.login}
              className='size-6 rounded-full ring-1 ring-border'
            />
          ) : (
            <span className='flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium'>
              {user.login[0]?.toUpperCase()}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align='end' className='w-56'>
        <DropdownMenuLabel className='font-normal'>
          <div className='flex items-center gap-2'>
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.login} className='size-8 rounded-full' />
            ) : (
              <span className='flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium'>
                {user.login[0]?.toUpperCase()}
              </span>
            )}

            <div className='flex min-w-0 flex-col'>
              <span className='truncate text-sm font-medium'>{user.name || user.login}</span>
              <span className='truncate text-xs text-muted-foreground'>@{user.login}</span>
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant='destructive' onClick={logout} className='cursor-pointer'>
          <LogOut className='size-4' />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
