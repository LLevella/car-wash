import { LogIn } from "lucide-react";
import { useMemo } from "react";
import { useForm, type UseFormSetError } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { ApiError } from "../../api/client";
import { Button } from "../../components/Button";
import { InputField } from "../../components/Field";
import { Toolbar } from "../../components/Toolbar";
import { defaultPathFor, useCurrentUser, useLoginMutation } from "./useAuth";

type LoginForm = {
  username: string;
  password: string;
};

export function LoginPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const loginMutation = useLoginMutation();
  const { data: session, isLoading } = useCurrentUser();
  const schema = useMemo(
    () =>
      z.object({
        username: z.string().min(1, t("auth.errors.usernameRequired")),
        password: z.string().min(1, t("auth.errors.passwordRequired")),
      }),
    [t],
  );
  const {
    formState: { errors },
    handleSubmit,
    setError,
    register,
  } = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: "",
      password: "",
    },
  });
  const fromPath = readRedirectPath(location.state);

  async function onSubmit(values: LoginForm) {
    try {
      const nextSession = await loginMutation.mutateAsync(values);
      navigate(fromPath ?? defaultPathFor(nextSession), { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        applyFieldErrors(error, setError);
        return;
      }
      setError("root", { message: t("api.errors.requestFailed") });
    }
  }

  if (isLoading) {
    return (
      <section className="page page--narrow">
        <div className="panel state-panel">{t("common.loading")}</div>
      </section>
    );
  }

  if (session?.is_authenticated) {
    return <Navigate replace to={defaultPathFor(session)} />;
  }

  return (
    <section className="page page--narrow">
      <Toolbar title={t("auth.loginTitle")} />
      <form className="panel form-grid" onSubmit={handleSubmit(onSubmit)}>
        <InputField
          autoComplete="username"
          error={errors.username?.message ?? errors.root?.message}
          label={t("auth.username")}
          {...register("username")}
        />
        <InputField
          autoComplete="current-password"
          error={errors.password?.message}
          label={t("auth.password")}
          type="password"
          {...register("password")}
        />
        <div className="form-actions">
          <Button
            disabled={loginMutation.isPending}
            icon={<LogIn size={18} />}
            type="submit"
          >
            {t("common.actions.login")}
          </Button>
        </div>
        <p className="form-helper">
          {t("auth.registerCtaPrefix")}{" "}
          <Link to="/register">{t("auth.registerCtaLink")}</Link>
        </p>
      </form>
    </section>
  );
}

function applyFieldErrors(error: ApiError, setError: UseFormSetError<LoginForm>) {
  const fieldErrors = error.body?.field_errors;

  if (!fieldErrors) {
    setError("root", { message: error.message });
    return;
  }

  let handledField = false;
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (field === "username" || field === "password") {
      handledField = true;
      setError(field, { message: messages.join(" ") });
    }
  }

  if (!handledField) {
    setError("root", { message: error.message });
  }
}

function readRedirectPath(state: unknown) {
  if (
    typeof state === "object" &&
    state !== null &&
    "from" in state &&
    typeof state.from === "object" &&
    state.from !== null &&
    "pathname" in state.from &&
    typeof state.from.pathname === "string"
  ) {
    return state.from.pathname;
  }

  return null;
}
