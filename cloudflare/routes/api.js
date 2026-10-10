/* global Response, crypto */
import * as ints from '../../routes/validators/int.js';
import * as bools from '../../routes/validators/boolean.js';
import * as enums from '../../routes/validators/enum.js';
import * as strings from '../../routes/validators/string.js';
import * as ids from '../../routes/validators/object-id.js';
import validateId from '../../routes/validators/object-id.js';
import validateCategoryBundle from '../../routes/validators/category-bundle.js';
import Questions from '../database/questions.js';
import getRandomName from '../../shared/get-random-name.js';
import checkShortAnswer from 'qb-answer-checker';
import { createNsbAnswerChecker } from '../../shared/nsb-check-answer.js';
import { guard } from '../rooms/TrafficGuard.js';

const checkAnswer = createNsbAnswerChecker(checkShortAnswer);
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });

/** Validate HTTP input before dispatching to D1 or room coordination. */
export default async function api (request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (request.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  if (!await guard(env, ip, 'request', { kind: 'api' })) return json({ error: 'Too many requests.' }, 429);
  const params = {};
  for (const key of url.searchParams.keys()) params[key] = url.searchParams.getAll(key).join(',');
  const db = new Questions(env.DB);
  if (request.method === 'POST') {
    if (path === '/api/reader-room') {
      if (!await guard(env, ip, 'request', { kind: 'create-room' })) return json({ error: 'Too many rooms.' }, 429);
      for (let attempts = 0; attempts < 10; attempts++) {
        const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
        const readerToken = crypto.randomUUID();
        const response = await env.READERS.getByName(code).fetch('https://room/initialize', { method: 'POST', body: JSON.stringify({ code, readerToken }) });
        if (response.status === 201) return json({ code, readerToken }, 201);
      }
      return json({ error: 'Unable to create a room. Try again.' }, 503);
    }
    if (path === '/api/report-question') {
      if (!await guard(env, ip, 'request', { kind: 'report' })) return json({ error: 'Too many reports.' }, 429);
      const text = await request.text();
      if (new TextEncoder().encode(text).length > 10000) return json({ error: 'Report too long.' }, 413);
      let body;
      try { body = JSON.parse(text); } catch { return json({ error: 'Invalid JSON.' }, 400); }
      if (!body || typeof body !== 'object') return json({ error: 'Invalid report.' }, 400);
      const { _id } = ids._id({ _id: body._id });
      const { reason = '', description = '' } = body;
      if (!_id || typeof reason !== 'string' || typeof description !== 'string' || !reason.trim() || reason.length > 200 || description.length > 5000) return json({ error: 'Invalid report.' }, 400);
      return json({}, await db.report(_id, reason.trim(), description.trim()) ? 200 : 404);
    }
    return json({ error: 'Not found.' }, 404);
  }
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  for (const name of ['minYear', 'maxYear', 'number', 'packetNumber', 'limit', 'maxReturnLength', 'tossupPagination', 'bonusPagination']) ints[name](params);
  params.number = Math.min(params.number, 500);
  params.limit = Math.min(params.limit, 10000);
  params.maxReturnLength = Math.min(params.maxReturnLength, 500);
  for (const name of ['expand', 'includeCounts', 'modaq', 'regex', 'caseSensitive', 'exactPhrase', 'ignoreWordOrder', 'randomize']) bools[name](params);
  for (const name of ['questionType', 'searchType', 'category']) enums[name](params);
  strings.queryString(params);
  strings.setName(params);
  ids._id(params);
  ids.set_id(params);
  validateCategoryBundle(params);
  if (params.queryString.length > 500 || params.setName.length > 1000) return json({ error: 'Query too long.' }, 400);
  switch (path) {
    case '/api/random-name': return json({ randomName: getRandomName() });
    case '/api/set-list':
      if (!url.searchParams.has('limit')) params.limit = 10000;
      return json({ setList: await db.sets(params) });
    case '/api/packet-list': {
      if (params.expand ? !params.set_id : !params.setName) return json({ error: 'Invalid set.' }, 400);
      const packetList = await db.packets(params);
      return json({ packetList, setName: packetList[0]?.setName });
    }
    case '/api/num-packets': {
      const numPackets = await db.packetCount(params.setName);
      return json({ numPackets }, numPackets ? 200 : 404);
    }
    case '/api/random-tossup':
    case '/api/random-bonus': {
      const kind = path.endsWith('tossup') ? 'tossup' : 'bonus';
      const questions = await db.random(kind, params);
      return json({ [kind === 'bonus' ? 'bonuses' : 'tossups']: questions }, questions.length ? 200 : 404);
    }
    case '/api/tossup': case '/api/tossup-by-id':
    case '/api/bonus': case '/api/bonus-by-id': {
      if (!params._id) return json({ error: 'Invalid question ID.' }, 400);
      const kind = path.includes('tossup') ? 'tossup' : 'bonus';
      const question = await db.question(kind, params._id);
      return json({ [kind]: question }, question ? 200 : 404);
    }
    case '/api/paired-bonus': {
      const packetId = validateId({ packetId: params.packetId }, 'packetId').packetId;
      if (!packetId || !/^\d+$/.test(url.searchParams.get('number') || '') || params.number < 1) return json({ error: 'Invalid packet or question number.' }, 400);
      return json({ bonus: await db.pairedBonus(packetId, params.number) });
    }
    case '/api/packet': case '/api/packet-tossups': case '/api/packet-bonuses': {
      params.questionTypes = path.endsWith('-tossups') ? ['tossups'] : path.endsWith('-bonuses') ? ['bonuses'] : (params.questionTypes?.split(',') || ['tossups', 'bonuses']);
      const packet = await db.packet(params);
      return json(packet, packet.tossups.length || packet.bonuses.length ? 200 : 404);
    }
    case '/api/query': case '/api/frequency-list': {
      params.setNames = params.setName ? params.setName.split(',').map(s => s.trim()) : [];
      return env.SEARCH.getByName('catalog').fetch('https://search/', { method: 'POST', body: JSON.stringify({ options: params, frequency: path.endsWith('frequency-list') }) });
    }
    case '/api/check-answer': {
      if (typeof params.answerline !== 'string' || typeof params.givenAnswer !== 'string' || params.answerline.length > 5000 || params.givenAnswer.length > 5000) return json({ error: 'Invalid answer.' }, 400);
      if (params.question !== undefined && (typeof params.question !== 'string' || params.question.length > 20000)) return json({ error: 'Invalid question.' }, 400);
      return json(checkAnswer(params.answerline, params.givenAnswer, params.strictness, params.question || ''));
    }
    case '/api/multiplayer/room-list': return json({ activePlayers: 0, activeRooms: 0, roomList: [] });
    default: return json({ error: 'Not found.' }, 404);
  }
}
