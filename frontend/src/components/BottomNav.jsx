import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Boxes, LineChart, Mic, Users, Home } from 'lucide-react';

// The assistant is not a tab: it floats above this bar on every screen.
const TABS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/inventory', label: 'Stock', icon: Boxes },
  { to: '/customers', label: 'Madeni', icon: Users },
  { to: '/reports', label: 'Reports', icon: LineChart },
];

export function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onSales = pathname === '/sales';

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 shadow-nav backdrop-blur"
    >
      <div className="relative mx-auto grid max-w-md grid-cols-5 gap-1 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        {TABS.slice(0, 2).map((tab) => (
          <NavTab key={tab.to} {...tab} />
        ))}

        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => navigate('/sales')}
            aria-label="Record a sale by voice"
            aria-current={onSales ? 'page' : undefined}
            className={`-mt-7 flex h-16 w-16 items-center justify-center rounded-full text-white
              shadow-mic ring-4 ring-paper transition active:scale-95
              ${onSales ? 'bg-clay' : 'bg-grove'}`}
          >
            <Mic size={26} />
          </button>
        </div>

        {TABS.slice(2).map((tab) => (
          <NavTab key={tab.to} {...tab} />
        ))}
      </div>
    </nav>
  );
}

function NavTab({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-col items-center gap-0.5 rounded-xl py-1 text-[10px] font-semibold transition ${
          isActive ? 'text-grove' : 'text-dust'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={20} strokeWidth={isActive ? 2.4 : 1.8} />
          {label}
        </>
      )}
    </NavLink>
  );
}
