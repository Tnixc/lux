import { homedir } from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { settings } from '../db/schema'

export function getSetting(key: string) {
  const db = getDb()
  const row = db.select().from(settings).where(eq(settings.key, key)).get()
  return row?.value ?? null
}

export function setSetting(key: string, value: string) {
  const db = getDb()
  const existing = db.select().from(settings).where(eq(settings.key, key)).get()
  if (existing) {
    db.update(settings).set({ value }).where(eq(settings.key, key)).run()
  } else {
    db.insert(settings).values({ key, value }).run()
  }
}

export function expandHomePath(rawPath: string) {
  const trimmed = rawPath.trim()
  if (!trimmed) return trimmed
  if (trimmed === '~') return homedir()
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(homedir(), trimmed.slice(2))
  }
  return trimmed
}

export function getConfiguredHomeDir(): string {
  const raw = process.env.LUX_HOME_DIR?.trim() || getSetting('home_dir') || homedir()
  return expandHomePath(raw)
}

export function getConfiguredHomeDirs(): string[] {
  const raw = process.env.LUX_HOME_DIR?.trim() || getSetting('home_dir') || homedir()
  return raw
    .split(path.delimiter)
    .map((p) => expandHomePath(p))
    .filter(Boolean)
}

export function getConfiguredDefaultAgentCli() {
  const envDefaultAgentCli = process.env.LUX_DEFAULT_AGENT_CLI
  if (envDefaultAgentCli?.trim()) {
    return envDefaultAgentCli.trim()
  }
  return getSetting('default_agent_cli') || 'amp'
}
