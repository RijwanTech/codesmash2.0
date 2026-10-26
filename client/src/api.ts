/** Set VITE_API_URL only if the API is hosted on a different origin than the website. */
export const API_BASE: string = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');

const TOKEN_KEY = 'codesmash-token';

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized: ((token: string) => void) | null = null;
export const setUnauthorizedHandler = (fn: ((token: string) => void) | null) => {
  onUnauthorized = fn;
};

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith('/auth/') && getToken() === token) {
      onUnauthorized?.(token);
    }
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

/** Download a protected file (e.g. the CSV export) with the login token attached. */
export async function download(path: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'Download failed.');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
