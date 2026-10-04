/* global Request, Response */
import api from './routes/api.js';
export { ReaderSession } from './rooms/ReaderSession.js';
export { MultiplayerSession } from './rooms/MultiplayerSession.js';
export { TrafficGuard } from './rooms/TrafficGuard.js';
export { QuestionSearch } from './rooms/QuestionSearch.js';

export default {
  async fetch (request, env) {
    const url = new URL(request.url);
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    if ((env.BANNED_IPS || '').split(',').map(s => s.trim()).filter(Boolean).includes(ip)) return new Response('Forbidden', { status: 403 });
    try {
      if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
        if (!request.headers.get('User-Agent')) return new Response('Forbidden', { status: 403 });
        if (url.pathname === '/reader-room') {
          const code = url.searchParams.get('code') || '';
          if (!/^\d{6}$/.test(code)) return new Response('Invalid room code', { status: 400 });
          return env.READERS.getByName(code).fetch(request);
        }
        const name = url.searchParams.get('roomName') || '';
        if (!/^[\w-]{1,32}$/.test(name)) return new Response('Invalid room name', { status: 400 });
        return env.MULTIPLAYER.getByName(name).fetch(request);
      }
      if (url.pathname === '/health') return new Response('OK');
      if (url.pathname.startsWith('/api/')) return await api(request, env);
      if (/^\/play\/mp\/[^/.]+\/?$/.test(url.pathname)) {
        url.pathname = '/play/mp/room';
        return env.ASSETS.fetch(new Request(url, request));
      }
      const redirects = { '/tossups': '/play/tossups/', '/bonuses': '/play/bonuses/', '/multiplayer': '/play/mp/', '/singleplayer': '/play/', '/database': '/db/', '/frequency-list': '/db/frequency-list/', '/db/explorer': '/db/set-list', '/play/in-person/prototype': '/play/in-person/' };
      const destination = redirects[url.pathname.replace(/\/$/, '')];
      if (destination) return Response.redirect(new URL(destination + url.search, url).href, 302);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error('Request failed:', error.message);
      return Response.json({ error: 'Unable to complete that request. Please try again.' }, { status: 500 });
    }
  }
};
