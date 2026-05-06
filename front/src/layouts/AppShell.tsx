import type { ReactNode } from "react";
import { CalendarDays, Car, ClipboardList, LayoutDashboard, LogIn } from "lucide-react";
import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/book", label: "Запись", icon: Car },
  { to: "/my/bookings", label: "Мои записи", icon: ClipboardList },
  { to: "/manager/schedule", label: "Расписание", icon: CalendarDays },
  { to: "/manager/bookings", label: "Заказы", icon: LayoutDashboard },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Основная навигация">
        <NavLink className="sidebar__brand" to="/book">
          <span className="sidebar__mark">CW</span>
          <span>Car Wash</span>
        </NavLink>
        <nav className="sidebar__nav">
          {navItems.map(({ icon: Icon, label, to }) => (
            <NavLink className="sidebar__link" key={to} to={to}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <NavLink className="sidebar__login" to="/login">
          <LogIn size={18} />
          <span>Вход</span>
        </NavLink>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}
