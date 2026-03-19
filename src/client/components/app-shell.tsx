import { useCallback, useEffect } from 'react'
import { useParams, useNavigate, Outlet } from 'react-router-dom'
import { X, Home as HomeIcon, FolderKanban, Terminal, LogOut } from 'lucide-react'
import { cn } from '../lib/utils'
import { useTabContext, type Tab } from '../contexts/tabs'
import { useAuth, useUser } from '../contexts/auth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './ui/dropdown-menu'

function sessionStatusDot(status?: string) {
  switch (status) {
    case 'running':
      return 'bg-green-500'
    case 'starting':
      return 'bg-yellow-500 animate-pulse'
    case 'stopped':
      return 'bg-gray-500'
    case 'error':
    case 'missing':
      return 'bg-red-500'
    case 'disconnected':
      return 'bg-orange-500'
    default:
      return 'bg-gray-500'
  }
}

function getTabHref(tab: Tab): string {
  if (tab.type === 'home') return '/'
  if (tab.type === 'project') return `/projects/${tab.projectId}`
  if (tab.type === 'session') return `/projects/${tab.projectId}/sessions/${tab.sessionId}`
  return '/'
}

export function AppShell() {
  const { tabs, activeTabId, setActiveTab, closeTab, openProjectTab, openSessionTab } =
    useTabContext()
  const navigate = useNavigate()
  const params = useParams<{
    projectId: string
    sessionId: string
  }>()

  // URL → Tab sync
  useEffect(() => {
    if (params.sessionId && params.projectId) {
      const tabId = `session-${params.sessionId}`
      if (activeTabId !== tabId) {
        const exists = tabs.find((t) => t.id === tabId)
        if (!exists) {
          openSessionTab(params.projectId, params.sessionId, `Session`)
        } else {
          setActiveTab(tabId)
        }
      }
    } else if (params.projectId) {
      const tabId = `project-${params.projectId}`
      if (activeTabId !== tabId) {
        const exists = tabs.find((t) => t.id === tabId)
        if (!exists) {
          openProjectTab(params.projectId, 'Project')
        } else {
          setActiveTab(tabId)
        }
      }
    } else {
      if (activeTabId !== 'home') {
        setActiveTab('home')
      }
    }
  }, [params.projectId, params.sessionId])

  // Tab click → navigate
  const handleTabSelect = useCallback(
    (tab: Tab) => {
      navigate(getTabHref(tab))
    },
    [navigate]
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const index = parseInt(e.key) - 1
        if (tabs[index]) handleTabSelect(tabs[index])
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        if (activeTabId !== 'home') {
          e.preventDefault()
          const currentTab = tabs.find((t) => t.id === activeTabId)
          closeTab(activeTabId)
          // Navigate to home if closing active tab
          if (currentTab) {
            const remaining = tabs.filter((t) => t.id !== activeTabId)
            if (remaining.length > 0) {
              navigate(
                getTabHref(remaining[Math.min(tabs.indexOf(currentTab), remaining.length - 1)])
              )
            }
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [tabs, activeTabId, handleTabSelect, closeTab, navigate])

  return (
    <div className='h-screen flex flex-col overflow-hidden bg-background'>
      {/* Tab Bar */}
      <div className='h-9 bg-[#1a1a1a] flex items-center shrink-0 border-b border-border/50'>
        {/* Logo */}
        <div className='h-full flex items-center px-3 shrink-0'>
          <span className='text-sm font-bold tracking-tight text-foreground'>lux</span>
        </div>

        {/* Tabs */}
        <div className='h-full flex-1 flex items-center gap-0.5 overflow-x-auto hide-scrollbar'>
          {tabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onSelect={() => handleTabSelect(tab)}
              onClose={() => closeTab(tab.id)}
            />
          ))}
        </div>

        {/* User menu */}
        <div className='h-full flex items-center pr-3'>
          <UserMenu />
        </div>
      </div>

      {/* Content */}
      <div className='flex-1 overflow-hidden'>
        <Outlet />
      </div>
    </div>
  )
}
interface TabItemProps {
  tab: Tab
  isActive: boolean
  onSelect: () => void
  onClose: () => void
}

function TabItem({ tab, isActive, onSelect, onClose }: TabItemProps) {
  const isHome = tab.type === 'home'

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onClose()
    },
    [onClose]
  )

  const handleMiddleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 && !isHome) {
        e.preventDefault()
        onClose()
      }
    },
    [isHome, onClose]
  )

  return (
    <div
      role='button'
      tabIndex={0}
      onClick={onSelect}
      onMouseDown={handleMiddleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'group flex items-center gap-1.5 h-7 px-2.5 text-xs font-medium rounded-md transition-colors shrink-0 max-w-[180px] cursor-pointer',
        isActive
          ? 'bg-background text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
      )}
    >
      {tab.type === 'home' && <HomeIcon className='w-3 h-3 shrink-0' />}
      {tab.type === 'project' && <FolderKanban className='w-3 h-3 shrink-0' />}
      {tab.type === 'session' && (
        <div className='flex items-center gap-1 shrink-0'>
          <Terminal className='w-3 h-3' />
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              sessionStatusDot(tab.type === 'session' ? tab.status : undefined)
            )}
          />
        </div>
      )}

      <span className='truncate'>{tab.label}</span>

      {!isHome && (
        <button
          onClick={handleClose}
          className={cn(
            'p-0.5 rounded hover:bg-white/10 transition-opacity shrink-0',
            isActive
              ? 'opacity-60 hover:opacity-100'
              : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
          )}
        >
          <X className='w-3 h-3' />
        </button>
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
        <button className='flex items-center gap-1.5 p-1 rounded-md hover:bg-white/5 transition-colors focus:outline-none'>
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.login}
              className='w-5 h-5 rounded-full ring-1 ring-border'
            />
          ) : (
            <span className='w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium'>
              {user.login[0].toUpperCase()}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-48'>
        <DropdownMenuLabel className='font-normal'>
          <div className='flex items-center gap-2'>
            {user.avatarUrl && (
              <img src={user.avatarUrl} alt={user.login} className='w-8 h-8 rounded-full' />
            )}
            <div className='flex flex-col'>
              <span className='text-sm font-medium'>{user.name}</span>
              {user.name && <span className='text-xs text-muted-foreground'>@{user.login}</span>}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant='destructive' onClick={logout} className='cursor-pointer'>
          <LogOut className='w-4 h-4' />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
