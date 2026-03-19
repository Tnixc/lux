import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from 'react'

export type Tab =
  | { id: 'home'; type: 'home'; label: 'Home' }
  | {
      id: string
      type: 'project'
      projectId: string
      label: string
    }
  | {
      id: string
      type: 'session'
      projectId: string
      sessionId: string
      label: string
      status?: string
    }

interface TabState {
  tabs: Tab[]
  activeTabId: string
}

interface TabContextValue {
  tabs: Tab[]
  activeTabId: string
  activeTab: Tab | undefined
  openProjectTab: (projectId: string, label: string) => void
  openSessionTab: (projectId: string, sessionId: string, label: string) => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateSessionStatus: (sessionId: string, status: string) => void
  closeProjectTabs: (projectId: string) => void
  closeSessionTab: (sessionId: string) => void
}

const STORAGE_KEY = 'lux_tabs'

const HOME_TAB: Tab = {
  id: 'home',
  type: 'home',
  label: 'Home'
}

const DEFAULT_STATE: TabState = {
  tabs: [HOME_TAB],
  activeTabId: 'home'
}

function loadTabState(): TabState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as TabState
      // Ensure home tab always exists
      const hasHome = parsed.tabs.some((t) => t.id === 'home')
      if (!hasHome) {
        parsed.tabs.unshift(HOME_TAB)
      }
      // Ensure active tab exists
      const activeExists = parsed.tabs.some((t) => t.id === parsed.activeTabId)
      if (!activeExists) {
        parsed.activeTabId = 'home'
      }
      return parsed
    }
  } catch {
    // ignore
  }
  return DEFAULT_STATE
}

function saveTabState(state: TabState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

const TabContext = createContext<TabContextValue | null>(null)

export function useTabContext() {
  const ctx = useContext(TabContext)
  if (!ctx) {
    throw new Error('useTabContext must be used within TabProvider')
  }
  return ctx
}

interface TabProviderProps {
  children: ReactNode
}

export function TabProvider({ children }: TabProviderProps) {
  const [state, setState] = useState<TabState>(loadTabState)

  // Save to localStorage whenever state changes
  useEffect(() => {
    saveTabState(state)
  }, [state])

  const openProjectTab = useCallback((projectId: string, label: string) => {
    const id = `project-${projectId}`
    setState((prev) => {
      const existing = prev.tabs.find((t) => t.id === id)
      if (existing) {
        return { ...prev, activeTabId: id }
      }
      const tab: Tab = { id, type: 'project', projectId, label }
      return { tabs: [...prev.tabs, tab], activeTabId: id }
    })
  }, [])

  const openSessionTab = useCallback((projectId: string, sessionId: string, label: string) => {
    const id = `session-${sessionId}`
    setState((prev) => {
      const existing = prev.tabs.find((t) => t.id === id)
      if (existing) {
        return { ...prev, activeTabId: id }
      }
      const tab: Tab = { id, type: 'session', projectId, sessionId, label }
      return { tabs: [...prev.tabs, tab], activeTabId: id }
    })
  }, [])

  const closeTab = useCallback((tabId: string) => {
    // Can't close home tab
    if (tabId === 'home') return

    setState((prev) => {
      const tabIndex = prev.tabs.findIndex((t) => t.id === tabId)
      if (tabIndex === -1) return prev

      const newTabs = prev.tabs.filter((t) => t.id !== tabId)
      let newActiveId = prev.activeTabId

      // If closing active tab, switch to adjacent tab
      if (prev.activeTabId === tabId) {
        const newIndex = Math.min(tabIndex, newTabs.length - 1)
        newActiveId = newTabs[newIndex].id
      }

      return { tabs: newTabs, activeTabId: newActiveId }
    })
  }, [])

  const setActiveTab = useCallback((tabId: string) => {
    setState((prev) => {
      if (prev.tabs.some((t) => t.id === tabId)) {
        return { ...prev, activeTabId: tabId }
      }
      return prev
    })
  }, [])

  const updateSessionStatus = useCallback((sessionId: string, status: string) => {
    const tabId = `session-${sessionId}`
    setState((prev) => {
      const tabIndex = prev.tabs.findIndex((t) => t.id === tabId)
      if (tabIndex === -1) return prev

      const tab = prev.tabs[tabIndex]
      if (tab.type !== 'session') return prev

      const newTabs = [...prev.tabs]
      newTabs[tabIndex] = { ...tab, status }
      return { ...prev, tabs: newTabs }
    })
  }, [])

  const closeProjectTabs = useCallback((projectId: string) => {
    setState((prev) => {
      const removedIds = new Set(
        prev.tabs
          .filter(
            (t) =>
              (t.type === 'project' && t.projectId === projectId) ||
              (t.type === 'session' && t.projectId === projectId)
          )
          .map((t) => t.id)
      )

      if (removedIds.size === 0) return prev

      const newTabs = prev.tabs.filter((t) => !removedIds.has(t.id))
      let newActiveId = prev.activeTabId

      if (removedIds.has(prev.activeTabId)) {
        // Find the index of the first removed tab to pick an adjacent one
        const firstRemovedIndex = prev.tabs.findIndex((t) => removedIds.has(t.id))
        const newIndex = Math.min(firstRemovedIndex, newTabs.length - 1)
        newActiveId = newTabs[newIndex].id
      }

      return { tabs: newTabs, activeTabId: newActiveId }
    })
  }, [])

  const closeSessionTab = useCallback(
    (sessionId: string) => {
      closeTab(`session-${sessionId}`)
    },
    [closeTab]
  )

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)

  const value: TabContextValue = {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeTab,
    openProjectTab,
    openSessionTab,
    closeTab,
    setActiveTab,
    updateSessionStatus,
    closeProjectTabs,
    closeSessionTab
  }

  return <TabContext.Provider value={value}>{children}</TabContext.Provider>
}
