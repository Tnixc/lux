export function auditLog(event: string, details: Record<string, unknown>) {
  const payload = {
    event,
    at: new Date().toISOString(),
    ...details
  }
  console.error(JSON.stringify(payload))
}
