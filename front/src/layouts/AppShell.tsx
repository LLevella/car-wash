import type { ReactNode } from "react";
import {
  CalendarDays,
  Car,
  ClipboardList,
  Clock3,
  LayoutDashboard,
  LogIn,
  LogOut,
  ShieldAlert,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";

import { Button } from "../components/Button";
import type { UserRole } from "../api/types";
import { useCurrentUser, useLogoutMutation } from "../features/auth/useAuth";

const navItems = [
  { to: "/book", label: "Запись", icon: Car, roles: ["customer"] },
  {
    to: "/my/bookings",
    label: "Мои записи",
    icon: ClipboardList,
    roles: ["customer"],
  },
  {
    to: "/manager/schedule",
    label: "Расписание",
    icon: CalendarDays,
    roles: ["manager", "admin"],
  },
  {
    to: "/manager/bookings",
    label: "Заказы",
    icon: LayoutDashboard,
    roles: ["manager", "admin"],
  },
  {
    to: "/manager/shifts",
    label: "Смены",
    icon: Clock3,
    roles: ["manager", "admin"],
  },
  {
    to: "/manager/resource-blocks",
    label: "Блокировки",
    icon: ShieldAlert,
    roles: ["manager", "admin"],
  },
] satisfies Array<{
  icon: typeof Car;
  label: string;
  roles: UserRole[];
  to: string;
}>;

const roleLabels: Record<UserRole, string> = {
  admin: "Админ",
  customer: "Клиент",
  manager: "Менеджер",
};

function visibleFor(roles: UserRole[], allowedRoles: UserRole[]) {
  return allowedRoles.some((role) => roles.includes(role));
}

function userDisplayName(username?: string) {
  return username || "Пользователь";
}

function roleDisplayName(roles: UserRole[]) {
  return roles.map((role) => roleLabels[role]).join(", ");
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { data: session } = useCurrentUser();
  const logoutMutation = useLogoutMutation();
  const roles = session?.roles ?? [];
  const visibleNavItems = navItems.filter((item) => visibleFor(roles, item.roles));

  async function handleLogout() {
    await logoutMutation.mutateAsync();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Основная навигация">
        <NavLink className="sidebar__brand" to="/book">
          <span className="sidebar__mark">CW</span>
          <span>Car Wash</span>
        </NavLink>
        <nav className="sidebar__nav">
          {visibleNavItems.map(({ icon: Icon, label, to }) => (
            <NavLink className="sidebar__link" key={to} to={to}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        {session?.is_authenticated ? (
          <div className="sidebar__session">
            <div>
              <strong>{userDisplayName(session.user?.username)}</strong>
              <span>{roleDisplayName(roles)}</span>
            </div>
            <Button
              icon={<LogOut size={18} />}
              onClick={handleLogout}
              variant="secondary"
            >
              Выйти
            </Button>
          </div>
        ) : (
          <NavLink className="sidebar__login" to="/login">
            <LogIn size={18} />
            <span>Вход</span>
          </NavLink>
        )}
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}
