const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

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

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.detail || 'Request failed')
  }
  return data as T
}

export { API_BASE }
