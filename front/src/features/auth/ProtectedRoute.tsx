import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import type { UserRole } from "../../api/types";
import { defaultPathFor, hasAnyRole, useCurrentUser } from "./useAuth";

type ProtectedRouteProps = {
  children: ReactNode;
  roles: UserRole[];
};

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const location = useLocation();
  const { data: session, isLoading } = useCurrentUser();

  if (isLoading) {
    return <LoadingPanel />;
  }

  if (!session?.is_authenticated) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  if (!hasAnyRole(session, roles)) {
    return <Navigate replace to={defaultPathFor(session)} />;
  }

  return children;
}

function LoadingPanel() {
  const { t } = useTranslation();

  return (
    <section className="page page--narrow">
      <div className="panel state-panel">{t("common.loading")}</div>
    </section>
  );
}
