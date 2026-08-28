import { query } from '../db.js';
import { formatAmount, formatQty, resolveRange } from '../lib/format.js';
import { classifyQuestion, inferPeriod } from '../lib/nlu.js';

/**
 * Every figure the app displays or speaks is produced by these queries.
 * The assistant chooses which question to ask; SQL supplies the numbers.
 */

export async function getTotals(businessId, from, to) {
  const { rows } = await query(
    `SELECT
       COALESCE(SUM(total) FILTER (WHERE type = 'sale'), 0)        AS cash_sales,
       COALESCE(SUM(total) FILTER (WHERE type = 'credit'), 0)      AS credit_given,
       COALESCE(SUM(total) FILTER (WHERE type = 'repayment'), 0)   AS collected,
       COALESCE(SUM(total) FILTER (WHERE type IN ('sale','credit')), 0) AS revenue,
       COALESCE(SUM(unit_cost * qty) FILTER (WHERE type IN ('sale','credit')), 0) AS cost,
       COUNT(*) FILTER (WHERE type IN ('sale','credit'))           AS entries
     FROM transactions
     WHERE business_id = $1
       AND voided_at IS NULL
       AND created_at BETWEEN $2 AND $3`,
    [businessId, from, to]
  );

  const row = rows[0];
  return {
    cash_sales: Number(row.cash_sales),
    credit_given: Number(row.credit_given),
    collected: Number(row.collected),
    revenue: Number(row.revenue),
    cost: Number(row.cost),
    profit: Number(row.revenue) - Number(row.cost),
    entries: Number(row.entries),
  };
}

export async function getLowStock(businessId) {
  const { rows } = await query(
    `SELECT id, name, unit, qty_on_hand, low_stock_threshold, price
       FROM items
      WHERE business_id = $1
        AND archived_at IS NULL
        AND qty_on_hand <= low_stock_threshold
      ORDER BY qty_on_hand ASC, name ASC`,
    [businessId]
  );
  return rows;
}

export async function getTopItems(businessId, from, to, limit = 5) {
  const { rows } = await query(
    `SELECT item_name AS name,
            SUM(qty)   AS qty,
            SUM(total) AS revenue
       FROM transactions
      WHERE business_id = $1
        AND voided_at IS NULL
        AND type IN ('sale', 'credit')
        AND item_name IS NOT NULL
        AND created_at BETWEEN $2 AND $3
      GROUP BY item_name
      ORDER BY revenue DESC
      LIMIT $4`,
    [businessId, from, to, limit]
  );
  return rows.map((row) => ({
    name: row.name,
    qty: Number(row.qty),
    revenue: Number(row.revenue),
  }));
}

export async function getStockValue(businessId) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(qty_on_hand * cost_price), 0) AS at_cost,
            COALESCE(SUM(qty_on_hand * price), 0)      AS at_retail,
            COUNT(*)                                    AS item_count
       FROM items
      WHERE business_id = $1 AND archived_at IS NULL`,
    [businessId]
  );
  return {
    at_cost: Number(rows[0].at_cost),
    at_retail: Number(rows[0].at_retail),
    item_count: Number(rows[0].item_count),
  };
}

export async function getOutstandingDebt(businessId) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(balance), 0) AS total,
            COUNT(*) FILTER (WHERE balance > 0) AS debtors
       FROM customers WHERE business_id = $1`,
    [businessId]
  );
  return { total: Number(rows[0].total), debtors: Number(rows[0].debtors) };
}

export async function getTopDebtors(businessId, limit = 5) {
  const { rows } = await query(
    `SELECT id, name, balance FROM customers
      WHERE business_id = $1 AND balance > 0
      ORDER BY balance DESC LIMIT $2`,
    [businessId, limit]
  );
  return rows.map((row) => ({ ...row, balance: Number(row.balance) }));
}

export async function getDailySeries(businessId, from, to) {
  const { rows } = await query(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            COALESCE(SUM(t.total) FILTER (WHERE t.type = 'sale'), 0)   AS cash,
            COALESCE(SUM(t.total) FILTER (WHERE t.type = 'credit'), 0) AS credit
       FROM generate_series($2::date, $3::date, interval '1 day') AS d(day)
       LEFT JOIN transactions t
         ON t.business_id = $1
        AND t.voided_at IS NULL
        AND t.created_at >= d.day
        AND t.created_at < d.day + interval '1 day'
      GROUP BY d.day
      ORDER BY d.day`,
    [businessId, from, to]
  );
  return rows.map((row) => ({
    day: row.day,
    cash: Number(row.cash),
    credit: Number(row.credit),
  }));
}

/**
 * The one proactive line on the dashboard. It only ever states a fact the
 * database can prove, so it can never invent a trend.
 */
export async function getProactiveTip(businessId) {
  const low = await getLowStock(businessId);
  if (low.length > 0) {
    const names = low.slice(0, 2).map((item) => item.name).join(' and ');
    return {
      text: `${names} ${low.length > 1 ? 'are' : 'is'} running low. Restock before the weekend rush.`,
      action: 'inventory',
    };
  }

  const debt = await getOutstandingDebt(businessId);
  if (debt.total > 0) {
    const [top] = await getTopDebtors(businessId, 1);
    if (top) {
      return {
        text: `${top.name} owes you KES ${formatAmount(top.balance)} of the KES ${formatAmount(debt.total)} outstanding.`,
        action: 'customers',
      };
    }
  }

  const thisWeek = resolveRange('week');
  const totals = await getTotals(businessId, thisWeek.from, thisWeek.to);
  if (totals.entries > 0) {
    return {
      text: `You have made KES ${formatAmount(totals.profit)} profit this week across ${totals.entries} sales.`,
      action: 'reports',
    };
  }

  return {
    text: 'Tap the mic and say something like "sell two unga cash" to record your first sale.',
    action: null,
  };
}

/** Grounded answers: the sentence is a template, the numbers are from SQL. */
export async function answerQuestion(businessId, question) {
  const kind = classifyQuestion(question);
  const period = inferPeriod(question);
  const range = resolveRange(period);

  if (kind === 'top_debtors') {
    const debtors = await getTopDebtors(businessId, 5);
    const debt = await getOutstandingDebt(businessId);
    if (debtors.length === 0) {
      return { answer: 'Nobody owes you anything right now. Your book is clean.', data: { debtors: [] } };
    }
    const top = debtors[0];
    const others =
      debt.debtors === 1
        ? 'They are the only one with a balance.'
        : `Across ${debt.debtors} customers you are owed KES ${formatAmount(debt.total)}.`;
    return {
      answer: `${top.name} owes you the most at KES ${formatAmount(top.balance)}. ${others}`,
      data: { debtors, total: debt.total },
    };
  }

  if (kind === 'restock') {
    const low = await getLowStock(businessId);
    if (low.length === 0) {
      return { answer: 'Nothing is below its low-stock level. You are well stocked.', data: { items: [] } };
    }
    const names = low
      .slice(0, 3)
      .map((item) => `${item.name} (${formatQty(item.qty_on_hand)} ${item.unit} left)`)
      .join(', ');
    return {
      answer: `Restock ${names}. ${low.length} item${low.length > 1 ? 's are' : ' is'} at or below your threshold.`,
      data: { items: low },
    };
  }

  if (kind === 'profit') {
    const totals = await getTotals(businessId, range.from, range.to);
    return {
      answer: `You made KES ${formatAmount(totals.profit)} profit ${range.label}, from KES ${formatAmount(totals.revenue)} of sales against KES ${formatAmount(totals.cost)} of stock cost.`,
      data: totals,
    };
  }

  if (kind === 'top_items') {
    const items = await getTopItems(businessId, range.from, range.to, 5);
    if (items.length === 0) {
      return { answer: `No sales recorded ${range.label} yet.`, data: { items: [] } };
    }
    const list = items
      .slice(0, 3)
      .map((item) => `${item.name} (KES ${formatAmount(item.revenue)})`)
      .join(', ');
    return { answer: `Your best sellers ${range.label} are ${list}.`, data: { items } };
  }

  if (kind === 'stock_value') {
    const stock = await getStockValue(businessId);
    return {
      answer: `Your ${stock.item_count} items are worth KES ${formatAmount(stock.at_cost)} at cost, KES ${formatAmount(stock.at_retail)} at your selling prices.`,
      data: stock,
    };
  }

  if (kind === 'sales_summary') {
    const totals = await getTotals(businessId, range.from, range.to);
    return {
      answer: `${range.label === 'today' ? 'Today' : `For ${range.label}`} you have KES ${formatAmount(totals.cash_sales)} in cash sales, KES ${formatAmount(totals.credit_given)} given on credit, and KES ${formatAmount(totals.collected)} collected from debts.`,
      data: totals,
    };
  }

  return {
    answer:
      'I can answer questions about your sales, profit, stock, and debts. Try "who owes me the most?", "should I restock?", or "how much profit this week?".',
    data: null,
  };
}
