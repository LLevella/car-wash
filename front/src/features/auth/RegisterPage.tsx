import { UserPlus } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useForm, type UseFormSetError } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { ApiError } from "../../api/client";
import { Button } from "../../components/Button";
import { InputField } from "../../components/Field";
import { Toolbar } from "../../components/Toolbar";
import { defaultPathFor, useCurrentUser, useRegisterMutation } from "./useAuth";

type RegisterForm = {
  username: string;
  password: string;
  password_confirm: string;
  name: string;
  phone_number: string;
};

const REGISTER_FIELDS = [
  "username",
  "password",
  "password_confirm",
  "name",
  "phone_number",
] as const;

export function RegisterPage() {
  const { i18n, t } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const navigate = useNavigate();
  const registerMutation = useRegisterMutation();
  const { data: session, isLoading } = useCurrentUser();
  const schema = useMemo(
    () =>
      z
        .object({
          username: z.string().min(3, t("auth.errors.usernameMin")),
          password: z.string().min(8, t("auth.errors.passwordMin")),
          password_confirm: z.string().min(1, t("auth.errors.confirmRequired")),
          name: z.string().min(1, t("auth.errors.nameRequired")),
          phone_number: z.string().min(1, t("auth.errors.phoneRequired")),
        })
        .refine((values) => values.password === values.password_confirm, {
          message: t("auth.errors.confirmMismatch"),
          path: ["password_confirm"],
        }),
    [t],
  );
  const {
    formState: { errors, isSubmitted },
    handleSubmit,
    setError,
    register,
    trigger,
  } = useForm<RegisterForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: "",
      password: "",
      password_confirm: "",
      name: "",
      phone_number: "",
    },
  });

  useEffect(() => {
    if (isSubmitted) {
      void trigger();
    }
  }, [isSubmitted, language, trigger]);

  async function onSubmit(values: RegisterForm) {
    try {
      const nextSession = await registerMutation.mutateAsync(values);
      navigate(defaultPathFor(nextSession), { replace: true });
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
      <Toolbar title={t("auth.registerTitle")} />
      <form className="panel form-grid" onSubmit={handleSubmit(onSubmit)}>
        <InputField
          autoComplete="username"
          error={errors.username?.message}
          label={t("auth.username")}
          {...register("username")}
        />
        <InputField
          error={errors.name?.message}
          label={t("common.fields.name")}
          {...register("name")}
        />
        <InputField
          autoComplete="tel"
          error={errors.phone_number?.message}
          label={t("common.fields.phone")}
          type="tel"
          {...register("phone_number")}
        />
        <InputField
          autoComplete="new-password"
          error={errors.password?.message}
          label={t("auth.password")}
          type="password"
          {...register("password")}
        />
        <InputField
          autoComplete="new-password"
          error={errors.password_confirm?.message}
          label={t("auth.passwordConfirm")}
          type="password"
          {...register("password_confirm")}
        />
        {errors.root?.message ? (
          <div className="field__error">{errors.root.message}</div>
        ) : null}
        <div className="form-actions">
          <Button
            disabled={registerMutation.isPending}
            icon={<UserPlus size={18} />}
            type="submit"
          >
            {t("auth.register")}
          </Button>
        </div>
        <p className="form-helper">
          {t("auth.loginCtaPrefix")} <Link to="/login">{t("auth.loginCtaLink")}</Link>
        </p>
      </form>
    </section>
  );
}

function applyFieldErrors(error: ApiError, setError: UseFormSetError<RegisterForm>) {
  const fieldErrors = error.body?.field_errors;

  if (!fieldErrors) {
    setError("root", { message: error.message });
    return;
  }

  let handledField = false;
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if ((REGISTER_FIELDS as readonly string[]).includes(field)) {
      handledField = true;
      setError(field as (typeof REGISTER_FIELDS)[number], {
        message: messages.join(" "),
      });
    }
  }

  if (!handledField) {
    setError("root", { message: error.message });
  }
}
