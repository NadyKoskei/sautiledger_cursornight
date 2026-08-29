/**
 * Match spoken product names against the real shelf.
 * Never invents a product. Never picks a "similar" item.
 */

const STOP = new Set([
  'a', 'an', 'and', 'of', 'the', 'to', 'for', 'wa', 'ya', 'na', 'me', 'my', 'some',
]);

const PLACEHOLDERS = new Set([
  'something', 'stuff', 'item', 'items', 'product', 'products', 'kitu', 'vitu', 'whatever', 'thing',
]);

const ALIASES = [
  [/unga\s+(wa|ya|for)\s+ugali/g, 'unga'],
  [/maize\s+flour/g, 'unga'],
  [/wheat\s+flour/g, 'wheat flour'],
];

export function isPlaceholderName(value) {
  const text = String(value || '')
    .toLowerCase()
    .trim();
  if (!text) return true;
  return PLACEHOLDERS.has(text) || [...PLACEHOLDERS].some((word) => text === word);
}

function stem(token) {
  if (token.length > 4 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

export function nameTokens(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(stem)
    .filter((token) => token.length > 1 && !STOP.has(token));
}

function applyAliases(spoken) {
  let text = String(spoken || '').toLowerCase();
  for (const [pattern, replacement] of ALIASES) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function tokensAppearInOrder(needle, haystack) {
  if (needle.length === 0 || haystack.length === 0) return false;
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    if (needle.every((token, offset) => haystack[i + offset] === token)) return true;
  }
  return false;
}

function scoreAgainst(spoken, itemName) {
  const spokenNorm = applyAliases(spoken);
  const spokenTokens = nameTokens(spokenNorm);
  const itemTokens = nameTokens(itemName);
  if (spokenTokens.length === 0 || itemTokens.length === 0) return 0;

  if (spokenTokens.join(' ') === itemTokens.join(' ')) return 100 + itemTokens.length;

  // Spoken is more verbose ("unga wa ugali", "2 kg of sugar") and names the item.
  if (tokensAppearInOrder(itemTokens, spokenTokens)) return 80 + itemTokens.length;

  return 0;
}

/**
 * Pick the shelf row the shopkeeper named, or null.
 * Prefers the longest exact / contained name so "cooking oil" beats "oil".
 */
export function matchCatalogItem(spoken, catalog = []) {
  const query = String(spoken || '').trim();
  if (!query || isPlaceholderName(query) || !catalog.length) return null;

  let best = null;
  let bestScore = 0;

  for (const item of catalog) {
    const name = String(item?.name || '').trim();
    if (!name) continue;
    const score = scoreAgainst(query, name);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }

  return bestScore > 0 ? best : null;
}
