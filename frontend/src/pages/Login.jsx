import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic } from 'lucide-react';
import { Button, Field, Input, SegmentedControl } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'sw', label: 'Kiswahili' },
  { value: 'mixed', label: 'Mixed' },
];

export default function Login() {
  const { login, signup, enterAsGuest } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    phone: '',
    pin: '',
    business_name: '',
    owner_name: '',
    language: 'en',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isSignup = mode === 'signup';
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  function goIn(business, greeting) {
    if (greeting) notify(greeting, 'success');
    navigate(business.onboarded ? '/' : '/welcome', { replace: true });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);

    try {
      if (isSignup) {
        await signup(form);
        navigate('/welcome', { replace: true });
      } else {
        const business = await login({ phone: form.phone, pin: form.pin });
        goIn(business, `Karibu, ${business.owner_name}.`);
      }
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGuest(phone) {
    setError('');
    setBusy(true);
    try {
      const business = await enterAsGuest(phone);
      goIn(business, `Karibu, ${business.owner_name}.`);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col px-6 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-grove text-white shadow-mic">
            <Mic size={30} strokeWidth={1.75} />
          </span>
          <h1 className="font-display text-3xl font-semibold">SautiLedger</h1>
          <p className="mt-1 text-sm text-dust">Talk to your shop. It keeps the books.</p>
        </div>

        <div className="mb-6">
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { value: 'login', label: 'Log in' },
              { value: 'signup', label: 'Sign up' },
            ]}
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Phone number" htmlFor="phone">
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="0701891234"
              maxLength={10}
              pattern="0[0-9]{9}"
              value={form.phone}
              onChange={(event) =>
                setForm({ ...form, phone: event.target.value.replace(/\D/g, '').slice(0, 10) })
              }
              required={isSignup}
            />
          </Field>

          <Field label="PIN" hint={isSignup ? '4 to 6 digits' : 'Optional — leave blank to enter without a PIN'} htmlFor="pin">
            <Input
              id="pin"
              name="pin"
              type="password"
              inputMode="numeric"
              pattern={isSignup ? '\\d{4,6}' : undefined}
              maxLength={6}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              placeholder="••••"
              className="tracking-[0.5em]"
              value={form.pin}
              onChange={(event) =>
                setForm({ ...form, pin: event.target.value.replace(/\D/g, '').slice(0, 6) })
              }
              required={isSignup}
            />
          </Field>

          {isSignup && (
            <>
              <Field label="Business name" htmlFor="business_name">
                <Input
                  id="business_name"
                  placeholder="Baraka Duka"
                  value={form.business_name}
                  onChange={set('business_name')}
                  required
                />
              </Field>

              <Field label="Your name" htmlFor="owner_name">
                <Input
                  id="owner_name"
                  placeholder="Nadia"
                  value={form.owner_name}
                  onChange={set('owner_name')}
                  required
                />
              </Field>

              <div>
                <span className="mb-1.5 block text-sm font-medium">Voice language</span>
                <SegmentedControl
                  size="sm"
                  value={form.language}
                  onChange={(language) => setForm({ ...form, language })}
                  options={LANGUAGES}
                />
                <p className="mt-1 text-xs text-dust">
                  Sets the voice the app listens for and speaks back in.
                </p>
              </div>
            </>
          )}

          {error && (
            <p role="alert" className="rounded-2xl bg-danger-light px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" loading={busy} className="w-full">
            Continue
          </Button>
        </form>

        {!isSignup && (
          <>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="mt-3 w-full"
              disabled={busy}
              onClick={() => handleGuest('0701891234')}
            >
              Continue without an account
            </Button>
            <p className="mt-6 text-center text-xs text-dust">
              Open shop: 0701891234 (no PIN). Demo shop: 0712345678 · PIN 1234
            </p>
          </>
        )}
      </div>
    </div>
  );
}
