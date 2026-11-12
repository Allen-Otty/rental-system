// Small fetch wrapper: JSON in/out, bearer token, one automatic refresh on 401, readable errors.
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api/v1";
const REFRESH_KEY = "makao-refresh";

let access: string | null = null; // kept in memory only; the refresh token is what survives a reload

export const tokens = {
  set(a: string | null, r?: string | null) {
    access = a;
    try {
      if (r === null) localStorage.removeItem(REFRESH_KEY);
      else if (r) localStorage.setItem(REFRESH_KEY, r);
    } catch { /* private mode: stay signed in for this tab only */ }
  },
  clear() { this.set(null, null); },
  get hasRefresh() { try { return !!localStorage.getItem(REFRESH_KEY); } catch { return false; } },
};

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  code?: string;
  constructor(status: number, message: string, fields: Record<string, string> = {}, code?: string) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.code = code;
  }
}

function toError(status: number, data: unknown): ApiError {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.detail === "string") return new ApiError(status, d.detail, {}, typeof d.code === "string" ? d.code : undefined);
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(d)) fields[k] = Array.isArray(v) ? String(v[0]) : typeof v === "string" ? v : "Invalid value";
    const first = Object.values(fields)[0];
    return new ApiError(status, first ?? "Something went wrong.", fields);
  }
  return new ApiError(status, status >= 500 ? "The server had a problem. Try again in a moment." : "Something went wrong.");
}

async function refreshAccess(): Promise<boolean> {
  let refresh: string | null = null;
  try { refresh = localStorage.getItem(REFRESH_KEY); } catch { /* ignore */ }
  if (!refresh) return false;
  const res = await fetch(`${BASE}/auth/refresh/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh }) });
  if (!res.ok) { tokens.clear(); return false; }
  const data = await res.json();
  tokens.set(data.access, data.refresh ?? refresh);
  return true;
}

type Opts = { method?: string; body?: unknown; query?: Record<string, string | number | boolean | undefined | null>; form?: FormData; signal?: AbortSignal };

export async function api<T = unknown>(path: string, opts: Opts = {}, retried = false): Promise<T> {
  if (import.meta.env.VITE_DEMO === "1") return (await import("./demo")).demoApi(path, opts) as Promise<T>;
  const q = opts.query ? Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&") : "";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (access) headers.Authorization = `Bearer ${access}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.body); }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${q ? `?${q}` : ""}`, { method: opts.method ?? "GET", headers, body, signal: opts.signal });
  } catch {
    throw new ApiError(0, "No connection. Check your internet and try again.");
  }
  if (res.status === 401 && !retried && (await refreshAccess())) return api<T>(path, opts, true);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw toError(res.status, data);
  return data as T;
}

export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };
