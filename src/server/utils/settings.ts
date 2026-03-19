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
