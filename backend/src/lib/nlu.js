/**
 * Speech → structured intent.
 *
 * This is the "ears" half of the system and the only place a real LLM will ever
 * live. It maps raw speech to a strict JSON shape. It never reads prices,
 * touches stock, or computes a total — Postgres owns all of that.
 *
 * Swap `parseIntent` for an OpenAI / Gemma call that returns the same schema.
 */

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  half: 0.5, quarter: 0.25,
  moja: 1, mbili: 2, tatu: 3, nne: 4, tano: 5, sita: 6, saba: 7, nane: 8,
  tisa: 9, kumi: 10, nusu: 0.5,
};

const UNIT_WORDS =
  'packets?|packs?|kgs?|kilos?|kilograms?|grams?|gms?|litres?|liters?|ltrs?|pieces?|pcs?|bottles?|tins?|crates?|bales?|bunches?|loaves|loafs?|trays?';

const NOISE_WORDS = new Set([
  'a', 'an', 'and', 'bob', 'cash', 'credit', 'deni', 'for', 'from', 'get',
  'give', 'is', 'kes', 'kwa', 'me', 'mkopo', 'na', 'of', 'on', 'please',
  'record', 'sale', 'sell', 'shillings', 'sold', 'the', 'to', 'x',
]);

const SALE_WORDS =
  /\b(sell|sold|sale|nimeuza|uza|nauza|took|take|takes|taken|bought|buy|buys)\b/;
const CUSTOMER_FIRST_SALE = /\b(took|take|takes|taken|bought|buy|buys)\b/;
const TOOK_WORDS = /\b(took|take|takes|taken|amechukua|alichukua|chukua)\b/;
const CREDIT_WORDS = /\b(credit|deni|mkopo|nikope|akope|on\s+account)\b/;
const REPAYMENT_WORDS = /\b(repay|repaid|repayment|paid|pay|amelipa|alilipa|ameshalipa|lipa|malipo)\b/;
const RESTOCK_WORDS = /\b(add|added|restock|stock\s*in|received|receive|nimeongeza|ongeza|niliweka)\b/;

function titleCase(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalize(transcript) {
  let text = String(transcript || '')
    .toLowerCase()
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    text = text.replace(new RegExp(`\\b${word}\\b`, 'g'), String(value));
  }

  // "2kgs" / "1kg" must be qty + unit, not part of a name.
  text = text.replace(new RegExp(`(\\d)\\s*(${UNIT_WORDS})\\b`, 'g'), '$1 $2');

  return text;
}

const UNIT_PATTERN = new RegExp(`^(?:${UNIT_WORDS})$`);

function cleanName(raw) {
  return raw
    .split(/\s+/)
    .filter(
      (word) =>
        word &&
        !NOISE_WORDS.has(word) &&
        !UNIT_PATTERN.test(word) &&
        !/^\d+(\.\d+)?$/.test(word)
    )
    .join(' ')
    .trim();
}

function extractCustomer(text) {
  const paidFirst = text.match(/^(.+?)\s+(?:paid|amelipa|alilipa|ameshalipa|has\s+paid)\b/);
  if (paidFirst) {
    const name = cleanName(paidFirst[1]);
    if (name) return titleCase(name);
  }

  const leading = text.match(new RegExp(`^(.+?)\\s+${CUSTOMER_FIRST_SALE.source}`));
  if (leading) {
    const name = cleanName(leading[1]);
    if (name) return titleCase(name);
  }

  const trailing = text.match(/\b(?:to|for|kwa|from|na)\s+([a-z][a-z\s]*?)$/);
  if (trailing) {
    const name = trailing[1]
      .replace(/\b(cash|credit|deni|mkopo|bob|shillings|kes)\b/g, ' ')
      .trim();
    const cleaned = cleanName(name);
    if (cleaned) return titleCase(cleaned);
  }

  return null;
}

/**
 * Handles both word orders shopkeepers actually use:
 * English "two unga" and Swahili "sugar tatu", joined by "and" / "na".
 */
function extractItems(text, catalog = [], customerName = null) {
  let body = text
    .replace(SALE_WORDS, ' ')
    .replace(CREDIT_WORDS, ' ')
    .replace(RESTOCK_WORDS, ' ')
    .replace(/\b(?:to|for|kwa|from)\s+[a-z][a-z\s]*$/, ' ')
    .replace(/\b(?:bob|kes|shillings)\b/g, ' ')
    .trim();

  if (customerName) {
    const escaped = customerName.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    body = body.replace(new RegExp(`^${escaped}\\s+`, 'i'), '').trim();
  }

  const unitMatcher = new RegExp(`\\b(${UNIT_WORDS})\\b`);
  const segments = body.split(/\s+(?:and|na|plus)\s+/).filter(Boolean);
  const items = [];

  for (const segment of segments) {
    const numbers = segment.match(/\d+(?:\.\d+)?/g);
    const name = resolveCatalogName(cleanName(segment), catalog);
    if (!name) continue;

    const qty = numbers ? Number(numbers[0]) : 1;
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const unit = segment.match(unitMatcher);
    items.push({ name, qty, unit: unit ? unit[1] : null });
  }

  return items;
}

function resolveCatalogName(spoken, catalog) {
  if (!spoken) return spoken;
  if (!catalog?.length) return titleCase(spoken);

  const needle = spoken.toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const item of catalog) {
    const name = String(item.name || '').toLowerCase();
    if (!name) continue;
    let score = 0;
    if (name === needle) score = 4;
    else if (name.startsWith(needle) || needle.startsWith(name)) score = 3;
    else if (name.includes(needle) || needle.includes(name)) score = 2;
    else if (name.split(/\s+/).some((part) => part.length > 2 && needle.includes(part))) score = 1;
    if (score > bestScore) {
      best = item.name;
      bestScore = score;
    }
  }

  return best || titleCase(spoken);
}

const QUESTION_CUE =
  /\b(how (much|many|do|does|can|did)|what|who|why|which|where|when|tell me|show me|explain|help|karibu|should i|do i have|have i got|who are you)\b|\?/;

export function isLedgerCommand(transcript) {
  const text = normalize(transcript);
  if (QUESTION_CUE.test(text) && !SALE_WORDS.test(text)) return false;
  return SALE_WORDS.test(text) || CREDIT_WORDS.test(text) || RESTOCK_WORDS.test(text) || REPAYMENT_WORDS.test(text);
}

export function parseIntent(transcript, { catalog = [] } = {}) {
  const text = normalize(transcript);

  let action = 'sale';
  let paymentType = 'cash';

  if (REPAYMENT_WORDS.test(text) && !SALE_WORDS.test(text)) {
    action = 'repayment';
  } else if (CREDIT_WORDS.test(text) || (TOOK_WORDS.test(text) && !/\bcash\b/.test(text))) {
    action = 'credit';
    paymentType = 'credit';
  } else if (RESTOCK_WORDS.test(text) && !SALE_WORDS.test(text)) {
    action = 'restock';
  }

  const customerName = extractCustomer(text);
  const intent = {
    action,
    items: action === 'repayment' ? [] : extractItems(text, catalog, customerName),
    payment_type: paymentType,
    customer_name: customerName,
  };

  if (action === 'repayment') {
    const amount = text.match(/(\d+(?:\.\d+)?)/);
    intent.amount = amount ? Number(amount[1]) : null;
  }

  return intent;
}

/**
 * Assistant question → a named report the database knows how to answer.
 * The model picks the question type; every number in the reply comes from SQL.
 */
export function classifyQuestion(question) {
  const text = String(question || '').toLowerCase();

  if (
    /\b(help|what can you|who are you|what are you|what do you do|how do (i|you)|how does|sautiledger|this app|this application|voice ledger|karibu)\b/.test(
      text
    )
  ) {
    return 'help';
  }
  if (/\b(owe|owes|debt|deni|madeni|who owes)\b/.test(text)) return 'top_debtors';
  if (/\b(restock|reorder|low\s*stock|running\s+out|running low|finished)\b/.test(text)) return 'restock';
  if (/\b(profit|faida|margin)\b/.test(text)) return 'profit';
  if (/\b(best|top seller|best seller|popular|fastest.?moving)\b/.test(text)) return 'top_items';
  if (/\b(worth|value)\b/.test(text)) return 'stock_value';
  if (
    /\b(how much|how many|do i have|have i got|left|remaining)\b/.test(text) &&
    !/\b(profit|owe|sales|cash|credit|debt)\b/.test(text)
  ) {
    return 'item_qty';
  }
  if (
    /\b(shelf|inventory|in stock|what do i (have|stock|sell)|list (my )?(items|stock)|what('?s| is) (in|on my))\b/.test(
      text
    )
  ) {
    return 'inventory_list';
  }
  if (/\b(today|leo|sales|sold|revenue|mauzo)\b/.test(text)) return 'sales_summary';
  if (/\bstock\b/.test(text)) return 'inventory_list';

  return 'unknown';
}

/** Pull a likely item name out of a stock question, e.g. "how much unga is left". */
export function extractStockQuery(question) {
  return String(question || '')
    .toLowerCase()
    .replace(/[?,.!'"’]/g, ' ')
    .replace(
      /\b(how much|how many|do i have|have i got|is there|any|left|remaining|stock of|of my|in (the |my )?inventory|on (the |my )?shelf|please|tell me|show me|check|what'?s|what is|the|a|an|my|our|i|do|have|got|still|about)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferPeriod(question) {
  const text = String(question || '').toLowerCase();
  if (/\b(today|leo)\b/.test(text)) return 'today';
  if (/\b(month|mwezi)\b/.test(text)) return 'month';
  if (/\b(year|mwaka)\b/.test(text)) return 'year';
  return 'week';
}
