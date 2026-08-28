import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../lib/auth.js';

export const itemsRouter = Router();

itemsRouter.use(requireAuth);

itemsRouter.get('/', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const lowOnly = req.query.low === 'true';

    const { rows } = await query(
      `SELECT id, name, unit, qty_on_hand, cost_price, price, low_stock_threshold,
              (qty_on_hand <= low_stock_threshold) AS low_stock,
              (qty_on_hand * price) AS retail_value
         FROM items
        WHERE business_id = $1
          AND archived_at IS NULL
          AND ($2 = '' OR name ILIKE '%' || $2 || '%')
          AND ($3 = FALSE OR qty_on_hand <= low_stock_threshold)
        ORDER BY (qty_on_hand <= low_stock_threshold) DESC, name ASC`,
      [req.businessId, search, lowOnly]
    );

    return res.json({ items: rows });
  } catch (error) {
    return next(error);
  }
});

itemsRouter.post('/', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const price = Number(req.body?.price);

    if (!name) return res.status(400).json({ message: 'Give the item a name.' });
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ message: 'Enter a selling price greater than zero.' });
    }

    const duplicate = await query(
      `SELECT id FROM items
        WHERE business_id = $1 AND archived_at IS NULL AND lower(name) = lower($2)`,
      [req.businessId, name]
    );
    if (duplicate.rows[0]) {
      return res.status(409).json({ message: `${name} is already in your inventory.` });
    }

    const { rows } = await query(
      `INSERT INTO items
         (business_id, name, unit, qty_on_hand, cost_price, price, low_stock_threshold)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *, (qty_on_hand <= low_stock_threshold) AS low_stock`,
      [
        req.businessId,
        name,
        String(req.body?.unit || 'piece'),
        Number(req.body?.qty_on_hand) || 0,
        Number(req.body?.cost_price) || 0,
        price,
        Number(req.body?.low_stock_threshold) || 5,
      ]
    );

    return res.status(201).json({ item: rows[0] });
  } catch (error) {
    return next(error);
  }
});

itemsRouter.patch('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE items
          SET name = COALESCE($3, name),
              unit = COALESCE($4, unit),
              qty_on_hand = COALESCE($5, qty_on_hand),
              cost_price = COALESCE($6, cost_price),
              price = COALESCE($7, price),
              low_stock_threshold = COALESCE($8, low_stock_threshold),
              updated_at = NOW()
        WHERE id = $1 AND business_id = $2 AND archived_at IS NULL
        RETURNING *, (qty_on_hand <= low_stock_threshold) AS low_stock`,
      [
        req.params.id,
        req.businessId,
        req.body?.name?.trim() || null,
        req.body?.unit || null,
        req.body?.qty_on_hand ?? null,
        req.body?.cost_price ?? null,
        req.body?.price ?? null,
        req.body?.low_stock_threshold ?? null,
      ]
    );

    if (!rows[0]) return res.status(404).json({ message: 'Item not found.' });
    return res.json({ item: rows[0] });
  } catch (error) {
    return next(error);
  }
});

itemsRouter.delete('/:id', async (req, res, next) => {
  try {
    // Archived, not deleted: past transactions keep pointing at a real row.
    const { rows } = await query(
      `UPDATE items SET archived_at = NOW()
        WHERE id = $1 AND business_id = $2 AND archived_at IS NULL
        RETURNING id`,
      [req.params.id, req.businessId]
    );

    if (!rows[0]) return res.status(404).json({ message: 'Item not found.' });
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});
