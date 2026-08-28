import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Keyboard, Undo2 } from 'lucide-react';
import { MicButton } from '../components/MicButton.jsx';
import { Screen, ScreenHeader } from '../components/Screen.jsx';
import { Badge, Button, Card, EmptyState, Field, Input, SegmentedControl, Select, Sheet } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useVoiceLedger } from '../hooks/useVoiceLedger';
import { api } from '../lib/api';
import { money, qty as formatQty, summarise, time } from '../lib/format';

const PROMPTS = {
  idle: 'Tap the mic and speak the sale.',
  listening: 'Listening… say it the way you would to a customer.',
  working: 'Checking your prices and writing it down…',
};

export default function Sales() {
  const { business } = useAuth();
  const { notify } = useToast();
  const currency = business?.currency || 'KES';

  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);

  const loadFeed = useCallback(async () => {
    try {
      const { transactions } = await api.listTransactions('today');
      setFeed(transactions);
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const voice = useVoiceLedger({ onRecorded: loadFeed });

  async function undo(batchId) {
    try {
      const { message } = await api.undoTransaction(batchId);
      notify(message, 'success');
      voice.reset();
      loadFeed();
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  const status = voice.busy ? 'working' : voice.listening ? 'listening' : 'idle';
  const heard = voice.interim || voice.transcript;

  return (
    <>
      <ScreenHeader title="Voice ledger" subtitle="Every sale, spoken once" />

      <Screen>
        <section className="flex flex-col items-center pb-2 pt-4">
          <MicButton
            listening={voice.listening}
            busy={voice.busy}
            onClick={voice.start}
            label="Record a sale by voice"
          />
          <p className="mt-4 min-h-[2.5rem] max-w-[17rem] text-center text-sm leading-relaxed text-dust">
            {PROMPTS[status]}
          </p>

          {heard && (
            <Card className="mt-1 w-full animate-fade-up">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-dust">
                {voice.listening ? 'Hearing' : 'Heard'}
              </p>
              <p className="mt-1 text-[15px] leading-snug">{heard}</p>
            </Card>
          )}

          {voice.error && (
            <p
              role="alert"
              className="mt-3 w-full rounded-2xl bg-danger-light px-4 py-3 text-sm text-danger"
            >
              {voice.error}
            </p>
          )}

          {voice.receipt && !voice.error && (
            <ConfirmationCard
              receipt={voice.receipt}
              currency={currency}
              onUndo={() => undo(voice.receipt.batch_id)}
            />
          )}

          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => setManualOpen(true)}
          >
            <Keyboard size={16} />
            Type it instead
          </Button>
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold">Today</h2>
            <span className="text-xs text-dust">{feed.length} entries</span>
          </div>

          {loading ? (
            <p className="text-sm text-dust">Loading…</p>
          ) : feed.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No sales yet today"
              description="Record your first one with the mic above."
            />
          ) : (
            <ul className="space-y-2">
              {feed.map((entry, index) => (
                <li key={entry.batch_id}>
                  <Card className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-2">
                        <Badge tone={entry.type}>{entry.type}</Badge>
                        <span className="text-[11px] text-dust">{time(entry.created_at)}</span>
                        {entry.source === 'manual' && (
                          <span className="text-[11px] text-dust">· typed</span>
                        )}
                      </div>
                      <p className="truncate text-[15px] font-medium">{summarise(entry)}</p>
                      <p className="truncate text-xs text-dust">
                        {entry.customer_name || (entry.payment_type === 'credit' ? 'Credit' : 'Cash')}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-display text-base font-semibold">
                        {money(entry.total, { currency })}
                      </span>
                      {index === 0 && (
                        <button
                          type="button"
                          onClick={() => undo(entry.batch_id)}
                          aria-label="Undo this entry"
                          className="flex h-8 w-8 items-center justify-center rounded-full text-dust transition hover:bg-line/60 hover:text-ink"
                        >
                          <Undo2 size={16} />
                        </button>
                      )}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Screen>

      <ManualEntrySheet
        open={manualOpen}
        currency={currency}
        onClose={() => setManualOpen(false)}
        onSaved={() => {
          setManualOpen(false);
          loadFeed();
        }}
      />
    </>
  );
}

function ConfirmationCard({ receipt, currency, onUndo }) {
  return (
    <Card className="mt-3 w-full animate-fade-up ring-grove/30">
      <div className="flex items-start gap-2">
        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-grove" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium leading-snug text-grove-dark">{receipt.message}</p>

          {receipt.lines?.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-line pt-3">
              {receipt.lines.map((line) => (
                <li key={line.item_id} className="flex justify-between text-sm">
                  <span className="text-dust">
                    {line.name} × {formatQty(line.qty)} @ {money(line.unit_price, { currency })}
                  </span>
                  <span className="font-medium">{money(line.total, { currency })}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <div className="flex items-center gap-2">
              <Badge tone={receipt.action}>{receipt.action}</Badge>
              {receipt.customer && (
                <span className="text-xs text-dust">{receipt.customer.name}</span>
              )}
            </div>
            <button
              type="button"
              onClick={onUndo}
              className="flex items-center gap-1 text-xs font-semibold text-clay"
            >
              <Undo2 size={14} />
              Undo
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ManualEntrySheet({ open, currency, onClose, onSaved }) {
  const { notify } = useToast();
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({ item: '', qty: '1', payment: 'cash', customer: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.listItems().then(({ items: list }) => setItems(list)).catch(() => setItems([]));
    api
      .listCustomers()
      .then(({ customers: list }) => setCustomers(list))
      .catch(() => setCustomers([]));
  }, [open]);

  const selected = items.find((item) => String(item.id) === form.item);
  const preview = selected ? Number(selected.price) * (Number(form.qty) || 0) : 0;

  async function save() {
    if (!selected) return notify('Choose an item first.', 'error');
    setBusy(true);
    try {
      const { message } = await api.recordTransaction({
        action: form.payment === 'credit' ? 'credit' : 'sale',
        items: [{ name: selected.name, qty: Number(form.qty) }],
        payment_type: form.payment,
        customer_name: form.payment === 'credit' ? form.customer : null,
        source: 'manual',
      });
      notify(message, 'success');
      setForm({ item: '', qty: '1', payment: 'cash', customer: '' });
      onSaved();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Type the sale">
      <div className="space-y-4">
        <Field label="Item">
          <Select value={form.item} onChange={(event) => setForm({ ...form, item: event.target.value })}>
            <option value="">Choose an item</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {money(item.price, { currency })} ({formatQty(item.qty_on_hand)} left)
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Quantity">
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            value={form.qty}
            onChange={(event) => setForm({ ...form, qty: event.target.value })}
          />
        </Field>

        <div>
          <span className="mb-1.5 block text-sm font-medium">Payment</span>
          <SegmentedControl
            value={form.payment}
            onChange={(payment) => setForm({ ...form, payment })}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'credit', label: 'Credit' },
            ]}
          />
        </div>

        {form.payment === 'credit' && (
          <Field label="Customer" hint="A new name is added to your book automatically">
            <Input
              list="customer-names"
              placeholder="Mama Jane"
              value={form.customer}
              onChange={(event) => setForm({ ...form, customer: event.target.value })}
            />
            <datalist id="customer-names">
              {customers.map((customer) => (
                <option key={customer.id} value={customer.name} />
              ))}
            </datalist>
          </Field>
        )}

        <div className="flex items-center justify-between rounded-2xl bg-grove-light px-4 py-3">
          <span className="text-sm text-grove-dark">Total from your price list</span>
          <span className="font-display text-lg font-semibold text-grove-dark">
            {money(preview, { currency })}
          </span>
        </div>

        <Button size="lg" className="w-full" loading={busy} onClick={save}>
          Record sale
        </Button>
      </div>
    </Sheet>
  );
}
