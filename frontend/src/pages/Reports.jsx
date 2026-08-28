import { useCallback, useEffect, useState } from 'react';
import { Share2, TrendingDown, TrendingUp } from 'lucide-react';
import { Screen, ScreenHeader } from '../components/Screen.jsx';
import { Button, Card, SegmentedControl, Skeleton } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api';
import { money, qty as formatQty, shortDay } from '../lib/format';

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'custom', label: 'Custom' },
];

export default function Reports() {
  const { business } = useAuth();
  const { notify } = useToast();
  const currency = business?.currency || 'KES';

  const [range, setRange] = useState('week');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = range === 'custom' ? { range, ...custom } : { range };
      setData(await api.reports(params));
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [custom, notify, range]);

  useEffect(() => {
    if (range === 'custom' && (!custom.from || !custom.to)) return;
    load();
  }, [custom.from, custom.to, load, range]);

  async function share() {
    if (!data) return;
    const text =
      `${business.business_name} — ${data.range.label}\n` +
      `Revenue: ${money(data.totals.revenue, { currency })}\n` +
      `Cost: ${money(data.totals.cost, { currency })}\n` +
      `Profit: ${money(data.totals.profit, { currency })}\n` +
      `Cash: ${money(data.totals.cash_sales, { currency })} · ` +
      `Credit: ${money(data.totals.credit_given, { currency })}`;

    try {
      if (navigator.share) await navigator.share({ title: 'SautiLedger report', text });
      else {
        await navigator.clipboard.writeText(text);
        notify('Report copied to clipboard.', 'success');
      }
    } catch {
      // A cancelled share sheet is not an error worth reporting.
    }
  }

  const totals = data?.totals;
  const profitUp = totals ? totals.profit >= 0 : true;

  return (
    <>
      <ScreenHeader
        title="Reports"
        subtitle={data ? `Showing ${data.range.label}` : 'Crunching the numbers'}
        action={
          <Button size="sm" variant="secondary" onClick={share} disabled={!data}>
            <Share2 size={16} />
            Share
          </Button>
        }
      />

      <Screen>
        <SegmentedControl size="sm" value={range} onChange={setRange} options={RANGES} />

        {range === 'custom' && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input
              type="date"
              value={custom.from}
              onChange={(event) => setCustom({ ...custom, from: event.target.value })}
              className="h-11 rounded-2xl border border-line bg-white px-3 text-sm"
            />
            <input
              type="date"
              value={custom.to}
              onChange={(event) => setCustom({ ...custom, to: event.target.value })}
              className="h-11 rounded-2xl border border-line bg-white px-3 text-sm"
            />
          </div>
        )}

        {loading || !data ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-40" />
            <Skeleton className="h-32" />
          </div>
        ) : (
          <>
            <Card className="mt-4">
              <p className="text-xs uppercase tracking-wide text-dust">Net profit</p>
              <div className="flex items-baseline gap-2">
                <p
                  className={`font-display text-4xl font-semibold ${
                    profitUp ? 'text-grove' : 'text-danger'
                  }`}
                >
                  {money(totals.profit, { currency })}
                </p>
                {profitUp ? (
                  <TrendingUp size={18} className="text-grove" />
                ) : (
                  <TrendingDown size={18} className="text-danger" />
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3">
                <Figure label="Revenue" value={money(totals.revenue, { currency })} />
                <Figure label="Stock cost" value={money(totals.cost, { currency })} />
              </div>
            </Card>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Card>
                <p className="text-xs text-dust">Cash sales</p>
                <p className="font-display text-xl font-semibold text-grove">
                  {money(totals.cash_sales, { currency, compact: true })}
                </p>
              </Card>
              <Card>
                <p className="text-xs text-dust">Credit given</p>
                <p className="font-display text-xl font-semibold text-warn">
                  {money(totals.credit_given, { currency, compact: true })}
                </p>
              </Card>
            </div>

            {data.series.length > 1 && (
              <Card className="mt-3">
                <p className="mb-3 text-sm font-medium">Cash vs credit by day</p>
                <DayChart series={data.series} currency={currency} />
                <div className="mt-3 flex gap-4 text-xs text-dust">
                  <Legend color="bg-grove" label="Cash" />
                  <Legend color="bg-warn" label="Credit" />
                </div>
              </Card>
            )}

            <Card className="mt-3">
              <p className="mb-3 text-sm font-medium">Top sellers</p>
              {data.top_items.length === 0 ? (
                <p className="text-sm text-dust">No sales in this period.</p>
              ) : (
                <ol className="space-y-2">
                  {data.top_items.map((item, index) => (
                    <li key={item.name} className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-grove-light text-xs font-bold text-grove">
                        {index + 1}
                      </span>
                      <span className="flex-1 truncate text-sm">{item.name}</span>
                      <span className="text-xs text-dust">{formatQty(item.qty)} sold</span>
                      <span className="text-sm font-semibold">
                        {money(item.revenue, { currency, compact: true })}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card className="mt-3">
              <p className="mb-2 text-sm font-medium">Closing stock</p>
              <div className="grid grid-cols-2 gap-3">
                <Figure label="At cost" value={money(data.stock.at_cost, { currency })} />
                <Figure label="At retail" value={money(data.stock.at_retail, { currency })} />
              </div>
              <p className="mt-2 text-xs text-dust">
                {data.stock.item_count} items on the shelf · {money(data.outstanding.total, { currency })}{' '}
                still owed to you
              </p>
            </Card>
          </>
        )}
      </Screen>
    </>
  );
}

function Figure({ label, value }) {
  return (
    <div>
      <p className="text-xs text-dust">{label}</p>
      <p className="font-display text-lg font-semibold">{value}</p>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function DayChart({ series, currency }) {
  const peak = Math.max(...series.map((day) => day.cash + day.credit), 1);

  return (
    <div className="flex h-32 items-end justify-between gap-1.5">
      {series.map((day) => {
        const total = day.cash + day.credit;
        return (
          <div key={day.day} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="flex w-full flex-col justify-end overflow-hidden rounded-lg bg-line/40"
              style={{ height: '100%' }}
              title={`${day.day}: ${money(total, { currency })}`}
            >
              <div
                className="w-full bg-warn"
                style={{ height: `${(day.credit / peak) * 100}%` }}
              />
              <div
                className="w-full bg-grove"
                style={{ height: `${(day.cash / peak) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-dust">{shortDay(day.day).slice(0, 2)}</span>
          </div>
        );
      })}
    </div>
  );
}
