import { formatAmount, formatQty } from '../lib/format.js';
import { withTransaction } from '../db.js';

export class LedgerError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function findItem(client, businessId, name) {
  const { rows } = await client.query(
    `SELECT id, name, unit, qty_on_hand, cost_price, price, low_stock_threshold
       FROM items
      WHERE business_id = $1
        AND archived_at IS NULL
        AND name ILIKE $2
      ORDER BY CASE WHEN lower(name) = lower($3) THEN 0
                    WHEN name ILIKE $4 THEN 1
                    ELSE 2 END,
               length(name)
      LIMIT 1`,
    [businessId, `%${name}%`, name, `${name}%`]
  );
  return rows[0] || null;
}

async function findOrCreateCustomer(client, businessId, name) {
  const existing = await client.query(
    `SELECT id, name, balance FROM customers
      WHERE business_id = $1 AND name ILIKE $2 LIMIT 1`,
    [businessId, name]
  );
  if (existing.rows[0]) return existing.rows[0];

  const created = await client.query(
    `INSERT INTO customers (business_id, name) VALUES ($1, $2)
     RETURNING id, name, balance`,
    [businessId, name]
  );
  return created.rows[0];
}

/**
 * Records a sale, credit sale, or repayment.
 *
 * The caller supplies only names and quantities. Prices, totals, stock levels,
 * and balances are read from and written to Postgres inside one transaction.
 */
export async function recordTransaction(businessId, intent, options = {}) {
  const { source = 'voice', transcript = null } = options;
  const action = intent?.action;

  if (!['sale', 'credit', 'repayment'].includes(action)) {
    throw new LedgerError(400, 'Sorry, I could not tell if that was a sale, credit, or repayment.');
  }

  return withTransaction(async (client) => {
    if (action === 'repayment') {
      return recordRepayment(client, businessId, intent, { source, transcript });
    }
    return recordSale(client, businessId, intent, { source, transcript });
  });
}

async function recordRepayment(client, businessId, intent, { source, transcript }) {
  const name = String(intent.customer_name || '').trim();
  const amount = Number(intent.amount);

  if (!name) throw new LedgerError(400, 'Sorry, I need the customer name to record a repayment.');
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new LedgerError(400, 'Sorry, I need the amount that was repaid.');
  }

  const found = await client.query(
    `SELECT id, name, balance FROM customers
      WHERE business_id = $1 AND name ILIKE $2 LIMIT 1`,
    [businessId, `%${name}%`]
  );
  const customer = found.rows[0];
  if (!customer) throw new LedgerError(404, `Sorry, ${name} is not in your customer book.`);

  const updated = await client.query(
    `UPDATE customers SET balance = GREATEST(balance - $1, 0)
      WHERE id = $2 RETURNING name, balance`,
    [amount, customer.id]
  );

  const inserted = await client.query(
    `INSERT INTO transactions
       (business_id, type, total, payment_type, customer_id, source, transcript)
     VALUES ($1, 'repayment', $2, 'cash', $3, $4, $5)
     RETURNING id, batch_id, created_at`,
    [businessId, amount, customer.id, source, transcript]
  );

  const balance = updated.rows[0].balance;

  return {
    message: `Recorded ${formatAmount(amount)} bob repayment from ${updated.rows[0].name}. Balance is now ${formatAmount(balance)} bob.`,
    receipt: {
      batch_id: inserted.rows[0].batch_id,
      action: 'repayment',
      created_at: inserted.rows[0].created_at,
      payment_type: 'cash',
      customer: { id: customer.id, name: updated.rows[0].name, balance },
      lines: [],
      total: amount,
    },
  };
}

async function recordSale(client, businessId, intent, { source, transcript }) {
  const action = intent.action;
  const lines = Array.isArray(intent.items) ? intent.items : [];

  if (lines.length === 0) throw new LedgerError(400, 'Sorry, I did not catch which item to record.');

  const customerName = String(intent.customer_name || '').trim();
  if (action === 'credit' && !customerName) {
    throw new LedgerError(400, 'Sorry, I need the customer name to put this on credit.');
  }

  const customer = customerName
    ? await findOrCreateCustomer(client, businessId, customerName)
    : null;

  const batch = await client.query('SELECT gen_random_uuid() AS id');
  const batchId = batch.rows[0].id;
  const paymentType = action === 'credit' ? 'credit' : 'cash';

  const recorded = [];
  let total = 0;
  let createdAt = null;

  for (const line of lines) {
    const name = String(line?.name || '').trim();
    const qty = Number(line?.qty);

    if (!name || !Number.isFinite(qty) || qty <= 0) {
      throw new LedgerError(400, 'Sorry, I need a valid item and quantity.');
    }

    const item = await findItem(client, businessId, name);
    if (!item) throw new LedgerError(404, `Sorry, ${name} is not in your inventory.`);

    if (Number(item.qty_on_hand) < qty) {
      throw new LedgerError(
        409,
        `Sorry, you only have ${formatQty(item.qty_on_hand)} ${item.unit} of ${item.name} left.`
      );
    }

    // Price and line total come from the row itself, never from the caller.
    const updated = await client.query(
      `UPDATE items
          SET qty_on_hand = qty_on_hand - $1, updated_at = NOW()
        WHERE id = $2 AND qty_on_hand >= $1
        RETURNING qty_on_hand`,
      [qty, item.id]
    );
    if (!updated.rows[0]) {
      throw new LedgerError(409, `Sorry, ${item.name} stock changed. Please try again.`);
    }

    const inserted = await client.query(
      `INSERT INTO transactions
         (business_id, batch_id, type, item_id, item_name, qty, unit_price, unit_cost,
          total, payment_type, customer_id, source, transcript)
       VALUES ($1, $2, $3, $4, $5, $6,
               (SELECT price FROM items WHERE id = $4),
               (SELECT cost_price FROM items WHERE id = $4),
               (SELECT price * $6 FROM items WHERE id = $4),
               $7, $8, $9, $10)
       RETURNING id, qty, unit_price, total, created_at`,
      [
        businessId, batchId, action, item.id, item.name, qty,
        paymentType, customer?.id || null, source, transcript,
      ]
    );

    const row = inserted.rows[0];
    total += Number(row.total);
    createdAt = createdAt || row.created_at;
    recorded.push({
      item_id: item.id,
      name: item.name,
      unit: item.unit,
      qty: Number(row.qty),
      unit_price: Number(row.unit_price),
      total: Number(row.total),
      qty_on_hand: Number(updated.rows[0].qty_on_hand),
      low_stock: Number(updated.rows[0].qty_on_hand) <= Number(item.low_stock_threshold),
    });
  }

  let balance = null;
  if (action === 'credit' && customer) {
    const updated = await client.query(
      `UPDATE customers SET balance = balance + $1 WHERE id = $2 RETURNING balance`,
      [total, customer.id]
    );
    balance = Number(updated.rows[0].balance);
  }

  const spokenStock = recorded
    .map((line) => `${line.name} stock is now ${formatQty(line.qty_on_hand)}`)
    .join('. ');

  let message;
  if (action === 'credit' && customer) {
    const taken = recorded
      .map((line) => `${line.name} × ${formatQty(line.qty)}`)
      .join(', ');
    message = `${customer.name} took ${taken} on credit, ${formatAmount(total)} bob. Balance is now ${formatAmount(balance)} bob. ${spokenStock}.`;
  } else {
    const who = customer ? ` for ${customer.name}` : '';
    message = `Recorded ${formatAmount(total)} bob cash${who}. ${spokenStock}.`;
  }

  return {
    message,
    receipt: {
      batch_id: batchId,
      action,
      created_at: createdAt,
      payment_type: paymentType,
      customer: customer ? { id: customer.id, name: customer.name, balance } : null,
      lines: recorded,
      total,
    },
  };
}

/** Adds stock back in — the "add 20 sugar" voice shortcut on the Inventory screen. */
export async function restockItems(businessId, items) {
  return withTransaction(async (client) => {
    const updated = [];

    for (const line of items || []) {
      const name = String(line?.name || '').trim();
      const qty = Number(line?.qty);
      if (!name || !Number.isFinite(qty) || qty <= 0) {
        throw new LedgerError(400, 'Sorry, I need a valid item and quantity to add.');
      }

      const item = await findItem(client, businessId, name);
      if (!item) throw new LedgerError(404, `Sorry, ${name} is not in your inventory.`);

      const result = await client.query(
        `UPDATE items SET qty_on_hand = qty_on_hand + $1, updated_at = NOW()
          WHERE id = $2 RETURNING name, unit, qty_on_hand`,
        [qty, item.id]
      );
      updated.push(result.rows[0]);
    }

    const spoken = updated
      .map((row) => `${row.name} stock is now ${formatQty(row.qty_on_hand)}`)
      .join('. ');

    return { message: `Stock updated. ${spoken}.`, items: updated };
  });
}

/**
 * Reverses a whole voice entry: restores stock, unwinds any credit balance,
 * and marks the rows voided rather than deleting the audit trail.
 */
export async function undoBatch(businessId, batchId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id, type, item_id, qty, total, customer_id
         FROM transactions
        WHERE business_id = $1 AND batch_id = $2 AND voided_at IS NULL`,
      [businessId, batchId]
    );

    if (rows.length === 0) throw new LedgerError(404, 'That entry was already undone.');

    for (const row of rows) {
      if (row.item_id && row.qty) {
        await client.query(
          `UPDATE items SET qty_on_hand = qty_on_hand + $1, updated_at = NOW() WHERE id = $2`,
          [row.qty, row.item_id]
        );
      }

      if (row.customer_id) {
        const delta = row.type === 'repayment' ? Number(row.total) : -Number(row.total);
        await client.query(
          `UPDATE customers SET balance = GREATEST(balance + $1, 0) WHERE id = $2`,
          [delta, row.customer_id]
        );
      }
    }

    await client.query(
      `UPDATE transactions SET voided_at = NOW()
        WHERE business_id = $1 AND batch_id = $2 AND voided_at IS NULL`,
      [businessId, batchId]
    );

    return { message: 'Undone. The stock and balance are back where they were.' };
  });
}
