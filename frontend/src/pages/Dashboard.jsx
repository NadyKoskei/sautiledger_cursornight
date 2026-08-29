import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Banknote, HandCoins, LogOut, Sparkles, Wallet } from 'lucide-react';
import { MicButton } from '../components/MicButton.jsx';
import { Screen, ScreenHeader } from '../components/Screen.jsx';
import { Card, Skeleton } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api';
import { longDate, money } from '../lib/format';

const TIP_ROUTES = {
  inventory: '/inventory',
  customers: '/customers',
  reports: '/reports',
};

export default function Dashboard() {
  const { business, logout } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await api.dashboard());
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const currency = business?.currency || 'KES';
  const totals = data?.totals;
  const lowStock = data?.low_stock || [];

  return (
    <>
      <ScreenHeader
        title={business?.business_name || 'My shop'}
        subtitle={longDate()}
        action={
          <button
            type="button"
            onClick={logout}
            aria-label="Log out"
            className="flex h-9 w-9 items-center justify-center rounded-full text-dust transition hover:bg-line/50"
          >
            <LogOut size={18} />
          </button>
        }
      />

      <Screen>
        <section aria-label="Today's totals" className="grid grid-cols-3 gap-2">
          {loading || !totals ? (
            <>
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </>
          ) : (
            <>
              <StatTile
                icon={Banknote}
                label="Cash sales"
                value={money(totals.cash_sales, { currency, compact: true })}
                tone="grove"
              />
              <StatTile
                icon={Wallet}
                label="On credit"
                value={money(totals.credit_given, { currency, compact: true })}
                tone="warn"
              />
              <StatTile
                icon={HandCoins}
                label="Collected"
                value={money(totals.collected, { currency, compact: true })}
                tone="grove"
              />
            </>
          )}
        </section>

        {!loading && lowStock.length > 0 && (
          <Link
            to="/inventory"
            className="mt-3 flex items-center gap-3 rounded-2xl bg-warn-light px-4 py-3 ring-1 ring-warn/20 transition active:scale-[0.99]"
          >
            <AlertTriangle size={18} className="shrink-0 text-warn" />
            <span className="flex-1 text-sm font-medium text-warn">
              {lowStock.length} item{lowStock.length > 1 ? 's' : ''} running low:{' '}
              {lowStock.slice(0, 2).map((item) => item.name).join(', ')}
              {lowStock.length > 2 ? '…' : ''}
            </span>
            <ArrowRight size={16} className="text-warn" />
          </Link>
        )}

        {!loading && data?.tip && (
          <button
            type="button"
            onClick={() => data.tip.action && navigate(TIP_ROUTES[data.tip.action] || '/')}
            className="mt-3 flex w-full items-start gap-3 rounded-2xl bg-grove-light px-4 py-3 text-left ring-1 ring-grove/15 transition active:scale-[0.99]"
          >
            <Sparkles size={18} className="mt-0.5 shrink-0 text-grove" />
            <span className="flex-1 text-sm leading-snug text-grove-dark">{data.tip.text}</span>
          </button>
        )}

        <section className="mt-8 flex flex-col items-center">
          <MicButton onClick={() => navigate('/sales')} label="Record a sale by voice" />
          <p className="mt-4 text-center text-base text-dust">
            Tap and say <span className="text-ink">“sell two unga cash”</span>
          </p>
        </section>

        {!loading && data?.outstanding?.total > 0 && (
          <Link to="/customers" className="mt-8 block">
            <Card className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-dust">Outstanding madeni</p>
                <p className="font-display text-2xl font-semibold">
                  {money(data.outstanding.total, { currency })}
                </p>
                <p className="text-xs text-dust">
                  across {data.outstanding.debtors} customer
                  {data.outstanding.debtors === 1 ? '' : 's'}
                </p>
              </div>
              <ArrowRight size={18} className="text-dust" />
            </Card>
          </Link>
        )}
      </Screen>
    </>
  );
}

function StatTile({ icon: Icon, label, value, tone }) {
  const tones = {
    grove: 'text-grove bg-grove-light',
    warn: 'text-warn bg-warn-light',
    clay: 'text-clay bg-clay-light',
  };

  return (
    <Card className="p-3">
      <span
        className={`mb-2 flex h-7 w-7 items-center justify-center rounded-lg ${tones[tone]}`}
      >
        <Icon size={15} />
      </span>
      <p className="text-[11px] leading-tight text-dust">{label}</p>
      <p className="mt-0.5 font-display text-base font-semibold leading-tight">{value}</p>
    </Card>
  );
}
