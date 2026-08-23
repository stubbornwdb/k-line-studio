/** Minimal typed fetch layer. Every backend error surfaces as an ApiError. */

const BASE = '/api'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = 'http_error',
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type Query = Record<string, string | number | boolean | null | undefined>

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${BASE}${path}`, window.location.origin)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }
  return url.pathname + url.search
}

async function request<T>(
  path: string,
  { query, ...init }: RequestInit & { query?: Query } = {},
): Promise<T> {
  const response = await fetch(buildUrl(path, query), {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  })

  if (!response.ok) {
    throw new ApiError(await readError(response), response.status)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = await response.json()
    if (payload?.error?.message) return payload.error.message as string
    if (typeof payload?.detail === 'string') return payload.detail
    if (Array.isArray(payload?.detail)) {
      // FastAPI validation errors
      return payload.detail.map((d: { msg: string }) => d.msg).join('; ')
    }
  } catch {
    /* fall through to the status text */
  }
  return `${response.status} ${response.statusText}`
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>(path, { query }),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, query?: Query) =>
    request<T>(path, { method: 'DELETE', query }),
  /** Absolute URL for browser-driven downloads (CSV export). */
  url: (path: string, query?: Query) => buildUrl(path, query),
}
