import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { resolveRange } from '../lib/format.js';
import {
  answerQuestion,
  getDailySeries,
  getLowStock,
  getOutstandingDebt,
  getProactiveTip,
  getStockValue,
  getTopItems,
  getTotals,
} from '../services/analytics.js';

export const insightsRouter = Router();

insightsRouter.use(requireAuth);

insightsRouter.get('/dashboard', async (req, res, next) => {
  try {
    const today = resolveRange('today');
    const [totals, lowStock, debt, tip] = await Promise.all([
      getTotals(req.businessId, today.from, today.to),
      getLowStock(req.businessId),
      getOutstandingDebt(req.businessId),
      getProactiveTip(req.businessId),
    ]);

    return res.json({ totals, low_stock: lowStock, outstanding: debt, tip });
  } catch (error) {
    return next(error);
  }
});

insightsRouter.get('/reports', async (req, res, next) => {
  try {
    const range = resolveRange(req.query.range || 'today', req.query.from, req.query.to);
    const [totals, topItems, stock, series, debt] = await Promise.all([
      getTotals(req.businessId, range.from, range.to),
      getTopItems(req.businessId, range.from, range.to, 5),
      getStockValue(req.businessId),
      getDailySeries(req.businessId, range.from, range.to),
      getOutstandingDebt(req.businessId),
    ]);

    return res.json({
      range: { label: range.label, from: range.from, to: range.to },
      totals,
      top_items: topItems,
      stock,
      series,
      outstanding: debt,
    });
  } catch (error) {
    return next(error);
  }
});

insightsRouter.post('/assistant', async (req, res, next) => {
  try {
    const question = String(req.body?.question || '').trim();
    if (!question) return res.status(400).json({ message: 'Ask me something about your shop.' });

    const result = await answerQuestion(req.businessId, question);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});
