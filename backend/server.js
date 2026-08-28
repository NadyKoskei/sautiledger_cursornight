import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import pg from 'pg';

const { Pool } = pg;

const app = express();
const PORT = Number(process.env.PORT) || 5000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(cors());
app.use(express.json());

/**
 * Dummy stand-in for an LLM call.
 * Replace this with OpenAI / Gemma later.
 * It only maps speech → structured intent. It never looks up prices or totals.
 */
const NUMBER_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  moja: 1,
  mbili: 2,
  tatu: 3,
  nne: 4,
  tano: 5,
  sita: 6,
  saba: 7,
  nane: 8,
  tisa: 9,
  kumi: 10,
};

const STOP_WORDS = new Set([
  'a',
  'and',
  'bob',
  'cash',
  'credit',
  'deni',
  'for',
  'from',
  'kes',
  'kg',
  'kgs',
  'kwa',
  'mkopo',
  'nimeuza',
  'of',
  'packet',
  'packets',
  'record',
  'repay',
  'repayment',
  'sale',
  'sell',
  'shillings',
  'the',
  'to',
  'x',
]);

function titleCase(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizeTranscript(transcript) {
  let text = String(transcript || '')
    .toLowerCase()
    .replace(/[.,!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [word, qty] of Object.entries(NUMBER_WORDS)) {
    text = text.replace(new RegExp(`\\b${word}\\b`, 'g'), String(qty));
  }

  return text;
}

function extractCustomerName(text) {
  const paidLead = text.match(/^(.+?)\s+(?:paid|amelipa|alilipa|ameshalipa)\b/);
  if (paidLead) return titleCase(paidLead[1].trim());

  const relation = text.match(
    /\b(?:to|from|kwa|for)\s+(.+?)(?:\s+(?:cash|credit)\s*)?$/
  );
  if (relation) {
    const name = relation[1].replace(/\b(cash|credit)\b/g, '').trim();
    if (name) return titleCase(name);
  }

  return null;
}

function extractItems(text) {
  const items = [];
  const pattern =
    /(\d+)\s+(?:packets?\s+of\s+|kgs?\s+(?:of\s+)?|kg\s+|x\s+)?([a-z][a-z\s]*?)(?=\s+(?:\d+|and|cash|credit|to|from|kwa|bob|kes)|$)/g;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const name = match[2]
      .split(/\s+/)
      .filter((word) => word && !STOP_WORDS.has(word))
      .join(' ')
      .trim();

    if (name) {
      items.push({ name, qty: Number(match[1]) });
    }
  }

  if (items.length === 0) {
    const leftover = text
      .replace(
        /\b(sell|sale|record|credit|cash|nimeuza|repay|repayment|paid|amelipa|alilipa)\b/g,
        ' '
      )
      .replace(/\b(to|from|kwa|for)\s+.+$/, ' ')
      .replace(/\d+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const name = leftover
      .split(/\s+/)
      .filter((word) => word && !STOP_WORDS.has(word))
      .join(' ')
      .trim();

    if (name) items.push({ name, qty: 1 });
  }

  return items;
}

export function dummyParseIntent(transcript) {
  const text = normalizeTranscript(transcript);

  let action = 'sale';
  let paymentType = 'cash';

  if (/\b(repay|repayment|paid|amelipa|alilipa|ameshalipa)\b/.test(text)) {
    action = 'repayment';
    paymentType = 'cash';
  } else if (/\b(credit|deni|mkopo)\b/.test(text)) {
    action = 'credit';
    paymentType = 'credit';
  } else if (/\bcash\b/.test(text)) {
    paymentType = 'cash';
  }

  const customerName = extractCustomerName(text);
  const amountMatch = text.match(/\b(\d+(?:\.\d+)?)\b/);

  const intent = {
    action,
    items: action === 'repayment' ? [] : extractItems(text),
    payment_type: paymentType,
    customer_name: customerName,
  };

  // Optional amount is only used for repayments (speech like "Mama Jane paid 500").
  if (action === 'repayment' && amountMatch) {
    intent.amount = Number(amountMatch[1]);
  }

  return intent;
}

app.post('/api/parse-intent', (req, res) => {
  const transcript = req.body?.transcript;

  if (!transcript || typeof transcript !== 'string') {
    return res.status(400).json({ error: 'transcript is required' });
  }

  const intent = dummyParseIntent(transcript);
  return res.json(intent);
});

function formatBob(amount) {
  const value = Number(amount);
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

async function findOrCreateCustomer(client, name) {
  const existing = await client.query(
    `SELECT id, name, balance FROM customers WHERE name ILIKE $1 LIMIT 1`,
    [name]
  );

  if (existing.rows[0]) return existing.rows[0];

  const created = await client.query(
    `INSERT INTO customers (name, balance) VALUES ($1, 0) RETURNING id, name, balance`,
    [name]
  );
  return created.rows[0];
}

app.post('/api/transaction', async (req, res) => {
  const {
    action,
    items = [],
    payment_type: paymentType,
    customer_name: customerName,
    amount,
  } = req.body || {};

  if (!['sale', 'credit', 'repayment'].includes(action)) {
    return res.status(400).json({
      message: 'Sorry, I could not understand that action. Try sale, credit, or repayment.',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (action === 'repayment') {
      if (!customerName) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'Sorry, I need the customer name to record a repayment.',
        });
      }

      const repaymentAmount = Number(amount);
      if (!repaymentAmount || repaymentAmount <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'Sorry, I need the amount that was repaid.',
        });
      }

      const customerResult = await client.query(
        `SELECT id, name, balance FROM customers WHERE name ILIKE $1 LIMIT 1`,
        [customerName]
      );
      const customer = customerResult.rows[0];

      if (!customer) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          message: `Sorry, I could not find ${customerName} in the customer book.`,
        });
      }

      const updated = await client.query(
        `UPDATE customers
            SET balance = GREATEST(balance - $1, 0)
          WHERE id = $2
          RETURNING name, balance`,
        [repaymentAmount, customer.id]
      );

      await client.query(
        `INSERT INTO transactions (type, item_id, qty, total, payment_type, customer_id)
         VALUES ('repayment', NULL, NULL, $1, $2, $3)`,
        [repaymentAmount, paymentType || 'cash', customer.id]
      );

      await client.query('COMMIT');

      const nextBalance = updated.rows[0];
      return res.json({
        message: `Recorded ${formatBob(repaymentAmount)} bob repayment from ${nextBalance.name}. Balance is now ${formatBob(nextBalance.balance)} bob.`,
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Sorry, I did not catch which item to record.',
      });
    }

    if (action === 'credit' && !customerName) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Sorry, I need the customer name to put this on credit.',
      });
    }

    let customer = null;
    if (customerName) {
      customer = await findOrCreateCustomer(client, customerName);
    }

    const spokenParts = [];
    let grandTotal = 0;

    for (const line of items) {
      const qty = Number(line.qty);
      const itemName = String(line.name || '').trim();

      if (!itemName || !Number.isFinite(qty) || qty <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'Sorry, I need a valid item name and quantity.',
        });
      }

      const itemLookup = await client.query(
        `SELECT id, name, qty_on_hand, price,
                (price * $1)::numeric(10,2) AS line_total
           FROM items
          WHERE name ILIKE $2
          ORDER BY CASE WHEN lower(name) = lower($3) THEN 0
                        WHEN name ILIKE $4 THEN 1
                        ELSE 2 END,
                   length(name)
          LIMIT 1`,
        [qty, `%${itemName}%`, itemName, `${itemName}%`]
      );

      const item = itemLookup.rows[0];

      if (!item) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          message: `Sorry, I could not find ${itemName} in the inventory.`,
        });
      }

      if (Number(item.qty_on_hand) < qty) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: `Sorry, ${item.name} is short. Only ${item.qty_on_hand} left.`,
        });
      }

      const decremented = await client.query(
        `UPDATE items
            SET qty_on_hand = qty_on_hand - $1
          WHERE id = $2
            AND qty_on_hand >= $1
          RETURNING name, qty_on_hand`,
        [qty, item.id]
      );

      if (!decremented.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: `Sorry, ${item.name} stock changed. Please try again.`,
        });
      }

      const lineTotal = Number(item.line_total);
      grandTotal += lineTotal;

      await client.query(
        `INSERT INTO transactions (type, item_id, qty, total, payment_type, customer_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          action,
          item.id,
          qty,
          lineTotal,
          paymentType || (action === 'credit' ? 'credit' : 'cash'),
          customer?.id || null,
        ]
      );

      spokenParts.push(
        `${item.name} stock is now ${decremented.rows[0].qty_on_hand}`
      );
    }

    if (action === 'credit' && customer) {
      await client.query(
        `UPDATE customers SET balance = balance + $1 WHERE id = $2`,
        [grandTotal, customer.id]
      );
    }

    await client.query('COMMIT');

    const paymentLabel = action === 'credit' ? 'credit' : paymentType || 'cash';
    const customerBit = customer ? ` for ${customer.name}` : '';
    const message = `Recorded ${formatBob(grandTotal)} bob ${paymentLabel}${customerBit}. ${spokenParts.join('. ')}.`;

    return res.json({ message });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }

    console.error('Transaction failed:', error);
    return res.status(500).json({
      message: 'Sorry, I could not record that. Please try again.',
    });
  } finally {
    client.release();
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'sautiledger' });
});

const server = app.listen(PORT, () => {
  console.log(`SautiLedger API listening on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. On macOS, AirPlay Receiver often binds 5000. Set PORT in .env or disable AirPlay Receiver.`
    );
    process.exit(1);
  }
  throw err;
});
