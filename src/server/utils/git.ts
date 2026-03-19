import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { createError } from 'h3'

const execFileAsync = promisify(execFile)

export interface GitStatusSnapshot {
  snapshotId: string
  head: { ref: string | null; sha: string | null }
  counts: { staged: number; unstaged: number; untracked: number; conflicted: number }
  dirty: boolean
}

export interface GitDiffFile {
  filename: string
  previous_filename: string | null
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked'
  sha: string
  additions: number
  deletions: number
  changes: number
  patch: string
}

export interface GitCommitLogEntry {
  sha: string
  shortSha: string
  authorName: string
  authorEmail: string
  authoredAt: string
  subject: string
  refs: string
}

export async function isGitRepo(repoPath: string) {
  try {
    const gitDir = path.join(repoPath, '.git')
    const info = await stat(gitDir)
    return info.isDirectory() || info.isFile()
  } catch {
    return false
  }
}

export async function getGitStatus(repoPath: string): Promise<GitStatusSnapshot> {
  const raw = await runGit(repoPath, ['status', '--porcelain=v2', '-z', '--branch'])
  const snapshotId = createHash('sha256').update(raw).digest('hex')
  const entries = raw.split('\0').filter(Boolean)

  let headRef: string | null = null
  let headSha: string | null = null
  const counts = { staged: 0, unstaged: 0, untracked: 0, conflicted: 0 }

  for (const entry of entries) {
    if (entry.startsWith('# ')) {
      if (entry.startsWith('# branch.head ')) {
        headRef = entry.replace('# branch.head ', '').trim() || null
      }
      if (entry.startsWith('# branch.oid ')) {
        const sha = entry.replace('# branch.oid ', '').trim()
        headSha = sha === '(initial)' ? null : sha
      }
      continue
    }

    const code = entry[0]
    if (code === '?') {
      counts.untracked += 1
      continue
    }
    if (code === 'u') {
      counts.conflicted += 1
      continue
    }
    if (code === '1' || code === '2') {
      const fields = entry.split(' ')
      const xy = fields[1] || ''
      const x = xy[0] || '.'
      const y = xy[1] || '.'
      if (x !== '.' && x !== '?') counts.staged += 1
      if (y !== '.' && y !== '?') counts.unstaged += 1
      if (x === 'U' || y === 'U') counts.conflicted += 1
    }
  }

  const dirty =
    counts.staged > 0 || counts.unstaged > 0 || counts.untracked > 0 || counts.conflicted > 0

  return { snapshotId, head: { ref: headRef, sha: headSha }, counts, dirty }
}

export async function getGitDiff(
  repoPath: string,
  options: { scope?: 'unstaged' | 'staged' | 'all'; base?: string; paths?: string[] }
) {
  const scope = options.scope ?? 'unstaged'
  const base = options.base ?? 'HEAD'
  const paths = sanitizePaths(options.paths ?? [])
  validateRef(base)

  const statusSnapshot = await getGitStatus(repoPath)

  const diffArgs = buildDiffArgs(scope, base, paths, false)
  const patchOutput = await runGit(repoPath, diffArgs, true)
  const numstatOutput = await runGit(repoPath, buildDiffArgs(scope, base, paths, true), true)

  const numstat = parseNumstat(numstatOutput)
  const files = parseDiffPatches(patchOutput, statusSnapshot.snapshotId, numstat)

  if (scope === 'unstaged' || scope === 'all') {
    const untracked = await listUntracked(repoPath, paths)
    for (const filePath of untracked) {
      const patch = await runGit(repoPath, ['diff', '--no-index', '/dev/null', filePath], true)
      const additions = countPatchAdds(patch)
      const sha = buildSyntheticSha(statusSnapshot.snapshotId, filePath)
      files.push({
        filename: filePath,
        previous_filename: null,
        status: 'untracked',
        sha,
        additions,
        deletions: 0,
        changes: additions,
        patch
      })
    }
  }

  return {
    snapshotId: statusSnapshot.snapshotId,
    scope,
    base,
    files
  }
}

export async function getGitBranches(repoPath: string) {
  const output = await runGit(repoPath, [
    'branch',
    '-a',
    '--format=%(refname:short) %(objectname:short) %(HEAD)'
  ])
  const lines = output.split(/\r?\n/).filter(Boolean)
  let current = ''
  const branches = lines.map((line) => {
    const parts = line.trim().split(/\s+/)
    const name = parts[0] || ''
    const sha = parts[1] || ''
    const isCurrent = parts[2] === '*'
    if (isCurrent) current = name
    return { name, sha, current: isCurrent }
  })
  return { current, branches }
}

export async function createGitBranch(
  repoPath: string,
  options: { name: string; from?: string; checkout?: boolean }
) {
  const branchName = options.name.trim()
  if (!branchName) {
    throw createError({ statusCode: 400, statusMessage: 'branch_name_required' })
  }

  try {
    await runGit(repoPath, ['check-ref-format', '--branch', branchName])
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'invalid_branch_name' })
  }

  const checkout = options.checkout ?? true
  const fromRef = options.from?.trim()
  if (fromRef) {
    validateRef(fromRef)
  }

  const args = checkout ? ['checkout', '-b', branchName] : ['branch', branchName]
  if (fromRef) {
    args.push(fromRef)
  }

  try {
    const output = await runGit(repoPath, args)
    return { ok: true as const, branch: branchName, checkedOut: checkout, output: output.trim() }
  } catch (err) {
    throwGitMutationError('git_create_branch_failed', err)
  }
}

export async function getGitCommitLog(repoPath: string, options?: { limit?: number }) {
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100)
  const format = '%H%x00%h%x00%an%x00%ae%x00%aI%x00%s%x00%D%x1e'

  try {
    const output = await runGit(repoPath, ['log', `-n${limit}`, `--pretty=format:${format}`])
    const entries = output
      .split('\x1e')
      .map((record) => record.trim())
      .filter(Boolean)
      .map((record) => {
        const [sha, shortSha, authorName, authorEmail, authoredAt, subject, refs] =
          record.split('\x00')
        return {
          sha: sha || '',
          shortSha: shortSha || '',
          authorName: authorName || '',
          authorEmail: authorEmail || '',
          authoredAt: authoredAt || '',
          subject: subject || '',
          refs: refs || ''
        } satisfies GitCommitLogEntry
      })

    return { entries }
  } catch (err) {
    const message = getGitErrorMessage(err)
    if (
      message.includes('does not have any commits yet') ||
      message.includes('your current branch does not have any commits yet')
    ) {
      return { entries: [] as GitCommitLogEntry[] }
    }
    throw err
  }
}

export async function getGitFileContent(repoPath: string, ref: string, filePath: string) {
  const safePaths = sanitizePaths([filePath])
  if (!safePaths[0]) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_path' })
  }
  const safePath = safePaths[0]

  if (ref === 'WORKTREE') {
    const fullPath = path.join(repoPath, safePath)
    return readFile(fullPath, 'utf8')
  }
  if (ref === 'INDEX') {
    return runGit(repoPath, ['show', `:${safePath}`])
  }
  validateRef(ref)
  return runGit(repoPath, ['show', `${ref}:${safePath}`])
}

export async function stageGitPaths(repoPath: string, paths: string[] = []) {
  const safePaths = sanitizePaths(paths)
  try {
    if (safePaths.length === 0) {
      await runGit(repoPath, ['add', '-A'])
    } else {
      await runGit(repoPath, ['add', '--', ...safePaths])
    }
    return { ok: true as const }
  } catch (err) {
    throwGitMutationError('git_stage_failed', err)
  }
}

export async function unstageGitPaths(repoPath: string, paths: string[] = []) {
  const safePaths = sanitizePaths(paths)
  const args = ['reset', '--quiet']
  if (safePaths.length > 0) {
    args.push('HEAD', '--', ...safePaths)
  }

  try {
    await runGit(repoPath, args)
    return { ok: true as const }
  } catch (err) {
    throwGitMutationError('git_unstage_failed', err)
  }
}

export async function commitGitChanges(repoPath: string, message: string) {
  const trimmed = message.trim()
  if (!trimmed) {
    throw createError({ statusCode: 400, statusMessage: 'commit_message_required' })
  }

  try {
    const output = await runGit(repoPath, ['commit', '-m', trimmed])
    return { ok: true as const, output: output.trim() }
  } catch (err) {
    throwGitMutationError('git_commit_failed', err)
  }
}

export async function pushGitChanges(repoPath: string) {
  try {
    const output = await runGit(repoPath, ['push'])
    return { ok: true as const, output: output.trim() }
  } catch (err) {
    throwGitMutationError('git_push_failed', err)
  }
}

function buildDiffArgs(scope: string, base: string, paths: string[], numstat: boolean): string[] {
  const args = ['diff', '--find-renames', '--no-ext-diff', '--no-color']
  if (numstat) {
    args.push('--numstat', '-z')
  } else {
    args.push('--patch')
  }

  if (scope === 'staged') {
    args.push('--cached')
  } else if (scope === 'all') {
    args.push(base)
  }

  if (paths.length > 0) {
    args.push('--', ...paths)
  }

  return args
}

async function listUntracked(repoPath: string, paths: string[]) {
  const args = ['ls-files', '--others', '--exclude-standard', '-z']
  if (paths.length > 0) {
    args.push('--', ...paths)
  }
  const output = await runGit(repoPath, args)
  return output.split('\0').filter(Boolean)
}

function parseNumstat(raw: string) {
  const tokens = raw.split('\0').filter((t) => t.length > 0)
  const map = new Map<
    string,
    { additions: number; deletions: number; previousPath: string | null }
  >()
  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]
    const parts = token.split('\t')
    if (parts.length < 3) {
      i += 1
      continue
    }
    const [addStr, delStr, ...pathParts] = parts
    const additions = addStr === '-' ? 0 : Number.parseInt(addStr, 10) || 0
    const deletions = delStr === '-' ? 0 : Number.parseInt(delStr, 10) || 0
    const firstPath = pathParts.join('\t')
    let pathValue = firstPath
    let previousPath: string | null = null
    if (tokens[i + 1] && !tokens[i + 1].includes('\t')) {
      previousPath = firstPath
      pathValue = tokens[i + 1]
      i += 1
    }
    map.set(pathValue, { additions, deletions, previousPath })
    i += 1
  }
  return map
}

function parseDiffPatches(
  raw: string,
  snapshotId: string,
  numstat: Map<string, { additions: number; deletions: number; previousPath: string | null }>
) {
  const lines = raw.split(/\r?\n/)
  const files: GitDiffFile[] = []
  let current: string[] = []

  const flush = () => {
    if (current.length === 0) return
    const block = current.join('\n')
    const meta = parseDiffHeader(current)
    const stat = numstat.get(meta.filename) ||
      (meta.previous_filename ? numstat.get(meta.previous_filename) : undefined) || {
        additions: 0,
        deletions: 0,
        previousPath: null
      }

    const additions = stat.additions
    const deletions = stat.deletions
    files.push({
      filename: meta.filename,
      previous_filename: meta.previous_filename,
      status: meta.status,
      sha: buildSyntheticSha(snapshotId, meta.filename),
      additions,
      deletions,
      changes: additions + deletions,
      patch: block
    })
    current = []
  }

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flush()
      current.push(line)
      continue
    }
    if (current.length > 0) {
      current.push(line)
    }
  }
  flush()
  return files
}

function parseDiffHeader(lines: string[]) {
  const diffLine = lines.find((line) => line.startsWith('diff --git ')) || ''
  const match = diffLine.match(/^diff --git a\/(.+) b\/(.+)$/)
  const aPath = match?.[1] || ''
  const bPath = match?.[2] || ''
  let status: GitDiffFile['status'] = 'modified'
  let previous_filename: string | null = null
  let filename = bPath || aPath

  for (const line of lines) {
    if (line.startsWith('new file mode')) {
      status = 'added'
      filename = bPath
    } else if (line.startsWith('deleted file mode')) {
      status = 'deleted'
      filename = aPath
    } else if (line.startsWith('rename from')) {
      status = 'renamed'
      previous_filename = line.replace('rename from', '').trim()
    } else if (line.startsWith('rename to')) {
      filename = line.replace('rename to', '').trim()
    } else if (line.startsWith('copy from')) {
      status = 'copied'
      previous_filename = line.replace('copy from', '').trim()
    } else if (line.startsWith('copy to')) {
      filename = line.replace('copy to', '').trim()
    }
  }

  if (status === 'modified' && aPath === '/dev/null') {
    status = 'added'
  }
  if (status === 'modified' && bPath === '/dev/null') {
    status = 'deleted'
  }

  return { filename, previous_filename, status }
}

function buildSyntheticSha(snapshotId: string, filename: string) {
  const fileHash = createHash('sha256').update(filename).digest('hex')
  return `snapshot:${snapshotId}:${fileHash}`
}

function countPatchAdds(patch: string) {
  const lines = patch.split(/\r?\n/)
  let additions = 0
  for (const line of lines) {
    if (line.startsWith('+++')) continue
    if (line.startsWith('+')) additions += 1
  }
  return additions
}

function throwGitMutationError(fallback: string, err: unknown): never {
  const message = getGitErrorMessage(err) || fallback
  throw createError({ statusCode: 400, statusMessage: message })
}

function getGitErrorMessage(err: unknown) {
  const toMessage = (value: Buffer | string | undefined) => {
    if (!value) return ''
    const text = (Buffer.isBuffer(value) ? value.toString('utf8') : value).trim()
    if (!text) return ''
    const lines = text.split(/\r?\n/).filter(Boolean)
    return lines.at(-1) ?? text
  }

  const error = err as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string }
  const stderrMessage = toMessage(error.stderr)
  const stdoutMessage = toMessage(error.stdout)
  return stderrMessage || stdoutMessage || error.message || ''
}

function sanitizePaths(paths: string[]) {
  return paths
    .map((raw) => raw.trim())
    .filter(Boolean)
    .filter((raw) => !raw.startsWith('/') && !raw.includes('..'))
}

function validateRef(ref: string) {
  const safe = /^[A-Za-z0-9._/-]+$/
  if (!safe.test(ref) || ref.startsWith('-')) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_ref' })
  }
}

async function runGit(repoPath: string, args: string[], allowNull = false) {
  const baseArgs = ['-C', repoPath, '--no-pager', '-c', 'core.quotepath=false', ...args]
  try {
    const { stdout } = await execFileAsync('git', baseArgs, { encoding: 'buffer' })
    return stdout.toString('utf8')
  } catch (err) {
    if (allowNull) {
      const error = err as { stdout?: Buffer; stderr?: Buffer }
      if (error.stdout) return error.stdout.toString('utf8')
    }
    throw err
  }
}
