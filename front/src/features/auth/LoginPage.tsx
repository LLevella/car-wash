import { LogIn } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "../../components/Button";
import { InputField } from "../../components/Field";
import { Toolbar } from "../../components/Toolbar";

const schema = z.object({
  username: z.string().min(1, "Введите логин"),
  password: z.string().min(1, "Введите пароль"),
});

type LoginForm = z.infer<typeof schema>;

export function LoginPage() {
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: "demo_manager",
      password: "password",
    },
  });

  return (
    <section className="page page--narrow">
      <Toolbar title="Вход" />
      <form className="panel form-grid" onSubmit={handleSubmit(() => undefined)}>
        <InputField
          autoComplete="username"
          error={errors.username?.message}
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
          <Button icon={<LogIn size={18} />} type="submit">
            Войти
          </Button>
        </div>
      </form>
    </section>
  );
}
