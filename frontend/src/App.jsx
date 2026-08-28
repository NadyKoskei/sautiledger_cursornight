import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BottomNav } from './components/BottomNav.jsx';
import { useAuth } from './context/AuthContext.jsx';
import Assistant from './pages/Assistant.jsx';
import Customers from './pages/Customers.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inventory from './pages/Inventory.jsx';
import Login from './pages/Login.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Reports from './pages/Reports.jsx';
import Sales from './pages/Sales.jsx';

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper">
      <div className="flex flex-col items-center gap-3">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-grove/20 border-t-grove" />
        <p className="text-sm text-dust">Opening your ledger…</p>
      </div>
    </div>
  );
}

function Protected({ children }) {
  const { business, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Splash />;
  if (!business) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!business.onboarded) return <Navigate to="/welcome" replace />;

  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}

export default function App() {
  const { business, loading } = useAuth();

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <Routes>
        <Route
          path="/login"
          element={loading ? <Splash /> : business ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/welcome"
          element={
            loading ? <Splash /> : !business ? <Navigate to="/login" replace /> : <Onboarding />
          }
        />
        <Route
          path="/"
          element={
            <Protected>
              <Dashboard />
            </Protected>
          }
        />
        <Route
          path="/inventory"
          element={
            <Protected>
              <Inventory />
            </Protected>
          }
        />
        <Route
          path="/sales"
          element={
            <Protected>
              <Sales />
            </Protected>
          }
        />
        <Route
          path="/customers"
          element={
            <Protected>
              <Customers />
            </Protected>
          }
        />
        <Route
          path="/reports"
          element={
            <Protected>
              <Reports />
            </Protected>
          }
        />
        <Route
          path="/assistant"
          element={
            <Protected>
              <Assistant />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
