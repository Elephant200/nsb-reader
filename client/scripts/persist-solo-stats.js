const fields = ['buzzes', 'superpowers', 'powers', 'tens', 'zeroes', 'negs', 'points', 'tuh'];

/** Persist cumulative solo statistics independently for each practice mode. */
export default function persistSoloStats (room, userId, mode, storage, refresh = () => {}) {
  const key = `nsb-solo-stats-${mode}`;
  const player = room.players[userId];
  const team = room.teams[player.teamId];
  let pendingBonus = false;
  try {
    const saved = JSON.parse(storage.getItem(key));
    if (saved) {
      for (const field of fields) if (Number.isFinite(saved.player?.[field])) player[field] = saved.player[field];
      for (const kind of ['all', 'correct']) {
        for (const field of ['total', 'average']) {
          if (Number.isFinite(saved.player?.celerity?.[kind]?.[field])) player.celerity[kind][field] = saved.player.celerity[kind][field];
        }
      }
      if (team) {
        for (const points of Object.keys(team.bonusStats)) {
          if (Number.isInteger(saved.bonusStats?.[points]) && saved.bonusStats[points] >= 0) team.bonusStats[points] = saved.bonusStats[points];
        }
      }
    }
  } catch {}
  function save () {
    const bonusStats = { ...team?.bonusStats };
    if (pendingBonus && team) {
      const points = room.pointsPerPart.reduce((sum, value) => sum + value, 0);
      bonusStats[points] = (bonusStats[points] || 0) + 1;
    }
    const stats = { player: Object.fromEntries(fields.map(field => [field, player[field]])), bonusStats };
    stats.player.celerity = player.celerity;
    try { storage.setItem(key, JSON.stringify(stats)); } catch {}
    refresh(stats);
  }
  const emit = room.emitMessage.bind(room);
  room.emitMessage = message => {
    if (message.type === 'reveal-next-answer' && message.lastPartRevealed) pendingBonus = true;
    if (['end-current-bonus', 'clear-stats'].includes(message.type)) pendingBonus = false;
    emit(message);
    queueMicrotask(save);
  };
  save();
  return { save };
}
