import isAppropriateString from '../moderation/is-appropriate-string.js';

/** Validate a player-selected name at the WebSocket boundary. */
export default function readerUsername (value, players, ownId) {
  if (typeof value !== 'string') return null;
  const username = value.trim();
  const hasControlCharacters = [...username].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (!username || username.length > 32 || hasControlCharacters || /[<>]/.test(username) || !isAppropriateString(username)) return null;
  if (Object.values(players).some(p => p.id !== ownId && !p.kicked && p.username.toLowerCase() === username.toLowerCase())) return null;
  return username;
}
