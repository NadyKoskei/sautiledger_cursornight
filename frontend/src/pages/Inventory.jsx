import { useCallback, useEffect, useState } from 'react';
import { Boxes, Package, Plus, Search, Trash2 } from 'lucide-react';
import { MicButton } from '../components/MicButton.jsx';
import { Screen, ScreenHeader } from '../components/Screen.jsx';
import { Button, Card, EmptyState, Field, Input, SegmentedControl, Sheet, Skeleton } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useVoiceLedger } from '../hooks/useVoiceLedger';
import { api } from '../lib/api';
import { money, qty as formatQty } from '../lib/format';

const BLANK = {
  name: '',
  unit: 'piece',
  qty_on_hand: '',
  cost_price: '',
  price: '',
  low_stock_threshold: '5',
};

const UNITS = ['piece', 'packet', 'kg', 'litre', 'bar', 'loaf', 'crate', 'bunch'];

export default function Inventory() {
  const { business } = useAuth();
  const { notify } = useToast();
  const currency = business?.currency || 'KES';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      const { items: list } = await api.listItems({
        search,
        low: filter === 'low' ? 'true' : '',
      });
      setItems(list);
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, notify, search]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  // On this screen the mic is scoped to adding stock, not selling it.
  const voice = useVoiceLedger({
    scope: 'restock',
    onRecorded: (result) => {
      notify(result.message, 'success');
      load();
    },
  });

  const lowCount = items.filter((item) => item.low_stock).length;

  return (
    <>
      <ScreenHeader
        title="Inventory"
        subtitle={`${items.length} items${lowCount ? ` · ${lowCount} low` : ''}`}
        action={
          <Button size="sm" onClick={() => setEditing({ ...BLANK })}>
            <Plus size={16} />
            Add
          </Button>
        }
      />

      <Screen>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dust" />
            <Input
              className="pl-10"
              placeholder="Search items"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <MicButton
            size="sm"
            listening={voice.listening}
            busy={voice.busy}
            onClick={voice.start}
            label="Add stock by voice"
          />
        </div>

        <p className="mt-2 text-xs text-dust">
          Mic here adds stock. Say <span className="text-ink">“add 20 sugar”</span>.
        </p>

        {(voice.interim || voice.error) && (
          <p
            className={`mt-2 rounded-2xl px-4 py-2.5 text-sm ${
              voice.error ? 'bg-danger-light text-danger' : 'bg-grove-light text-grove-dark'
            }`}
          >
            {voice.error || voice.interim}
          </p>
        )}

        <div className="mt-3">
          <SegmentedControl
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All items' },
              { value: 'low', label: 'Low stock' },
            ]}
          />
        </div>

        <div className="mt-4 space-y-2">
          {loading ? (
            <>
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title={search ? 'Nothing matches that' : 'Your shelf is empty'}
              description={
                search
                  ? 'Try a different word.'
                  : 'Add what you sell so the app can price it for you.'
              }
              action={
                !search && (
                  <Button onClick={() => setEditing({ ...BLANK })}>
                    <Plus size={16} />
                    Add first item
                  </Button>
                )
              }
            />
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setEditing({ ...item })}
                className="block w-full text-left"
              >
                <Card className="flex items-center justify-between gap-3 transition active:scale-[0.99]">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.name}</p>
                    <p className="text-xs text-dust">
                      {money(item.price, { currency })} per {item.unit}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`font-display text-lg font-semibold ${
                        item.low_stock ? 'text-danger' : 'text-ink'
                      }`}
                    >
                      {formatQty(item.qty_on_hand)}
                    </p>
                    <p
                      className={`text-[11px] font-semibold uppercase tracking-wide ${
                        item.low_stock ? 'text-danger' : 'text-dust'
                      }`}
                    >
                      {item.low_stock ? 'Low' : 'in stock'}
                    </p>
                  </div>
                </Card>
              </button>
            ))
          )}
        </div>
      </Screen>

      <ItemSheet
        item={editing}
        currency={currency}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </>
  );
}

function ItemSheet({ item, currency, onClose, onSaved }) {
  const { notify } = useToast();
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (item) setForm({ ...BLANK, ...item });
  }, [item]);

  if (!item) return null;

  const isNew = !item.id;
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const margin = Number(form.price) - Number(form.cost_price || 0);

  async function save() {
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        unit: form.unit,
        qty_on_hand: Number(form.qty_on_hand) || 0,
        cost_price: Number(form.cost_price) || 0,
        price: Number(form.price),
        low_stock_threshold: Number(form.low_stock_threshold) || 5,
      };

      if (isNew) await api.createItem(payload);
      else await api.updateItem(item.id, payload);

      notify(`${payload.name} saved.`, 'success');
      onSaved();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deleteItem(item.id);
      notify(`${item.name} removed.`, 'success');
      onSaved();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={isNew ? 'Add item' : form.name}>
      <div className="space-y-4">
        <Field label="Item name">
          <Input value={form.name} onChange={set('name')} placeholder="Unga" autoFocus={isNew} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Unit">
            <select
              className="h-12 w-full rounded-2xl border border-line bg-white px-4 text-[15px] focus:border-grove focus:outline-none"
              value={form.unit}
              onChange={set('unit')}
            >
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity on hand">
            <Input type="number" inputMode="decimal" value={form.qty_on_hand} onChange={set('qty_on_hand')} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Cost price (${currency})`} hint="What you pay">
            <Input type="number" inputMode="decimal" value={form.cost_price} onChange={set('cost_price')} />
          </Field>
          <Field label={`Sell price (${currency})`} hint="What they pay">
            <Input type="number" inputMode="decimal" value={form.price} onChange={set('price')} />
          </Field>
        </div>

        <Field label="Low stock alert at" hint="You will be warned at or below this level">
          <Input
            type="number"
            inputMode="decimal"
            value={form.low_stock_threshold}
            onChange={set('low_stock_threshold')}
          />
        </Field>

        {Number(form.price) > 0 && (
          <div className="flex items-center justify-between rounded-2xl bg-grove-light px-4 py-3 text-sm">
            <span className="flex items-center gap-2 text-grove-dark">
              <Package size={15} />
              Profit per {form.unit}
            </span>
            <span className="font-semibold text-grove-dark">{money(margin, { currency })}</span>
          </div>
        )}

        <div className="flex gap-2">
          {!isNew && (
            <Button variant="secondary" className="flex-1 text-danger" disabled={busy} onClick={remove}>
              <Trash2 size={16} />
              Remove
            </Button>
          )}
          <Button size="md" className="flex-1" loading={busy} onClick={save}>
            Save item
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
