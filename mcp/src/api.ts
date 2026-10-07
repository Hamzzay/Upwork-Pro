/** A thin client for the Upwork Pro API. The MCP never touches the database: every rule of the website (roles, validation, audit) applies to it too. */
export class ApiError extends Error { constructor(readonly status: number, message: string) { super(message); } }

export class Api {
  constructor(private base: string, private token: string) {}
  async call(method: string, path: string, body?: unknown): Promise<any> {
    let res: Response;
    try {
      res = await fetch(this.base.replace(/\/+$/, '') + '/api' + path, {
        // the server refuses any non-GET call that is not JSON, even a DELETE with nothing to say: send {}
        method, headers: { Authorization: `Bearer ${this.token}`, ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) },
        body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined, signal: AbortSignal.timeout(60_000),
      });
    } catch { throw new ApiError(0, `Could not reach Upwork Pro at ${this.base}. Is the server running?`); }
    const text = await res.text();
    let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    if (!res.ok) {
      const msg = res.status === 401 ? 'The token was rejected: it may be wrong, revoked or expired. Make a new one on the website (Connect Claude).' : (data?.error ?? `The server answered ${res.status}`);
      throw new ApiError(res.status, msg);
    }
    return data;
  }
}
