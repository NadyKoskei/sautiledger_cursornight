const LOCALE = 'en-KE';

export function formatAmount(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number)
    ? number.toLocaleString(LOCALE)
    : number.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatQty(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
}

/**
 * Range boundaries are computed here so every report and assistant answer
 * measures the same window.
 */
export function resolveRange(range, from, to) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (range) {
    case 'today':
      return { from: startOfToday, to: now, label: 'today' };
    case 'week': {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 6);
      return { from: start, to: now, label: 'this week' };
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: start, to: now, label: 'this month' };
    }
    case 'year': {
      const start = new Date(now.getFullYear(), 0, 1);
      return { from: start, to: now, label: 'this year' };
    }
    case 'custom': {
      const start = from ? new Date(from) : startOfToday;
      const end = to ? new Date(to) : now;
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return { from: startOfToday, to: now, label: 'today' };
      }
      end.setHours(23, 59, 59, 999);
      return { from: start, to: end, label: 'that period' };
    }
    default:
      return { from: startOfToday, to: now, label: 'today' };
  }
}
