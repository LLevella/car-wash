import type { ReactNode } from "react";
import {
  BarChart3,
  CalendarDays,
  Car,
  ClipboardList,
  Clock3,
  LayoutDashboard,
  LogIn,
  LogOut,
  ShieldAlert,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, useNavigate } from "react-router-dom";

import { Button } from "../components/Button";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import type { UserRole } from "../api/types";
import { useCurrentUser, useLogoutMutation } from "../features/auth/useAuth";

type NavItem = {
  icon: typeof Car;
  labelKey: string;
  roles: UserRole[];
  to: string;
};

const navItems: NavItem[] = [
  { to: "/book", labelKey: "nav.book", icon: Car, roles: ["customer"] },
  {
    to: "/my/bookings",
    labelKey: "nav.myBookings",
    icon: ClipboardList,
    roles: ["customer"],
  },
  {
    to: "/my/cars",
    labelKey: "nav.myCars",
    icon: Car,
    roles: ["customer"],
  },
  {
    to: "/manager/schedule",
    labelKey: "nav.schedule",
    icon: CalendarDays,
    roles: ["manager", "admin"],
  },
  {
    to: "/manager/bookings",
    labelKey: "nav.managerBookings",
    icon: LayoutDashboard,
    roles: ["manager", "admin"],
  },
  {
    to: "/manager/shifts",
    labelKey: "nav.shifts",
    icon: Clock3,
    roles: ["manager", "admin"],
  },
  {
    to: "/manager/resource-blocks",
    labelKey: "nav.resourceBlocks",
    icon: ShieldAlert,
    roles: ["manager", "admin"],
  },
  {
    to: "/manager/reports",
    labelKey: "nav.reports",
    icon: BarChart3,
    roles: ["manager", "admin"],
  },
];

function visibleFor(roles: UserRole[], allowedRoles: UserRole[]) {
  return allowedRoles.some((role) => roles.includes(role));
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: session } = useCurrentUser();
  const logoutMutation = useLogoutMutation();
  const roles = session?.roles ?? [];
  const visibleNavItems = navItems.filter((item) => visibleFor(roles, item.roles));

  async function handleLogout() {
    await logoutMutation.mutateAsync();
    navigate("/login", { replace: true });
  }

  const userName = session?.user?.username || t("common.user.fallback");
  const roleNames = roles
    .map((role) => t(`common.user.roles.${role}` as const))
    .join(", ");

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label={t("nav.appName")}>
        <NavLink className="sidebar__brand" to="/book">
          <span className="sidebar__mark">CW</span>
          <span>{t("nav.appName")}</span>
        </NavLink>
        <nav className="sidebar__nav">
          {visibleNavItems.map(({ icon: Icon, labelKey, to }) => (
            <NavLink className="sidebar__link" key={to} to={to}>
              <Icon size={18} />
              <span>{t(labelKey)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__language">
          <LanguageSwitcher />
        </div>
        {session?.is_authenticated ? (
          <div className="sidebar__session">
            <div>
              <strong>{userName}</strong>
              <span>{roleNames}</span>
            </div>
            <Button
              icon={<LogOut size={18} />}
              onClick={handleLogout}
              variant="secondary"
            >
              {t("common.actions.logout")}
            </Button>
          </div>
        ) : (
          <NavLink className="sidebar__login" to="/login">
            <LogIn size={18} />
            <span>{t("nav.login")}</span>
          </NavLink>
        )}
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}
