import { LogIn } from "lucide-react";
import { useForm, type UseFormSetError } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { ApiError } from "../../api/client";
import { Button } from "../../components/Button";
import { InputField } from "../../components/Field";
import { Toolbar } from "../../components/Toolbar";
import { defaultPathFor, useCurrentUser, useLoginMutation } from "./useAuth";

const schema = z.object({
  username: z.string().min(1, "Введите логин"),
  password: z.string().min(1, "Введите пароль"),
});

type LoginForm = z.infer<typeof schema>;

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const loginMutation = useLoginMutation();
  const { data: session, isLoading } = useCurrentUser();
  const {
    formState: { errors },
    handleSubmit,
    setError,
    register,
  } = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: "demo_manager",
      password: "password",
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
      <Toolbar title="Вход" />
      <form className="panel form-grid" onSubmit={handleSubmit(onSubmit)}>
        <InputField
          autoComplete="username"
          error={errors.username?.message ?? errors.root?.message}
          label="Логин"
          {...register("username")}
        />
        <InputField
          autoComplete="current-password"
          error={errors.password?.message}
          label="Пароль"
          type="password"
          {...register("password")}
        />
        <div className="form-actions">
          <Button
            disabled={loginMutation.isPending}
            icon={<LogIn size={18} />}
            type="submit"
          >
            Войти
          </Button>
        </div>
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

  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (field === "username" || field === "password") {
      setError(field, { message: messages.join(" ") });
    }
  }

  setError("root", { message: error.message });
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
