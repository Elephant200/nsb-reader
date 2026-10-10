import ServerPlayer from '../../server/multiplayer/ServerPlayer.js';
import Team from '../../shared/Team.js';
import Votekick from '../../server/multiplayer/VoteKick.js';

const transient = new Set(['sockets', 'timer', 'timeoutID', 'timeoutId', 'cleanupInterval', 'rateLimiter', 'rateLimitExceeded', 'categoryManager', 'bannedUserList', 'kickedUserList', 'votekickList', 'randomQuestionCache', 'queryingQuestion']);

/** Serialize game data, excluding live sockets, timers, functions, and prefetched questions. */
export function snapshotMultiplayer (game) {
  const state = Object.fromEntries(Object.entries(game).filter(([key, value]) => !transient.has(key) && typeof value !== 'function'));
  return JSON.stringify({
    state,
    timeRemaining: game.timer.timeRemaining,
    categories: game.categoryManager.export(),
    bans: [...game.bannedUserList],
    kicks: [...game.kickedUserList],
    votes: game.votekickList
  });
}

/** Restore class methods as well as scores so the next answer and Clear stats keep working. */
export function restoreMultiplayer (game, serialized) {
  const saved = JSON.parse(serialized);
  Object.assign(game, saved.state);
  game.categoryManager.import(saved.categories);
  game.players = Object.fromEntries(Object.entries(game.players).map(([id, player]) => [id, Object.assign(new ServerPlayer(id), player, { online: false })]));
  game.teams = Object.fromEntries(Object.entries(game.teams).map(([id, team]) => [id, Object.assign(new Team(id), team)]));
  game.bannedUserList = new Map(saved.bans);
  game.kickedUserList = new Map(saved.kicks);
  game.votekickList = saved.votes.map(vote => Object.assign(new Votekick(vote.targetId, vote.threshold, vote.voted), vote));
  game.timer.timeRemaining = saved.timeRemaining;
  game.queryingQuestion = false;
}
