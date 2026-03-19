import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronRight, ChevronDown, FileCode, FilePlus, FileMinus, FileEdit } from 'lucide-react'
import { cn } from '../lib/utils'
import type { GitReviewFile } from './git-review-types'

interface GitFileTreeProps {
  files: GitReviewFile[]
  selectedFileSha: string | null
  onSelectFile: (sha: string) => void
}

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: TreeNode[]
  file?: GitReviewFile
}

interface MutableTreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: Record<string, MutableTreeNode>
  file?: GitReviewFile
}

interface FlatItem {
  node: TreeNode
  depth: number
}

function buildTree(files: GitReviewFile[]): TreeNode[] {
  const root: Record<string, MutableTreeNode> = {}

  for (const file of files) {
    const parts = file.filename.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const path = parts.slice(0, i + 1).join('/')

      if (!current[part]) {
        current[part] = {
          name: part,
          path,
          type: isLast ? 'file' : 'folder',
          children: isLast ? undefined : {},
          file: isLast ? file : undefined
        }
      }

      if (!isLast) {
        const folder = current[part]
        if (!folder.children) {
          folder.children = {}
        }
        current = folder.children
      }
    }
  }

  function toArray(map: Record<string, MutableTreeNode>): TreeNode[] {
    return Object.values(map)
      .map((node) => ({
        name: node.name,
        path: node.path,
        type: node.type,
        file: node.file,
        children: node.children ? toArray(node.children) : undefined
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  }

  return toArray(root)
}

function flattenTree(nodes: TreeNode[], expandedFolders: Set<string>, depth = 0): FlatItem[] {
  const items: FlatItem[] = []

  for (const node of nodes) {
    items.push({ node, depth })

    if (node.type === 'folder' && expandedFolders.has(node.path) && node.children) {
      items.push(...flattenTree(node.children, expandedFolders, depth + 1))
    }
  }

  return items
}

function getFileIcon(file: GitReviewFile) {
  switch (file.status) {
    case 'added':
    case 'untracked':
      return <FilePlus className='w-4 h-4 text-emerald-500' />
    case 'deleted':
      return <FileMinus className='w-4 h-4 text-red-500' />
    case 'renamed':
    case 'copied':
      return <FileCode className='w-4 h-4 text-blue-400' />
    default:
      return <FileEdit className='w-4 h-4 text-amber-400' />
  }
}

function statusCode(status: string) {
  switch (status) {
    case 'added':
      return 'A'
    case 'deleted':
      return 'D'
    case 'renamed':
      return 'R'
    case 'copied':
      return 'C'
    case 'untracked':
      return 'U'
    default:
      return 'M'
  }
}

function statusTone(status: string) {
  switch (status) {
    case 'added':
    case 'untracked':
      return 'text-emerald-400'
    case 'deleted':
      return 'text-red-400'
    case 'renamed':
    case 'copied':
      return 'text-blue-300'
    default:
      return 'text-amber-300'
  }
}

const ROW_HEIGHT = 28

export function GitFileTree({ files, selectedFileSha, onSelectFile }: GitFileTreeProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const tree = useMemo(() => buildTree(files), [files])

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    const folders = new Set<string>()
    for (const file of files) {
      const parts = file.filename.split('/')
      for (let i = 1; i < parts.length; i++) {
        folders.add(parts.slice(0, i).join('/'))
      }
    }
    return folders
  })

  useEffect(() => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      for (const file of files) {
        const parts = file.filename.split('/')
        for (let i = 1; i < parts.length; i++) {
          next.add(parts.slice(0, i).join('/'))
        }
      }
      return next
    })
  }, [files])

  const flatItems = useMemo(() => flattenTree(tree, expandedFolders), [tree, expandedFolders])

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20
  })

  const selectedIndex = useMemo(() => {
    if (!selectedFileSha) return -1
    return flatItems.findIndex(
      (item) => item.node.type === 'file' && item.node.file?.sha === selectedFileSha
    )
  }, [flatItems, selectedFileSha])

  const lastScrolledToRef = useRef<string | null>(null)
  if (selectedFileSha && selectedIndex >= 0 && lastScrolledToRef.current !== selectedFileSha) {
    lastScrolledToRef.current = selectedFileSha
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(selectedIndex, {
        align: 'center',
        behavior: 'auto'
      })
    })
  }

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  if (flatItems.length === 0) {
    return (
      <div className='h-full flex items-center justify-center text-xs text-muted-foreground'>
        No files in this scope.
      </div>
    )
  }

  return (
    <nav ref={parentRef} className='h-full overflow-auto themed-scrollbar'>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = flatItems[virtualRow.index]
          if (!item) return null

          const { node, depth } = item

          if (node.type === 'folder') {
            const isExpanded = expandedFolders.has(node.path)

            return (
              <div
                key={node.path}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`
                }}
              >
                <button
                  onClick={() => toggleFolder(node.path)}
                  className='w-full flex items-center gap-1 px-2 text-sm hover:bg-muted/40 transition-colors text-left h-full'
                  style={{ paddingLeft: `${depth * 12 + 8}px` }}
                >
                  {isExpanded ? (
                    <ChevronDown className='w-4 h-4 text-muted-foreground shrink-0' />
                  ) : (
                    <ChevronRight className='w-4 h-4 text-muted-foreground shrink-0' />
                  )}
                  <span className='truncate flex-1'>{node.name}</span>
                </button>
              </div>
            )
          }

          const file = node.file
          if (!file) return null

          const isSelected = file.sha === selectedFileSha

          return (
            <div
              key={node.path}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`
              }}
            >
              <button
                onClick={() => onSelectFile(file.sha)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 text-sm transition-colors text-left h-full hover:bg-muted/40',
                  isSelected && 'bg-muted'
                )}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
              >
                {getFileIcon(file)}
                <span className='truncate flex-1'>{node.name}</span>
                <div className='flex items-center gap-2 shrink-0'>
                  <span className={cn('text-[10px] font-semibold', statusTone(file.status))}>
                    {statusCode(file.status)}
                  </span>
                  {(file.additions > 0 || file.deletions > 0) && (
                    <span className='text-[10px] tabular-nums text-muted-foreground'>
                      <span className='text-emerald-500'>+{file.additions}</span>{' '}
                      <span className='text-red-500'>-{file.deletions}</span>
                    </span>
                  )}
                </div>
              </button>
            </div>
          )
        })}
      </div>
    </nav>
  )
}
