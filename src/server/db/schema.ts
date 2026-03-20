import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  login: text('login').notNull().unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`)
})

export const userSessions = sqliteTable('user_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
  expiresAt: integer('expires_at').notNull()
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),
  icon: text('icon'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at')
    .notNull()
    .default(sql`(unixepoch())`)
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  name: text('name').notNull(),
  tmuxSession: text('tmux_session').notNull().unique(),
  agentCli: text('agent_cli').notNull().default('amp'),
  desiredStatus: text('desired_status').notNull().default('running'),
  observedStatus: text('observed_status').notNull().default('starting'),
  primaryPaneId: text('primary_pane_id'),
  lastError: text('last_error'),
  lastSeenAt: integer('last_seen_at'),
  startedAt: integer('started_at'),
  stoppedAt: integer('stopped_at'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at')
    .notNull()
    .default(sql`(unixepoch())`)
})

export type User = typeof users.$inferSelect
export type UserSession = typeof userSessions.$inferSelect
export type Project = typeof projects.$inferSelect
export type Session = typeof sessions.$inferSelect
