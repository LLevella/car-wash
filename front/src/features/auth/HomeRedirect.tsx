import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { defaultPathFor, useCurrentUser } from "./useAuth";

export function HomeRedirect() {
  const { t } = useTranslation();
  const { data: session, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <section className="page page--narrow">
        <div className="panel state-panel">{t("common.loading")}</div>
      </section>
    );
  }

  if (!session?.is_authenticated) {
    return <Navigate replace to="/login" />;
  }

  return <Navigate replace to={defaultPathFor(session)} />;
}
