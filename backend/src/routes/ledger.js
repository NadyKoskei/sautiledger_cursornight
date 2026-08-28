import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { parseIntent } from '../lib/nlu.js';
import { LedgerError, recordTransaction, restockItems, undoBatch } from '../services/ledger.js';

export const ledgerRouter = Router();

/**
 * Ears only. Turns speech into a strict intent and stops there.
 * No price, quantity on hand, or total is read here.
 */
ledgerRouter.post('/parse-intent', (req, res) => {
  const transcript = req.body?.transcript;

  if (!transcript || typeof transcript !== 'string') {
    return res.status(400).json({ message: 'I did not hear anything. Try again.' });
  }

  return res.json(parseIntent(transcript));
});

ledgerRouter.post('/transaction', requireAuth, async (req, res, next) => {
  try {
    if (req.body?.action === 'restock') {
      const result = await restockItems(req.businessId, req.body.items);
      return res.json(result);
    }

    const result = await recordTransaction(req.businessId, req.body, {
      source: req.body?.source === 'manual' ? 'manual' : 'voice',
      transcript: req.body?.transcript || null,
    });

    return res.json(result);
  } catch (error) {
    if (error instanceof LedgerError) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});

ledgerRouter.get('/transactions', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const scope = req.query.scope === 'all' ? 'all' : 'today';

    const { rows } = await query(
      `SELECT t.batch_id,
              MIN(t.created_at)                              AS created_at,
              MIN(t.type)                                    AS type,
              MIN(t.payment_type)                            AS payment_type,
              MIN(t.source)                                  AS source,
              MIN(t.transcript)                              AS transcript,
              SUM(t.total)                                   AS total,
              MAX(c.name)                                    AS customer_name,
              MIN(t.customer_id)                             AS customer_id,
              json_agg(
                json_build_object(
                  'name', t.item_name, 'qty', t.qty, 'unit_price', t.unit_price, 'total', t.total
                ) ORDER BY t.id
              ) FILTER (WHERE t.item_name IS NOT NULL)       AS lines
         FROM transactions t
         LEFT JOIN customers c ON c.id = t.customer_id
        WHERE t.business_id = $1
          AND t.voided_at IS NULL
          AND ($2 = 'all' OR t.created_at >= date_trunc('day', NOW()))
        GROUP BY t.batch_id
        ORDER BY created_at DESC
        LIMIT $3`,
      [req.businessId, scope, limit]
    );

    return res.json({
      transactions: rows.map((row) => ({ ...row, total: Number(row.total), lines: row.lines || [] })),
    });
  } catch (error) {
    return next(error);
  }
});

ledgerRouter.post('/transactions/:batchId/undo', requireAuth, async (req, res, next) => {
  try {
    const result = await undoBatch(req.businessId, req.params.batchId);
    return res.json(result);
  } catch (error) {
    if (error instanceof LedgerError) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});
