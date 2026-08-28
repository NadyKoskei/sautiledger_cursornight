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

const SALE_WORDS = /\b(sell|sold|sale|nimeuza|uza|nauza)\b/;
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
function extractItems(text) {
  const body = text
    .replace(SALE_WORDS, ' ')
    .replace(CREDIT_WORDS, ' ')
    .replace(RESTOCK_WORDS, ' ')
    .replace(/\b(?:to|for|kwa|from)\s+[a-z][a-z\s]*$/, ' ')
    .replace(/\b(?:bob|kes|shillings)\b/g, ' ')
    .trim();

  const unitMatcher = new RegExp(`\\b(${UNIT_WORDS})\\b`);
  const segments = body.split(/\s+(?:and|na|plus)\s+/).filter(Boolean);
  const items = [];

  for (const segment of segments) {
    const numbers = segment.match(/\d+(?:\.\d+)?/g);
    const name = cleanName(segment);
    if (!name) continue;

    const qty = numbers ? Number(numbers[0]) : 1;
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const unit = segment.match(unitMatcher);
    items.push({ name, qty, unit: unit ? unit[1] : null });
  }

  return items;
}

export function parseIntent(transcript) {
  const text = normalize(transcript);

  let action = 'sale';
  let paymentType = 'cash';

  if (REPAYMENT_WORDS.test(text) && !SALE_WORDS.test(text)) {
    action = 'repayment';
  } else if (CREDIT_WORDS.test(text)) {
    action = 'credit';
    paymentType = 'credit';
  } else if (RESTOCK_WORDS.test(text) && !SALE_WORDS.test(text)) {
    action = 'restock';
  }

  const intent = {
    action,
    items: action === 'repayment' ? [] : extractItems(text),
    payment_type: paymentType,
    customer_name: extractCustomer(text),
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

  if (/\b(owe|owes|debt|deni|madeni|balance)\b/.test(text)) return 'top_debtors';
  if (/\b(restock|reorder|low\s*stock|running\s+out|finished|order)\b/.test(text)) return 'restock';
  if (/\b(profit|faida|margin|earn(ed|ing)?|make|made)\b/.test(text)) return 'profit';
  if (/\b(best|top|selling|popular|moving)\b/.test(text)) return 'top_items';
  if (/\b(today|leo|sales|sold|revenue|mauzo)\b/.test(text)) return 'sales_summary';
  if (/\b(stock|inventory|value|worth)\b/.test(text)) return 'stock_value';

  return 'unknown';
}

export function inferPeriod(question) {
  const text = String(question || '').toLowerCase();
  if (/\b(today|leo)\b/.test(text)) return 'today';
  if (/\b(month|mwezi)\b/.test(text)) return 'month';
  if (/\b(year|mwaka)\b/.test(text)) return 'year';
  return 'week';
}
