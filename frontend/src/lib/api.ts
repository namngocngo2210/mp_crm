const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:2210'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export async function api<T>(path: string, method: HttpMethod = 'GET', body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  })

  const rawText = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {}
  } catch {
    data = {}
  }
  if (!res.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : undefined
    const fallback = rawText?.trim() ? rawText.trim().slice(0, 300) : `HTTP ${res.status}`
    throw new Error(detail || fallback || 'Request failed')
  }
  return data as T
}

export { API_BASE }
