import { NavLink } from 'react-router';

// Switches between the two home pages, My bills and Expenses.
// Links, not tabs: each is its own page with its own URL (aria-current marks the one open).
export function HomeTabs() {
  return (
    <nav aria-label="Home" className="glass flex rounded-full p-1">
      {[
        ['/bills', 'Bills'],
        ['/expenses', 'Expenses'],
      ].map(([to, label]) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            `flex h-11 flex-1 items-center justify-center rounded-full text-sm font-medium transition ${isActive ? 'bg-raised' : 'text-muted'}`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
