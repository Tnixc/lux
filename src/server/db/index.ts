import { drizzle } from 'drizzle-orm/node-sqlite'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { allowedUsers, projects, sessions, settings, userSessions, users } from './schema'

const DEFAULT_DB_DIR = path.join(homedir(), '.lux')
const DEFAULT_DB_PATH = path.join(DEFAULT_DB_DIR, 'lux.db')

let sqlite: DatabaseSync | null = null
let db: ReturnType<typeof drizzle> | null = null

export function getDb() {
  if (!db) {
    initDb()
  }
  return db!
}

export function getSqlite() {
  if (!sqlite) {
    initDb()
  }
  return sqlite!
}

export function initDb() {
  if (db && sqlite) return db
  const dbPath = process.env.LUX_DB_PATH || DEFAULT_DB_PATH
  const dir = path.dirname(dbPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  sqlite = new DatabaseSync(dbPath)
  sqlite.exec('PRAGMA foreign_keys = ON')

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS allowed_users (
      login TEXT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      login TEXT NOT NULL UNIQUE,
      name TEXT,
      avatar_url TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      icon TEXT,
      created_by TEXT REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL,
      tmux_session TEXT NOT NULL UNIQUE,
      agent_cli TEXT NOT NULL DEFAULT 'amp',
      desired_status TEXT NOT NULL DEFAULT 'running'
        CHECK (desired_status IN ('running', 'stopped')),
      observed_status TEXT NOT NULL DEFAULT 'starting'
        CHECK (observed_status IN (
          'starting', 'running', 'disconnected',
          'stopped', 'missing', 'error'
        )),
      primary_pane_id TEXT,
      last_error TEXT,
      last_seen_at INTEGER,
      started_at INTEGER,
      stopped_at INTEGER,
      created_by TEXT REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  const projectColumns = sqlite.prepare('PRAGMA table_info(projects)').all() as Array<{
    name: string
  }>
  if (!projectColumns.some((column) => column.name === 'icon')) {
    sqlite.exec('ALTER TABLE projects ADD COLUMN icon TEXT')
  }

  db = drizzle({
    client: sqlite,
    schema: { allowedUsers, users, userSessions, settings, projects, sessions }
  })

  seedDefaults(db)
  return db
}

function seedDefaults(database: ReturnType<typeof drizzle>) {
  const ensureSetting = (key: string, value: string) => {
    const existing = database.select().from(settings).where(eq(settings.key, key)).get()
    if (!existing) {
      database.insert(settings).values({ key, value }).run()
    }
  }

  const allow = database
    .select()
    .from(allowedUsers)
    .where(eq(allowedUsers.login, 'taskylizard'))
    .get()
  if (!allow) {
    database.insert(allowedUsers).values({ login: 'taskylizard' }).run()
  }

  ensureSetting('default_agent_cli', 'amp')
  ensureSetting('home_dir', homedir())

  if (!process.env.LUX_SESSION_SECRET) {
    const existing = database
      .select()
      .from(settings)
      .where(eq(settings.key, 'session_secret'))
      .get()
    if (!existing) {
      const secret = randomBytes(32).toString('hex')
      database.insert(settings).values({ key: 'session_secret', value: secret }).run()
    }
  }
}
