import { query } from '../postgres.js';

export default async function getPacketMetadata (setId) {
  const { rows } = await query(`
    select
      p.id as _id,
      p.name as "packetName",
      p.number as "packetNumber",
      s.name as "setName",
      count(distinct t.id)::int as "tossupCount",
      count(distinct b.id)::int as "bonusCount"
    from packets p
    join sets s on s.id = p.set_id
    left join tossups t on t.packet_id = p.id
    left join bonuses b on b.packet_id = p.id
    where p.set_id = $1
    group by p.id, s.name
    order by p.number asc
  `, [setId]);

  return rows;
}
