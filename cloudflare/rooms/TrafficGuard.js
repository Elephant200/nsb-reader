/* global Response */
/** Per-IP request quotas and leased WebSocket slots shared across all rooms. */
export class TrafficGuard {
  constructor (ctx) { this.ctx = ctx; }

  async fetch (request) {
    const { action, id, kind } = await request.json();
    return this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now();
      const state = await this.ctx.storage.get('state') || { windows: {}, connections: {} };
      for (const [key, deadline] of Object.entries(state.connections)) if (deadline < now) delete state.connections[key];
      let allowed = true;
      if (action === 'release') delete state.connections[id];
      else if (action === 'connect' || action === 'renew') {
        allowed = !!state.connections[id] || Object.keys(state.connections).length < 50;
        if (allowed) state.connections[id] = now + 180000;
      } else {
        const window = state.windows[kind] || { start: now, count: 0 };
        const duration = kind === 'api' ? 1000 : 3600000;
        const max = kind === 'api' ? 20 : 30;
        if (now - window.start >= duration) { window.start = now; window.count = 0; }
        allowed = ++window.count <= max;
        state.windows[kind] = window;
      }
      await this.ctx.storage.put('state', state);
      await this.ctx.storage.setAlarm(now + 3600000);
      return Response.json({ allowed });
    });
  }

  async alarm () { await this.ctx.storage.deleteAll(); }
}

export async function guard (env, ip, action, extra = {}) {
  const response = await env.TRAFFIC.getByName(ip).fetch('https://guard/', { method: 'POST', body: JSON.stringify({ action, ...extra }) });
  return (await response.json()).allowed;
}
