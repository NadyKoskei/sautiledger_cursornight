import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { isLedgerCommand, parseIntent } from '../lib/nlu.js';
import { transcribeSpeech } from '../lib/stt.js';
import { synthesizeSpeech } from '../lib/tts.js';
import { answerQuestion, getInventory } from '../services/analytics.js';
import { LedgerError, recordTransaction, restockItems, undoBatch } from '../services/ledger.js';

export const ledgerRouter = Router();

async function loadCatalog(businessId) {
  const items = await getInventory(businessId);
  return items.map((item) => ({ name: item.name, unit: item.unit }));
}

/**
 * Ears only. Turns speech into a strict intent and stops there.
 * No price, quantity on hand, or total is read here.
 * Questions about the shop are answered from the ledger instead of being forced into a sale.
 */
ledgerRouter.post('/parse-intent', requireAuth, async (req, res, next) => {
  try {
    const transcript = req.body?.transcript;

    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ message: 'I did not hear anything. Try again.' });
    }

    const catalog = await loadCatalog(req.businessId);

    if (!isLedgerCommand(transcript)) {
      const result = await answerQuestion(req.businessId, transcript);
      return res.json({
        action: 'ask',
        items: [],
        payment_type: null,
        customer_name: null,
        answer: result.answer,
        data: result.data,
      });
    }

    return res.json(parseIntent(transcript, { catalog }));
  } catch (error) {
    return next(error);
  }
});

ledgerRouter.post('/tts', requireAuth, async (req, res, next) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) {
      return res.status(400).json({ message: 'Nothing to say.' });
    }

    const audio = await synthesizeSpeech(text);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(audio);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    return next(error);
  }
});

ledgerRouter.post('/transcribe', requireAuth, async (req, res, next) => {
  try {
    const audio = req.body?.audio;
    if (!audio || typeof audio !== 'string') {
      return res.status(400).json({ message: 'I did not catch any audio. Tap the mic and try again.' });
    }

    const catalog = await loadCatalog(req.businessId);
    const transcript = await transcribeSpeech({
      audioBase64: audio,
      mimeType: req.body?.mimeType,
      language: req.body?.language,
      keyterms: catalog.map((item) => item.name),
    });

    if (!transcript) {
      return res.status(400).json({ message: 'I could not hear that. Try again in a quieter spot.' });
    }

    return res.json({ transcript });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    return next(error);
  }
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
