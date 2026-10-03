import { pool } from '../../database/postgres.js';
import { normalizePacketJson } from './packet-json.js';

async function upsertSet (client, set) {
  const { rows } = await client.query(`
    insert into sets (name, year, difficulty, standard, updated_at)
    values ($1, $2, $3, $4, now())
    on conflict (name) do update set
      year = excluded.year,
      difficulty = excluded.difficulty,
      standard = excluded.standard,
      updated_at = now()
    returning id
  `, [set.name, set.year, set.difficulty, set.standard]);

  return rows[0].id;
}

async function upsertPacketRecord (client, setId, packet) {
  const { rows } = await client.query(`
    insert into packets (set_id, name, number, source_file, updated_at)
    values ($1, $2, $3, $4, now())
    on conflict (set_id, number) do update set
      name = excluded.name,
      source_file = excluded.source_file,
      updated_at = now()
    returning id
  `, [setId, packet.name, packet.number, packet.source_file]);

  return rows[0].id;
}

async function upsertTossup (client, setId, packetId, tossup) {
  await client.query(`
    insert into tossups (
      set_id, packet_id, number, question, question_sanitized, answer,
      answer_sanitized, category, difficulty, updated_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
    on conflict (packet_id, number) do update set
      question = excluded.question,
      question_sanitized = excluded.question_sanitized,
      answer = excluded.answer,
      answer_sanitized = excluded.answer_sanitized,
      category = excluded.category,
      difficulty = excluded.difficulty,
      updated_at = now()
  `, [
    setId,
    packetId,
    tossup.number,
    tossup.question,
    tossup.question_sanitized,
    tossup.answer,
    tossup.answer_sanitized,
    tossup.category,
    tossup.difficulty
  ]);
}

async function upsertBonus (client, setId, packetId, bonus) {
  await client.query(`
    insert into bonuses (
      set_id, packet_id, number, leadin, leadin_sanitized, parts,
      parts_sanitized, answers, answers_sanitized, values, category,
      difficulty, updated_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
    on conflict (packet_id, number) do update set
      leadin = excluded.leadin,
      leadin_sanitized = excluded.leadin_sanitized,
      parts = excluded.parts,
      parts_sanitized = excluded.parts_sanitized,
      answers = excluded.answers,
      answers_sanitized = excluded.answers_sanitized,
      values = excluded.values,
      category = excluded.category,
      difficulty = excluded.difficulty,
      updated_at = now()
  `, [
    setId,
    packetId,
    bonus.number,
    bonus.leadin,
    bonus.leadin_sanitized,
    bonus.parts,
    bonus.parts_sanitized,
    bonus.answers,
    bonus.answers_sanitized,
    bonus.values,
    bonus.category,
    bonus.difficulty
  ]);
}

export default async function upsertPacketJson (params) {
  if (!pool) {
    throw new Error('Missing DATABASE_URL, SUPABASE_DB_URL, or POSTGRES_URL for Supabase Postgres');
  }

  const packet = normalizePacketJson(params);
  const client = await pool.connect();

  try {
    await client.query('begin');
    const setId = await upsertSet(client, packet.set);
    const packetId = await upsertPacketRecord(client, setId, packet.packet);

    for (const tossup of packet.tossups) {
      await upsertTossup(client, setId, packetId, tossup);
    }

    for (const bonus of packet.bonuses) {
      await upsertBonus(client, setId, packetId, bonus);
    }

    await client.query(`
      insert into ingestion_runs (set_name, packet_name, packet_number, source_file)
      values ($1, $2, $3, $4)
    `, [packet.set.name, packet.packet.name, packet.packet.number, packet.packet.source_file]);

    await client.query('commit');

    const tossupsByCategory = {};
    for (const t of packet.tossups) {
      tossupsByCategory[t.category] = (tossupsByCategory[t.category] ?? 0) + 1;
    }
    const bonusesByCategory = {};
    for (const b of packet.bonuses) {
      bonusesByCategory[b.category] = (bonusesByCategory[b.category] ?? 0) + 1;
    }

    return {
      setId,
      packetId,
      tossupCount: packet.tossups.length,
      bonusCount: packet.bonuses.length,
      tossupsByCategory,
      bonusesByCategory
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
