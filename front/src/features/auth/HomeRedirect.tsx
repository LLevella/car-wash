import { Navigate } from "react-router-dom";

import { defaultPathFor, useCurrentUser } from "./useAuth";

export function HomeRedirect() {
  const { data: session, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <section className="page page--narrow">
        <div className="panel state-panel">Загрузка...</div>
      </section>
    );
  }

  if (!session?.is_authenticated) {
    return <Navigate replace to="/login" />;
  }

  return <Navigate replace to={defaultPathFor(session)} />;
}
