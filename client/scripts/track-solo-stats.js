/** Refresh session statistics, including an answered bonus before Next is pressed. */
export default function trackSoloStats (room, userId, refresh = () => {}) {
  const player = room.players[userId];
  const team = room.teams[player.teamId];
  let pendingBonus = false;
  function update () {
    const bonusStats = { ...team?.bonusStats };
    if (pendingBonus && team) {
      const points = room.pointsPerPart.reduce((sum, value) => sum + value, 0);
      bonusStats[points] = (bonusStats[points] || 0) + 1;
    }
    refresh({ player, bonusStats });
  }
  const emit = room.emitMessage.bind(room);
  room.emitMessage = message => {
    if (message.type === 'reveal-next-answer' && message.lastPartRevealed) pendingBonus = true;
    if (['end-current-bonus', 'clear-stats'].includes(message.type)) pendingBonus = false;
    emit(message);
    queueMicrotask(update);
  };
  update();
}
