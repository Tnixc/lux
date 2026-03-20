import { ChevronLeft, ChevronRight, FileCode } from 'lucide-react'
import { memo } from 'react'
import { cn } from '../lib/utils'
import type { GitReviewFile } from './git-review-types'

interface GitFileHeaderProps {
  file: GitReviewFile
  diffScope: 'unstaged' | 'staged'
  currentIndex?: number
  totalFiles?: number
  onPrevFile?: () => void
  onNextFile?: () => void
  onToggleStage: () => void
  busy?: boolean
}

function fileStatusBadge(status: string) {
  switch (status) {
    case 'added':
      return (
        <span className='px-1.5 py-0.5 text-xs rounded bg-emerald-500/20 text-emerald-400 font-medium'>
          Added
        </span>
      )
    case 'deleted':
      return (
        <span className='px-1.5 py-0.5 text-xs rounded bg-red-500/20 text-red-400 font-medium'>
          Deleted
        </span>
      )
    case 'renamed':
      return (
        <span className='px-1.5 py-0.5 text-xs rounded bg-blue-500/20 text-blue-400 font-medium'>
          Renamed
        </span>
      )
    case 'copied':
      return (
        <span className='px-1.5 py-0.5 text-xs rounded bg-blue-500/20 text-blue-400 font-medium'>
          Copied
        </span>
      )
    case 'untracked':
      return (
        <span className='px-1.5 py-0.5 text-xs rounded bg-emerald-500/20 text-emerald-400 font-medium'>
          Untracked
        </span>
      )
    default:
      return (
        <span className='px-1.5 py-0.5 text-xs rounded bg-amber-500/20 text-amber-300 font-medium'>
          Modified
        </span>
      )
  }
}

export const GitFileHeader = memo(function GitFileHeader({
  file,
  diffScope,
  currentIndex,
  totalFiles,
  onPrevFile,
  onNextFile,
  onToggleStage,
  busy = false
}: GitFileHeaderProps) {
  const showNavigation = currentIndex !== undefined && totalFiles !== undefined && totalFiles > 0
  const actionLabel = diffScope === 'unstaged' ? 'Stage file' : 'Unstage file'

  return (
    <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
      <div className='flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3'>
        <FileCode className='w-4 h-4 text-muted-foreground shrink-0' />

        <div className='min-w-0 basis-full sm:basis-auto'>
          <div className='font-mono text-xs sm:text-sm font-medium truncate'>{file.filename}</div>
          {file.previous_filename && file.previous_filename !== file.filename && (
            <div className='text-[10px] text-muted-foreground truncate'>
              renamed from {file.previous_filename}
            </div>
          )}
        </div>

        {fileStatusBadge(file.status)}

        <span className='text-xs text-muted-foreground shrink-0'>
          <span className='text-emerald-500'>+{file.additions}</span>{' '}
          <span className='text-red-500'>−{file.deletions}</span>
        </span>

        {showNavigation && (
          <div className='flex items-center gap-1 shrink-0 sm:ml-1'>
            <button
              onClick={onPrevFile}
              className='flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground'
              title='Previous file'
            >
              <ChevronLeft className='w-3.5 h-3.5' />
              <kbd className='hidden sm:inline-block px-1 py-0.5 bg-muted/60 rounded text-[9px] font-mono'>
                j
              </kbd>
            </button>
            <span className='text-xs text-muted-foreground tabular-nums px-1'>
              {currentIndex + 1}/{totalFiles}
            </span>
            <button
              onClick={onNextFile}
              className='flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground'
              title='Next file'
            >
              <kbd className='hidden sm:inline-block px-1 py-0.5 bg-muted/60 rounded text-[9px] font-mono'>
                k
              </kbd>
              <ChevronRight className='w-3.5 h-3.5' />
            </button>
          </div>
        )}
      </div>

      <button
        onClick={onToggleStage}
        disabled={busy}
        className={cn(
          'flex w-full items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed sm:w-auto',
          diffScope === 'unstaged'
            ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
            : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
        )}
      >
        {actionLabel}
      </button>
    </div>
  )
})
