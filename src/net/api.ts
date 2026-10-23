/** An answer from the game server that was not a success. Status 0 means no usable server. */
export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, message: string, body: unknown = null) {
    super(message)
    this.status = status
    this.body = body
  }
}

/**
 * Calls the server's JSON API on this origin. Without a server (a plain `npm run dev`, or
 * offline) the request fails with status 0, and the app falls back to local-only features.
 */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, 'The server cannot be reached.')
  }
  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    // A page that is not JSON means something other than our API answered.
    throw new ApiError(0, 'There is no game server here.')
  }
  if (!response.ok) {
    const message =
      typeof data === 'object' && data !== null && 'error' in data ? String(data.error) : 'Failed.'
    throw new ApiError(response.status, message, data)
  }
  return data as T
}
