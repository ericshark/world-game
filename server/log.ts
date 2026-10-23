/**
 * One JSON object per line on standard output, which log collectors (Docker, journald, a
 * hosting dashboard) can read as is. Fields must never include emails or tokens.
 */
export function log(level: 'info' | 'warn' | 'error', event: string, fields: object = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), level, event, ...fields }))
}

/** An error reduced to what is safe and useful to log. */
export function describeError(error: unknown): { message: string; stack?: string } {
  return error instanceof Error
    ? { message: error.message, stack: error.stack?.split('\n').slice(0, 6).join('\n') }
    : { message: String(error) }
}
