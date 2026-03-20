import { useState, useCallback } from 'react'
import { FolderOpen, FolderKanban, GitBranch, Plus, Trash2, Loader2, Search } from 'lucide-react'
import { useDirectories, useProjects, useCreateProject, useDeleteProject } from '../lib/api'
import { useTabContext } from '../contexts/tabs'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog'
import { Skeleton } from './ui/skeleton'
import { ProjectIcon } from './project-icon'

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  directoryPath: string
  directoryName: string
}

function CreateProjectDialog({
  open,
  onOpenChange,
  directoryPath,
  directoryName
}: CreateProjectDialogProps) {
  const [name, setName] = useState(directoryName)
  const createProject = useCreateProject()
  const navigate = useNavigate()
  const { openProjectTab } = useTabContext()

  const handleCreate = useCallback(async () => {
    const result = await createProject.mutateAsync({
      path: directoryPath,
      name: name.trim() || undefined
    })
    onOpenChange(false)
    openProjectTab(result.id, result.name)
    navigate(`/projects/${result.id}/sessions`)
  }, [createProject, directoryPath, name, onOpenChange, openProjectTab, navigate])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogTitle>Add as Project</DialogTitle>
        <DialogDescription className='font-mono text-xs break-all'>
          {directoryPath}
        </DialogDescription>
        <div className='space-y-3'>
          <div>
            <label className='text-xs font-medium text-muted-foreground mb-1 block'>
              Project Name
            </label>
            <input
              type='text'
              value={name}
              onChange={(e) => setName(e.target.value)}
              className='w-full h-9 px-3 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring'
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !createProject.isPending) {
                  handleCreate()
                }
              }}
            />
          </div>
          <Button onClick={handleCreate} disabled={createProject.isPending} className='w-full'>
            {createProject.isPending && <Loader2 className='w-4 h-4 animate-spin' />}
            Create Project
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className='divide-y divide-border'>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className='flex items-center gap-3 px-4 py-3'>
          <Skeleton className='w-5 h-5 rounded shrink-0' />
          <div className='flex-1 space-y-1.5'>
            <Skeleton className='h-4 w-[40%]' />
            <Skeleton className='h-3 w-[60%]' />
          </div>
          <Skeleton className='h-8 w-16 rounded-md' />
        </div>
      ))}
    </div>
  )
}

function DirectoryBrowser() {
  const { data, isLoading } = useDirectories()
  const [search, setSearch] = useState('')
  const [dialogDir, setDialogDir] = useState<{
    path: string
    name: string
  } | null>(null)
  const navigate = useNavigate()
  const { openProjectTab } = useTabContext()

  const entries = data?.entries ?? []
  const filtered = search
    ? entries.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    : entries

  const handleOpenProject = useCallback(
    (projectId: string, name: string) => {
      openProjectTab(projectId, name)
      navigate(`/projects/${projectId}/sessions`)
    },
    [openProjectTab, navigate]
  )

  return (
    <div className='flex flex-col h-full border border-border rounded-lg bg-card/30 overflow-hidden'>
      {/* Header */}
      <div className='px-4 py-3 border-b border-border shrink-0'>
        <div className='flex items-center justify-between mb-2'>
          <h2 className='text-sm font-semibold'>Directories</h2>
          {data?.roots && data.roots.length > 0 && (
            <span className='text-[11px] font-mono text-muted-foreground truncate ml-2'>
              {data.roots.join(':')}
            </span>
          )}
        </div>
        <div className='relative'>
          <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground' />
          <input
            type='text'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Filter directories...'
            className='w-full h-8 pl-8 pr-3 rounded-md border border-border bg-background text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring'
          />
        </div>
      </div>

      {/* List */}
      <div className='flex-1 overflow-y-auto'>
        {isLoading ? (
          <ListSkeleton />
        ) : filtered.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-12 text-muted-foreground'>
            <FolderOpen className='w-8 h-8 mb-2 opacity-40' />
            <p className='text-xs'>
              {search ? 'No directories match your search' : 'No directories found'}
            </p>
          </div>
        ) : (
          <div className='divide-y divide-border'>
            {filtered.map((entry) => (
              <div
                key={entry.path}
                className='flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors'
              >
                <FolderOpen className='w-4 h-4 shrink-0 text-muted-foreground' />
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2'>
                    <span className='text-sm font-medium truncate'>{entry.name}</span>
                    {entry.isGitRepo && (
                      <span className='inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-green-500/15 text-green-500 border border-green-500/30'>
                        <GitBranch className='w-3 h-3' />
                        git
                      </span>
                    )}
                  </div>
                  <p className='text-[11px] text-muted-foreground truncate'>{entry.path}</p>
                </div>
                {entry.isProject && entry.projectId ? (
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => handleOpenProject(entry.projectId!, entry.name)}
                  >
                    Open
                  </Button>
                ) : (
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => setDialogDir({ path: entry.path, name: entry.name })}
                  >
                    <Plus className='w-3.5 h-3.5' />
                    <span className='hidden sm:inline'>Add as Project</span>
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Project Dialog */}
      {dialogDir && (
        <CreateProjectDialog
          open={!!dialogDir}
          onOpenChange={(open) => {
            if (!open) setDialogDir(null)
          }}
          directoryPath={dialogDir.path}
          directoryName={dialogDir.name}
        />
      )}
    </div>
  )
}

function ProjectsList() {
  const { data, isLoading } = useProjects()
  const deleteProject = useDeleteProject()
  const navigate = useNavigate()
  const { openProjectTab } = useTabContext()

  const projects = data?.projects ?? []

  const handleOpen = useCallback(
    (id: string, name: string) => {
      openProjectTab(id, name)
      navigate(`/projects/${id}/sessions`)
    },
    [openProjectTab, navigate]
  )

  const handleDelete = useCallback(
    (id: string, name: string) => {
      if (!confirm(`Delete project "${name}"? This cannot be undone.`)) return
      deleteProject.mutate(id)
    },
    [deleteProject]
  )

  return (
    <div className='flex flex-col h-full border border-border rounded-lg bg-card/30 overflow-hidden'>
      {/* Header */}
      <div className='px-4 py-3 border-b border-border shrink-0'>
        <div className='flex items-center gap-2'>
          <h2 className='text-sm font-semibold'>Projects</h2>
          {!isLoading && (
            <span className='text-[11px] text-muted-foreground'>({projects.length})</span>
          )}
        </div>
      </div>

      {/* List */}
      <div className='flex-1 overflow-y-auto'>
        {isLoading ? (
          <ListSkeleton />
        ) : projects.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-12 text-muted-foreground'>
            <FolderKanban className='w-8 h-8 mb-2 opacity-40' />
            <p className='text-xs'>No projects yet</p>
            <p className='text-[11px] mt-1'>Add a directory as a project to get started</p>
          </div>
        ) : (
          <div className='divide-y divide-border'>
            {projects.map((project) => (
              <div
                key={project.id}
                className='flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors'
              >
                <ProjectIcon icon={project.icon} name={project.name} className='size-6' />
                <div className='flex-1 min-w-0'>
                  <span className='text-sm font-medium truncate block'>{project.name}</span>
                  <p className='text-[11px] text-muted-foreground truncate'>{project.path}</p>
                </div>
                <div className='flex items-center gap-1 shrink-0'>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => handleOpen(project.id, project.name)}
                  >
                    Open
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    className='text-muted-foreground hover:text-destructive'
                    onClick={() => handleDelete(project.id, project.name)}
                    disabled={deleteProject.isPending}
                  >
                    <Trash2 className='w-3.5 h-3.5' />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function Home() {
  return (
    <div className='h-full bg-background p-4 overflow-auto'>
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-4 h-full'>
        <div className='order-2 lg:order-1 min-h-0'>
          <DirectoryBrowser />
        </div>
        <div className='order-1 lg:order-2 min-h-0'>
          <ProjectsList />
        </div>
      </div>
    </div>
  )
}
