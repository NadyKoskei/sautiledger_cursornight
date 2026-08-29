import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { LedgerError, recordTransaction } from '../services/ledger.js';
import { getOutstandingDebt } from '../services/analytics.js';

export const customersRouter = Router();

customersRouter.use(requireAuth);

customersRouter.get('/', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();

    const { rows } = await query(
      `SELECT id, name, phone, balance, created_at
         FROM customers
        WHERE business_id = $1
          AND ($2 = '' OR name ILIKE '%' || $2 || '%')
        ORDER BY balance DESC, name ASC`,
      [req.businessId, search]
    );

    const debt = await getOutstandingDebt(req.businessId);

    const taken = await query(
      `SELECT t.id,
              t.batch_id,
              t.item_name,
              t.qty,
              t.total,
              t.created_at,
              c.id   AS customer_id,
              c.name AS customer_name,
              c.balance
         FROM transactions t
         JOIN customers c ON c.id = t.customer_id
        WHERE t.business_id = $1
          AND t.type = 'credit'
          AND t.voided_at IS NULL
          AND t.item_name IS NOT NULL
          AND c.balance > 0
          AND ($2 = '' OR c.name ILIKE '%' || $2 || '%' OR t.item_name ILIKE '%' || $2 || '%')
        ORDER BY t.created_at DESC
        LIMIT 80`,
      [req.businessId, search]
    );

    return res.json({
      customers: rows,
      taken: taken.rows.map((row) => ({
        ...row,
        qty: Number(row.qty),
        total: Number(row.total),
        balance: Number(row.balance),
      })),
      outstanding: debt.total,
      debtors: debt.debtors,
    });
  } catch (error) {
    return next(error);
  }
});

customersRouter.post('/', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Give the customer a name.' });

    const duplicate = await query(
      `SELECT id FROM customers WHERE business_id = $1 AND lower(name) = lower($2)`,
      [req.businessId, name]
    );
    if (duplicate.rows[0]) {
      return res.status(409).json({ message: `${name} is already in your book.` });
    }

    const { rows } = await query(
      `INSERT INTO customers (business_id, name, phone, balance)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.businessId, name, req.body?.phone || null, Number(req.body?.balance) || 0]
    );

    return res.status(201).json({ customer: rows[0] });
  } catch (error) {
    return next(error);
  }
});

customersRouter.get('/:id', async (req, res, next) => {
  try {
    const customer = await query(
      `SELECT id, name, phone, balance, created_at
         FROM customers WHERE id = $1 AND business_id = $2`,
      [req.params.id, req.businessId]
    );
    if (!customer.rows[0]) return res.status(404).json({ message: 'Customer not found.' });

    const history = await query(
      `SELECT id, batch_id, type, item_name, qty, unit_price, total, payment_type, created_at
         FROM transactions
        WHERE business_id = $1 AND customer_id = $2 AND voided_at IS NULL
        ORDER BY created_at DESC
        LIMIT 100`,
      [req.businessId, req.params.id]
    );

    return res.json({ customer: customer.rows[0], history: history.rows });
  } catch (error) {
    return next(error);
  }
});

customersRouter.post('/:id/repayment', async (req, res, next) => {
  try {
    const customer = await query(
      `SELECT name FROM customers WHERE id = $1 AND business_id = $2`,
      [req.params.id, req.businessId]
    );
    if (!customer.rows[0]) return res.status(404).json({ message: 'Customer not found.' });

    const result = await recordTransaction(
      req.businessId,
      {
        action: 'repayment',
        customer_name: customer.rows[0].name,
        amount: Number(req.body?.amount),
      },
      { source: req.body?.source === 'voice' ? 'voice' : 'manual' }
    );

    return res.json(result);
  } catch (error) {
    if (error instanceof LedgerError) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});
