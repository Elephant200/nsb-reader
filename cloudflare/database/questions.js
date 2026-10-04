import buckets from '../../.cloudflare/question-buckets.js';

/** Question storage using the existing public question shapes. Inputs are validated by routes. */
export default class Questions {
  constructor (db) { this.db = db; }

  async rows (sql, values = []) {
    const result = await this.db.prepare(sql).bind(...values).all();
    return result.results;
  }

  async question (kind, id) {
    const row = await this.db.prepare('SELECT data FROM questions WHERE id = ? AND kind = ?').bind(id, kind).first();
    return row ? JSON.parse(row.data) : null;
  }

  async pairedBonus (packetId, number) {
    const row = await this.db.prepare("SELECT data FROM questions WHERE packet_id = ? AND number = ? AND kind = 'bonus'").bind(packetId, number).first();
    return row ? JSON.parse(row.data) : null;
  }

  async random (kind, { categories = [], minYear = 0, maxYear = 9999, number = 1 } = {}) {
    const candidates = buckets.filter(({ key: [type, category, year] }) => type === kind &&
      (!categories.length || categories.includes(category)) && year >= minYear && year <= maxYear).flatMap(bucket => bucket.ordinals);
    const selected = [];
    for (let i = 0; i < number && candidates.length; i++) {
      const index = Math.floor(Math.random() * candidates.length);
      selected.push(candidates[index]);
      candidates[index] = candidates.at(-1);
      candidates.pop();
    }
    const result = [];
    for (let offset = 0; offset < selected.length; offset += 80) {
      const ids = selected.slice(offset, offset + 80);
      const rows = await this.rows(`SELECT ordinal, data FROM questions WHERE kind = ? AND ordinal IN (${ids.map(() => '?').join(',')})`, [kind, ...ids]);
      const byOrdinal = new Map(rows.map(row => [row.ordinal, JSON.parse(row.data)]));
      result.push(...ids.map(id => byOrdinal.get(id)).filter(Boolean));
    }
    return result;
  }

  async packet ({ _id, setName, packetNumber, questionTypes = ['tossups', 'bonuses'], modaq = false }) {
    const record = _id
      ? await this.db.prepare('SELECT data FROM packets WHERE id = ?').bind(_id).first()
      : await this.db.prepare('SELECT p.data FROM packets p JOIN sets s ON p.set_id = s.id WHERE s.name = ? AND p.number = ?').bind(setName || '', packetNumber || 0).first();
    if (!record) return { tossups: [], bonuses: [] };
    const packet = JSON.parse(record.data);
    const rows = await this.rows('SELECT kind, data FROM questions WHERE packet_id = ? ORDER BY number', [packet._id]);
    const result = { packet, tossups: [], bonuses: [] };
    for (const row of rows) {
      const key = row.kind === 'bonus' ? 'bonuses' : 'tossups';
      if (questionTypes.includes(key)) result[key].push(JSON.parse(row.data));
    }
    if (modaq) {
      result.tossups = result.tossups.map(q => ({ question: q.question, answer: q.answer, metadata: q.category }));
      result.bonuses = result.bonuses.map(q => ({ leadin: q.leadin, parts: q.parts, answers: q.answers, values: q.values, metadata: q.category }));
    }
    return result;
  }

  async sets ({ expand = false, includeCounts = false, limit = 10000 } = {}) {
    const rows = await this.rows(`SELECT s.data${includeCounts
? `,
      (SELECT count(*) FROM packets WHERE set_id = s.id) AS packetsCount,
      (SELECT count(*) FROM questions WHERE set_name = s.name AND kind = 'tossup') AS tossupsCount,
      (SELECT count(*) FROM questions WHERE set_name = s.name AND kind = 'bonus') AS bonusesCount`
: ''}
      FROM sets s ORDER BY year DESC, name ASC LIMIT ?`, [limit]);
    return rows.map(row => {
      const set = JSON.parse(row.data);
      if (!expand) return set.name;
      const { data, ...counts } = row;
      return { ...set, setName: set.name, ...counts };
    });
  }

  async packets ({ setName, set_id: setId, expand = false }) {
    const rows = await this.rows(`SELECT p.data${expand
? `,
      (SELECT count(*) FROM questions WHERE packet_id = p.id AND kind = 'tossup') AS tossupCount,
      (SELECT count(*) FROM questions WHERE packet_id = p.id AND kind = 'bonus') AS bonusCount`
: ''}
      FROM packets p JOIN sets s ON p.set_id = s.id WHERE ${setId ? 's.id' : 's.name'} = ? ORDER BY p.number`, [setId || setName || '']);
    return rows.map(row => {
      const packet = JSON.parse(row.data);
      return expand
        ? { _id: packet._id, packetName: packet.name, packetNumber: packet.number, setName: packet.set.name, tossupCount: row.tossupCount, bonusCount: row.bonusCount }
        : { name: packet.name, number: packet.number };
    });
  }

  async packetCount (setName) {
    const packets = await this.packets({ setName });
    return Math.max(0, ...packets.map(packet => packet.number));
  }

  async report (id, reason, description) {
    const result = await this.db.prepare('INSERT INTO question_reports (question_id, reason, description) SELECT id, ?, ? FROM questions WHERE id = ?').bind(reason, description, id).run();
    return result.meta.changes > 0;
  }
}
