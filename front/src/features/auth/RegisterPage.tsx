import { UserPlus } from "lucide-react";
import { useForm, type UseFormSetError } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { ApiError } from "../../api/client";
import { Button } from "../../components/Button";
import { InputField } from "../../components/Field";
import { Toolbar } from "../../components/Toolbar";
import { defaultPathFor, useCurrentUser, useRegisterMutation } from "./useAuth";

const schema = z
  .object({
    username: z.string().min(3, "Минимум 3 символа"),
    password: z.string().min(8, "Минимум 8 символов"),
    password_confirm: z.string().min(1, "Повторите пароль"),
    name: z.string().min(1, "Введите имя"),
    phone_number: z.string().min(1, "Введите телефон"),
  })
  .refine((values) => values.password === values.password_confirm, {
    message: "Пароли не совпадают",
    path: ["password_confirm"],
  });

type RegisterForm = z.infer<typeof schema>;

const REGISTER_FIELDS = [
  "username",
  "password",
  "password_confirm",
  "name",
  "phone_number",
] as const;

export function RegisterPage() {
  const navigate = useNavigate();
  const registerMutation = useRegisterMutation();
  const { data: session, isLoading } = useCurrentUser();
  const {
    formState: { errors },
    handleSubmit,
    setError,
    register,
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

  async function onSubmit(values: RegisterForm) {
    try {
      const nextSession = await registerMutation.mutateAsync(values);
      navigate(defaultPathFor(nextSession), { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        applyFieldErrors(error, setError);
      }
    }
  }

  if (isLoading) {
    return (
      <section className="page page--narrow">
        <div className="panel state-panel">Загрузка...</div>
      </section>
    );
  }

  if (session?.is_authenticated) {
    return <Navigate replace to={defaultPathFor(session)} />;
  }

  return (
    <section className="page page--narrow">
      <Toolbar title="Регистрация" />
      <form className="panel form-grid" onSubmit={handleSubmit(onSubmit)}>
        <InputField
          autoComplete="username"
          error={errors.username?.message}
          label="Логин"
          {...register("username")}
        />
        <InputField error={errors.name?.message} label="Имя" {...register("name")} />
        <InputField
          autoComplete="tel"
          error={errors.phone_number?.message}
          label="Телефон"
          type="tel"
          {...register("phone_number")}
        />
        <InputField
          autoComplete="new-password"
          error={errors.password?.message}
          label="Пароль"
          type="password"
          {...register("password")}
        />
        <InputField
          autoComplete="new-password"
          error={errors.password_confirm?.message}
          label="Повторите пароль"
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
            Зарегистрироваться
          </Button>
        </div>
        <p className="form-helper">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
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

  for (const [field, messages] of Object.entries(fieldErrors)) {
    if ((REGISTER_FIELDS as readonly string[]).includes(field)) {
      setError(field as (typeof REGISTER_FIELDS)[number], {
        message: messages.join(" "),
      });
    }
  }

  setError("root", { message: error.message });
}
