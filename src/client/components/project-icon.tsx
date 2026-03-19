import { FolderKanban } from 'lucide-react'
import { cn } from '../lib/utils'

export function ProjectIcon({
  icon,
  name,
  className,
  iconClassName
}: {
  icon?: string | null
  name?: string
  className?: string
  iconClassName?: string
}) {
  const trimmed = icon?.trim()
  if (trimmed) {
    return (
      <span
        className={cn(
          'flex items-center justify-center rounded-md bg-muted/40 text-sm font-medium leading-none',
          className
        )}
        title={name}
      >
        {trimmed.slice(0, 2)}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'flex items-center justify-center rounded-md bg-muted/40 text-muted-foreground leading-none',
        className
      )}
      title={name}
    >
      <FolderKanban className={cn('size-4', iconClassName)} />
    </span>
  )
}
