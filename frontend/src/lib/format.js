const LOCALE = 'en-KE';

export function money(value, { currency = 'KES', compact = false } = {}) {
  const number = Number(value) || 0;
  if (compact && Math.abs(number) >= 10000) {
    return `${currency} ${(number / 1000).toFixed(1)}k`;
  }
  return `${currency} ${number.toLocaleString(LOCALE, {
    minimumFractionDigits: Number.isInteger(number) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function qty(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
}

export function time(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}

export function longDate(value = new Date()) {
  return new Date(value).toLocaleDateString(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function shortDay(value) {
  return new Date(value).toLocaleDateString(LOCALE, { weekday: 'short' });
}

export function summarise(transaction) {
  if (transaction.type === 'repayment') {
    return transaction.customer_name ? `${transaction.customer_name} paid` : 'Repayment';
  }
  const lines = transaction.lines || [];
  if (lines.length === 0) return 'Entry';
  const items = lines.map((line) => `${line.name} x ${qty(line.qty)}`).join(', ');
  if (transaction.type === 'credit' && transaction.customer_name) {
    return `${transaction.customer_name} took ${items}`;
  }
  return items;
}
