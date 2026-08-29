import { Component, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import './index.css';

if ('serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
    if (typeof caches !== 'undefined') {
      caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
    }
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('Service worker registration failed', error);
      });
    });
  }
}

class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { message: '' };
  }

  static getDerivedStateFromError(error) {
    return { message: error?.message || 'Something went wrong.' };
  }

  render() {
    if (this.state.message) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-paper px-6 text-center text-ink">
          <p className="font-display text-2xl font-semibold">SautiLedger could not open</p>
          <p className="mt-2 max-w-sm text-base text-dust">{this.state.message}</p>
          <button
            type="button"
            className="mt-6 rounded-2xl bg-grove px-5 py-3 font-semibold text-white"
            onClick={() => window.location.replace('/')}
          >
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </RootErrorBoundary>
  </StrictMode>
);
