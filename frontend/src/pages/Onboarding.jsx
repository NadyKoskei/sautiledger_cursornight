import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Sparkles, Store } from 'lucide-react';
import { Button, Card, Field, Input, SegmentedControl } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api';

const TYPES = [
  { value: 'duka', label: 'Duka', hint: 'General shop' },
  { value: 'mama_mboga', label: 'Mama Mboga', hint: 'Fresh produce' },
  { value: 'kiosk', label: 'Kiosk', hint: 'Small stall' },
  { value: 'other', label: 'Other', hint: 'Something else' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'sw', label: 'Kiswahili' },
  { value: 'mixed', label: 'Mixed' },
];

const BLANK_ITEM = { name: '', qty_on_hand: '', price: '' };

export default function Onboarding() {
  const { business, updateBusiness } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [type, setType] = useState(business?.business_type || 'duka');
  const [currency, setCurrency] = useState(business?.currency || 'KES');
  const [language, setLanguage] = useState(business?.language || 'en');
  const [rows, setRows] = useState([{ ...BLANK_ITEM }, { ...BLANK_ITEM }, { ...BLANK_ITEM }]);
  const [busy, setBusy] = useState(false);

  async function finish(withItems) {
    setBusy(true);
    try {
      if (withItems) {
        const ready = rows.filter((row) => row.name.trim() && Number(row.price) > 0);
        for (const row of ready) {
          await api.createItem({
            name: row.name.trim(),
            qty_on_hand: Number(row.qty_on_hand) || 0,
            price: Number(row.price),
          });
        }
        if (ready.length > 0) notify(`${ready.length} items added to your shelf.`, 'success');
      }

      await updateBusiness({
        business_type: type,
        currency,
        language,
        onboarded: true,
      });
      navigate('/', { replace: true });
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="mb-6 flex items-center gap-2">
        {[1, 2].map((index) => (
          <span
            key={index}
            className={`h-1.5 flex-1 rounded-full ${index <= step ? 'bg-grove' : 'bg-line'}`}
          />
        ))}
      </div>

      {step === 1 ? (
        <div className="animate-fade-up">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-grove-light text-grove">
            <Store size={22} />
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold">
            Karibu, {business?.owner_name?.split(' ')[0] || 'boss'}.
          </h1>
          <p className="mt-1 text-sm text-dust">
            Just talk — no typing needed. Set this up once and you can run the shop by voice.
          </p>

          <div className="mt-6 space-y-5">
            <div>
              <span className="mb-2 block text-sm font-medium">What kind of business?</span>
              <div className="grid grid-cols-2 gap-2">
                {TYPES.map((option) => {
                  const active = option.value === type;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setType(option.value)}
                      className={`rounded-2xl border p-3 text-left transition ${
                        active
                          ? 'border-grove bg-grove-light'
                          : 'border-line bg-white hover:border-dust/40'
                      }`}
                    >
                      <span className="flex items-center justify-between text-sm font-semibold">
                        {option.label}
                        {active && <Check size={16} className="text-grove" />}
                      </span>
                      <span className="text-xs text-dust">{option.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Field label="Currency" hint="Used for every total the app speaks and shows">
              <Input value={currency} onChange={(event) => setCurrency(event.target.value)} />
            </Field>

            <div>
              <span className="mb-2 block text-sm font-medium">Voice language</span>
              <SegmentedControl size="sm" value={language} onChange={setLanguage} options={LANGUAGES} />
            </div>
          </div>

          <Button size="lg" className="mt-8 w-full" onClick={() => setStep(2)}>
            Continue
          </Button>
        </div>
      ) : (
        <div className="animate-fade-up">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-clay-light text-clay">
            <Sparkles size={22} />
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold">Add your first items</h1>
          <p className="mt-1 text-sm text-dust">
            The app needs prices to do the math for you. Add three now, or skip and add them later.
          </p>

          <div className="mt-5 space-y-3">
            {rows.map((row, index) => (
              <Card key={index} className="space-y-2">
                <Input
                  placeholder={['Unga', 'Sugar', 'Milk'][index] || 'Item name'}
                  value={row.name}
                  onChange={(event) => {
                    const next = [...rows];
                    next[index] = { ...row, name: event.target.value };
                    setRows(next);
                  }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="Qty"
                    value={row.qty_on_hand}
                    onChange={(event) => {
                      const next = [...rows];
                      next[index] = { ...row, qty_on_hand: event.target.value };
                      setRows(next);
                    }}
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder={`Price (${currency})`}
                    value={row.price}
                    onChange={(event) => {
                      const next = [...rows];
                      next[index] = { ...row, price: event.target.value };
                      setRows(next);
                    }}
                  />
                </div>
              </Card>
            ))}
          </div>

          <div className="mt-6 space-y-2">
            <Button size="lg" className="w-full" loading={busy} onClick={() => finish(true)}>
              Save and start
            </Button>
            <Button variant="ghost" className="w-full" disabled={busy} onClick={() => finish(false)}>
              Skip for now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
