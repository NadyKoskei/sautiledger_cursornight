import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, HandCoins, Mic, Plus, Search, Users } from 'lucide-react';
import { Screen, ScreenHeader } from '../components/Screen.jsx';
import { Badge, Button, Card, EmptyState, Field, Input, Sheet, Skeleton } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { api } from '../lib/api';
import { money, qty as formatQty, time } from '../lib/format';
import { playElevenLabsAudio } from '../lib/tts';

export default function Customers() {
  const { business } = useAuth();
  const { notify } = useToast();
  const currency = business?.currency || 'KES';

  const [data, setData] = useState({ customers: [], outstanding: 0, debtors: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.listCustomers(search));
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [notify, search]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  return (
    <>
      <ScreenHeader
        title="Madeni"
        subtitle={`${data.debtors} owing · ${data.customers.length} customers`}
        action={
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={16} />
            New
          </Button>
        }
      />

      <Screen>
        <Card className="bg-grove text-white ring-grove">
          <p className="text-xs uppercase tracking-wide text-white/70">Total outstanding</p>
          <p className="font-display text-3xl font-semibold">
            {money(data.outstanding, { currency })}
          </p>
          <p className="text-xs text-white/70">
            owed by {data.debtors} customer{data.debtors === 1 ? '' : 's'}
          </p>
        </Card>

        <div className="relative mt-4">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dust" />
          <Input
            className="pl-10"
            placeholder="Search customers"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="mt-4 space-y-2">
          {loading ? (
            <>
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </>
          ) : data.customers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No customers yet"
              description="They are added automatically when you record a credit sale."
              action={
                <Button onClick={() => setAdding(true)}>
                  <Plus size={16} />
                  Add customer
                </Button>
              }
            />
          ) : (
            data.customers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => setOpenId(customer.id)}
                className="block w-full text-left"
              >
                <Card className="flex items-center justify-between gap-3 transition active:scale-[0.99]">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-grove-light font-semibold text-grove">
                      {customer.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{customer.name}</p>
                      <p className="text-xs text-dust">
                        {customer.balance > 0 ? 'owes you' : 'all settled'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span
                      className={`font-display text-base font-semibold ${
                        customer.balance > 0 ? 'text-warn' : 'text-dust'
                      }`}
                    >
                      {money(customer.balance, { currency })}
                    </span>
                    <ChevronRight size={16} className="text-dust" />
                  </div>
                </Card>
              </button>
            ))
          )}
        </div>
      </Screen>

      <CustomerSheet
        customerId={openId}
        currency={currency}
        onClose={() => setOpenId(null)}
        onChanged={load}
      />
      <AddCustomerSheet
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          load();
        }}
      />
    </>
  );
}

function CustomerSheet({ customerId, currency, onClose, onChanged }) {
  const { business } = useAuth();
  const { notify } = useToast();
  const [detail, setDetail] = useState(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!customerId) return;
    try {
      setDetail(await api.getCustomer(customerId));
    } catch (error) {
      notify(error.message, 'error');
    }
  }, [customerId, notify]);

  useEffect(() => {
    setDetail(null);
    setAmount('');
    load();
  }, [load]);

  const speech = useSpeechRecognition({
    language: business?.language,
    onResult: (text) => {
      const spokenAmount = text.match(/\d+(?:\.\d+)?/);
      if (spokenAmount) setAmount(spokenAmount[0]);
      else notify('I did not catch an amount. Try "five hundred".', 'error');
    },
  });

  async function record() {
    setBusy(true);
    try {
      const { message } = await api.recordRepayment(customerId, {
        amount: Number(amount),
        source: speech.listening ? 'voice' : 'manual',
      });
      playElevenLabsAudio(message, { language: business?.language });
      notify(message, 'success');
      setAmount('');
      await load();
      onChanged();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!customerId) return null;

  return (
    <Sheet open onClose={onClose} title={detail?.customer?.name || 'Customer'}>
      {!detail ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl bg-warn-light px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-warn">Current balance</p>
            <p className="font-display text-2xl font-semibold text-warn">
              {money(detail.customer.balance, { currency })}
            </p>
            {detail.customer.phone && (
              <a href={`tel:${detail.customer.phone}`} className="text-xs text-warn underline">
                {detail.customer.phone}
              </a>
            )}
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium">Record a repayment</span>
            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="decimal"
                placeholder={`Amount in ${currency}`}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <button
                type="button"
                onClick={speech.start}
                aria-label="Say the amount"
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white transition ${
                  speech.listening ? 'bg-clay' : 'bg-grove'
                }`}
              >
                <Mic size={18} />
              </button>
            </div>
            <Button
              className="mt-2 w-full"
              loading={busy}
              disabled={!Number(amount)}
              onClick={record}
            >
              <HandCoins size={16} />
              Record repayment
            </Button>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">History</p>
            {detail.history.length === 0 ? (
              <p className="text-sm text-dust">Nothing recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {detail.history.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between rounded-xl bg-card px-3 py-2 ring-1 ring-line/60"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge tone={row.type}>{row.type}</Badge>
                        <span className="text-[11px] text-dust">
                          {new Date(row.created_at).toLocaleDateString()} · {time(row.created_at)}
                        </span>
                      </div>
                      <p className="truncate text-sm">
                        {row.item_name
                          ? `${row.item_name} × ${formatQty(row.qty)}`
                          : 'Cash repayment'}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-semibold ${
                        row.type === 'repayment' ? 'text-grove' : 'text-ink'
                      }`}
                    >
                      {row.type === 'repayment' ? '−' : '+'}
                      {money(row.total, { currency })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function AddCustomerSheet({ open, onClose, onSaved }) {
  const { notify } = useToast();
  const [form, setForm] = useState({ name: '', phone: '' });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.createCustomer({ name: form.name.trim(), phone: form.phone.trim() || null });
      notify(`${form.name} added to your book.`, 'success');
      setForm({ name: '', phone: '' });
      onSaved();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add customer">
      <div className="space-y-4">
        <Field label="Name">
          <Input
            value={form.name}
            placeholder="Mama Jane"
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>
        <Field label="Phone" hint="Optional, for following up on debts">
          <Input
            type="tel"
            inputMode="numeric"
            value={form.phone}
            placeholder="0722000111"
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        </Field>
        <Button className="w-full" loading={busy} disabled={!form.name.trim()} onClick={save}>
          Save customer
        </Button>
      </div>
    </Sheet>
  );
}
