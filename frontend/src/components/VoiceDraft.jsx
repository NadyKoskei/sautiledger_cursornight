import { useEffect, useState } from 'react';
import { RotateCcw, Square } from 'lucide-react';
import { api } from '../lib/api';
import { Button, Card, Field, Input, SegmentedControl } from './ui.jsx';

function itemLine(item) {
  const unit = item.unit ? ` ${item.unit}` : '';
  return `${item.qty}${unit} ${item.name}`;
}

export function VoiceDraft({
  voice,
  confirmLabel = 'Record this',
  showCredit = true,
}) {
  const [customers, setCustomers] = useState([]);
  const credit = showCredit && voice.asCredit;
  const items = voice.preview?.items || [];
  const who = voice.creditName.trim() || voice.preview?.customer_name || '';
  const canConfirm =
    Boolean(voice.spokenLine) &&
    !voice.busy &&
    !voice.listening &&
    (!credit || (who && items.length > 0));

  useEffect(() => {
    if (!showCredit) return undefined;
    let active = true;
    api
      .listCustomers()
      .then(({ customers: list }) => {
        if (active) setCustomers(list || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [showCredit]);

  return (
    <Card className="mt-3 w-full animate-fade-up">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-dust">
        {voice.listening ? 'Hearing' : 'What I heard'}
      </p>

      <textarea
        rows={3}
        value={voice.listening ? voice.interim || '' : voice.draft}
        onChange={(event) => voice.setDraft(event.target.value)}
        readOnly={voice.listening}
        placeholder="Tap the mic, then fix any words here before you record."
        className="mt-2 w-full resize-none rounded-2xl border border-line bg-paper px-3 py-2.5 text-[15px] leading-snug text-ink outline-none focus:border-grove focus:ring-2 focus:ring-grove/20"
      />

      {showCredit && (
        <div className="mt-3">
          <span className="mb-1.5 block text-sm font-medium">How they are paying</span>
          <SegmentedControl
            size="sm"
            value={voice.asCredit ? 'credit' : 'cash'}
            onChange={(value) => voice.setAsCredit(value === 'credit')}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'credit', label: 'Credit / madeni' },
            ]}
          />
        </div>
      )}

      {credit && (
        <div className="mt-3 rounded-2xl bg-warn-light px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-warn">
            Items taken on credit
          </p>
          {items.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {items.map((item) => (
                <li key={`${item.name}-${item.qty}`} className="text-[15px] font-medium text-ink">
                  {itemLine(item)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-warn">Say the items they took, for example “2 kg sugar and 1 milk”.</p>
          )}

          <Field
            label="Who took them"
            hint="This name is added to madeni. A new name is created if they are not in your book yet."
            htmlFor="credit-extra"
          >
            <Input
              id="credit-extra"
              list="credit-customer-names"
              placeholder="Moha"
              value={voice.creditName}
              onChange={(event) => voice.setCreditName(event.target.value)}
              disabled={voice.listening || voice.busy}
              className="mt-1"
            />
            <datalist id="credit-customer-names">
              {customers.map((customer) => (
                <option key={customer.id} value={customer.name} />
              ))}
            </datalist>
          </Field>
        </div>
      )}

      {credit && who && items.length > 0 && (
        <p className="mt-2 text-sm text-grove-dark">
          {who} takes {items.map(itemLine).join(', ')} on credit.
        </p>
      )}

      {!credit && voice.preview && voice.preview.action !== 'ask' && items.length > 0 && (
        <p className="mt-2 text-sm text-grove-dark">
          Cash: {items.map(itemLine).join(', ')}.
        </p>
      )}

      {voice.preview?.action === 'ask' && (
        <p className="mt-2 text-sm text-grove-dark">This will ask the books — it will not record a sale.</p>
      )}

      {voice.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {voice.error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" loading={voice.busy} disabled={!canConfirm} onClick={voice.submit}>
          {credit ? 'Record on credit' : confirmLabel}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!voice.listening && !voice.speaking && !voice.busy}
          onClick={voice.stop}
        >
          <Square size={14} />
          Stop
        </Button>
        <Button size="sm" variant="ghost" onClick={voice.reset}>
          <RotateCcw size={14} />
          Reset
        </Button>
      </div>
    </Card>
  );
}
