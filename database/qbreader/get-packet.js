import { query } from '../postgres.js';
import { mapBonusRow, mapTossupRow, packetJoinSql, questionSelectSql } from './sql.js';

function modaqifyTossup (tossup) {
  return {
    question: tossup.question.replace('<i>', '<em>').replace('</i>', '</em>'),
    answer: tossup.answer.replace('<i>', '<em>').replace('</i>', '</em>'),
    metadata: tossup.category
  };
}

function modaqifyBonus (bonus) {
  const result = {
    values: bonus.values ?? bonus.parts.map(() => 10),
    leadin: bonus.leadin.replace('<i>', '<em>').replace('</i>', '</em>'),
    parts: bonus.parts.map(part => part.replace('<i>', '<em>').replace('</i>', '</em>')),
    answers: bonus.answers.map(answer => answer.replace('<i>', '<em>').replace('</i>', '</em>')),
    metadata: bonus.category
  };

  if (bonus.difficultyModifiers) {
    result.difficultyModifiers = bonus.difficultyModifiers;
  }

  return result;
}

async function getPacketRecord ({ _id, setName, packetNumber }) {
  if (_id) {
    const { rows } = await query(`
      select p.id, p.name, p.number, s.id as set_id, s.name as set_name, s.year as set_year, s.standard as set_standard
      from packets p
      join sets s on s.id = p.set_id
      where p.id = $1
    `, [_id]);
    return rows[0];
  }

  const { rows } = await query(`
    select p.id, p.name, p.number, s.id as set_id, s.name as set_name, s.year as set_year, s.standard as set_standard
    from packets p
    join sets s on s.id = p.set_id
    where s.name = $1 and p.number = $2
  `, [setName, packetNumber]);
  return rows[0];
}

/**
 * Retrieves a packet of questions from the database.
 */
async function getPacket ({ _id, setName, packetNumber, questionTypes = ['tossups', 'bonuses'], modaq = false }) {
  if (!_id && (!setName || isNaN(packetNumber) || packetNumber < 1)) {
    return { tossups: [], bonuses: [] };
  }

  const packetRecord = await getPacketRecord({ _id, setName, packetNumber });

  if (!packetRecord) {
    return { tossups: [], bonuses: [] };
  }

  const tossupResult = questionTypes.includes('tossups')
    ? query(`
      select ${questionSelectSql()}
      ${packetJoinSql('tossups')}
      where q.packet_id = $1
      order by q.number asc
    `, [packetRecord.id])
    : null;

  const bonusResult = questionTypes.includes('bonuses')
    ? query(`
      select ${questionSelectSql()}
      ${packetJoinSql('bonuses')}
      where q.packet_id = $1
      order by q.number asc
    `, [packetRecord.id])
    : null;

  const values = await Promise.all([tossupResult, bonusResult]);

  const result = {
    tossups: [],
    bonuses: [],
    packet: {
      _id: packetRecord.id,
      name: packetRecord.name,
      number: packetRecord.number,
      set: {
        _id: packetRecord.set_id,
        name: packetRecord.set_name,
        year: packetRecord.set_year,
        standard: packetRecord.set_standard
      }
    }
  };

  if (questionTypes.includes('tossups')) {
    result.tossups = values[0].rows.map(mapTossupRow);
  }

  if (questionTypes.includes('bonuses')) {
    result.bonuses = values[1].rows.map(mapBonusRow);
  }

  if (modaq) {
    result.tossups = result.tossups.map(modaqifyTossup);
    result.bonuses = result.bonuses.map(modaqifyBonus);
  }

  return result;
}

export default getPacket;
