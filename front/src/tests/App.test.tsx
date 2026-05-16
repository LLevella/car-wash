import { QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "../app/App";
import { queryClient } from "../app/queryClient";
import { BookingPage } from "../features/booking/BookingPage";
import { ManagerBookingDetailsPage } from "../features/manager-bookings/ManagerBookingDetailsPage";
import { ManagerBookingsPage } from "../features/manager-bookings/ManagerBookingsPage";
import { ManagerResourceBlocksPage } from "../features/manager-resources/ManagerResourceBlocksPage";
import { ManagerShiftsPage } from "../features/manager-resources/ManagerShiftsPage";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { ManagerReportsPage } from "../features/manager-reports/ManagerReportsPage";
import { ManagerSchedulePage } from "../features/manager-schedule/ManagerSchedulePage";
import { MyCarsPage } from "../features/my-cars/MyCarsPage";
import i18n from "../i18n";
import { setTestAuthState } from "./setup";

function renderRoute(path = "/book") {
  const router = createMemoryRouter(
    [
      {
        element: <App />,
        path: "/",
        children: [
          { path: "/login", element: <LoginPage /> },
          { path: "/register", element: <RegisterPage /> },
          { path: "/book", element: <BookingPage /> },
          { path: "/my/bookings", element: <BookingPage view="bookings" /> },
          {
            path: "/my/bookings/:bookingId",
            element: <BookingPage view="details" />,
          },
          { path: "/my/cars", element: <MyCarsPage /> },
          { path: "/manager/bookings", element: <ManagerBookingsPage /> },
          {
            path: "/manager/bookings/:bookingId",
            element: <ManagerBookingDetailsPage />,
          },
          { path: "/manager/schedule", element: <ManagerSchedulePage /> },
          { path: "/manager/shifts", element: <ManagerShiftsPage /> },
          {
            path: "/manager/resource-blocks",
            element: <ManagerResourceBlocksPage />,
          },
          { path: "/manager/reports", element: <ManagerReportsPage /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("App", () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it("renders the booking workspace", async () => {
    renderRoute();

    expect(
      screen.getByRole("heading", { level: 1, name: "Новая запись" }),
    ).toBeInTheDocument();
    const slot = await screen.findByRole("button", { name: /10:30/i });
    await waitFor(() => expect(slot).toHaveClass("slot--active"));
  });

  it("opens reschedule dialog from customer bookings", async () => {
    const user = userEvent.setup();

    renderRoute("/my/bookings");

    expect(
      screen.getByRole("heading", { level: 1, name: "Мои записи" }),
    ).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Перенести" }));

    expect(
      await screen.findByRole("dialog", { name: "Перенос записи #1" }),
    ).toBeInTheDocument();
    const slot = await screen.findByRole("button", { name: /10:30/i });
    await waitFor(() => expect(slot).toHaveClass("slot--active"));
    expect(screen.getByRole("button", { name: "Перенести запись" })).toBeEnabled();
  });

  it("renders customer booking details", async () => {
    renderRoute("/my/bookings/1");

    expect(
      screen.getByRole("heading", { level: 1, name: "Детали записи" }),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Demo Station" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Бокс 1")).toBeInTheDocument();
    expect(screen.getByText("300,00 ₽")).toBeInTheDocument();
    expect(screen.getByText("900,00 ₽")).toBeInTheDocument();
    expect(screen.getByText("Alex Washer")).toBeInTheDocument();
  });

  it("opens manager assignment dialog", async () => {
    const user = userEvent.setup();

    renderRoute("/manager/bookings");

    await user.click(await screen.findByRole("button", { name: "Назначить" }));

    expect(
      await screen.findByRole("dialog", { name: "Назначение заказа #1" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Alex Washer")).toBeChecked();
    expect(screen.getByRole("button", { name: "Сохранить назначение" })).toBeEnabled();
  });

  it("renders manager booking details", async () => {
    renderRoute("/manager/bookings/1");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Заказ #1" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Клиент #1")).toBeInTheDocument();
    expect(screen.getByText("Бокс 1")).toBeInTheDocument();
    expect(screen.getByText("Alex Washer")).toBeInTheDocument();
    const badges = await screen.findAllByTestId("payment-badge");
    expect(badges[0]).toHaveTextContent("Оплачено");
  });

  it("renders audit history for manager bookings", async () => {
    renderRoute("/manager/bookings/1");

    await screen.findByRole("heading", { level: 1, name: "Заказ #1" });
    const history = await screen.findByRole("region", {
      name: "История действий",
    });
    const list = await within(history).findByRole("list");
    expect(within(list).getByText("Создание")).toBeInTheDocument();
    expect(within(list).getByText("Смена статуса")).toBeInTheDocument();
    expect(within(history).getByText("Ожидает → Подтверждена")).toBeInTheDocument();
  });

  it("opens assignment dialog from manager schedule", async () => {
    const user = userEvent.setup();

    renderRoute("/manager/schedule");

    await screen.findByRole("heading", { level: 1, name: "Расписание" });
    await user.click(await screen.findByLabelText("Назначить заказ #1"));

    expect(
      await screen.findByRole("dialog", { name: "Назначение заказа #1" }),
    ).toBeInTheDocument();
  });

  it("validates manager shift time range", async () => {
    renderRoute("/manager/shifts");

    await screen.findByRole("heading", { level: 1, name: "Смены" });
    fireEvent.change(screen.getByLabelText("Окончание"), {
      target: { value: "08:00" },
    });

    expect(screen.getByText("Окончание должно быть позже начала.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать смену" })).toBeDisabled();
  });

  it("validates resource block time range", async () => {
    renderRoute("/manager/resource-blocks");

    await screen.findByRole("heading", { level: 1, name: "Блокировки" });
    fireEvent.change(screen.getByLabelText("Окончание"), {
      target: { value: "11:00" },
    });

    expect(screen.getByText("Окончание должно быть позже начала.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Создать блокировку" })).toBeDisabled();
  });

  it("renders the customer cars list", async () => {
    renderRoute("/my/cars");

    expect(
      screen.getByRole("heading", { level: 1, name: "Мои автомобили" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("DEMO001")).toBeInTheDocument();
    expect(screen.getByText("Sedan")).toBeInTheDocument();
    expect(screen.getByLabelText("Удалить DEMO001")).toBeEnabled();
  });

  it("opens the new car modal", async () => {
    const user = userEvent.setup();

    renderRoute("/my/cars");
    await screen.findByText("DEMO001");

    await user.click(screen.getByRole("button", { name: "Добавить автомобиль" }));

    expect(
      await screen.findByRole("dialog", { name: "Новый автомобиль" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Номер")).toBeInTheDocument();
    expect(screen.getByLabelText("Тип")).toBeInTheDocument();
  });

  it("opens the new car modal in the selected English language", async () => {
    const user = userEvent.setup();
    await i18n.changeLanguage("en");

    renderRoute("/my/cars");
    await screen.findByText("DEMO001");

    await user.click(screen.getByRole("button", { name: "Add a car" }));

    const dialog = await screen.findByRole("dialog", { name: "New car" });
    expect(within(dialog).getByLabelText("Plate")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Type")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
    expect(within(dialog).queryByText("Новый автомобиль")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Сохранить")).not.toBeInTheDocument();
  });

  it("retranslates open car modal validation errors after language changes", async () => {
    const user = userEvent.setup();

    renderRoute("/my/cars");
    await screen.findByText("DEMO001");
    await user.click(screen.getByRole("button", { name: "Добавить автомобиль" }));

    const dialog = await screen.findByRole("dialog", { name: "Новый автомобиль" });
    await user.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    expect(
      await within(dialog).findByText("Укажите номер автомобиля"),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Язык"), "en");

    await waitFor(() => {
      expect(within(dialog).getByText("Enter the plate number")).toBeInTheDocument();
    });
    expect(within(dialog).queryByText("Укажите номер автомобиля")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "New car" })).toBeInTheDocument();
  });

  it("offers a registration link from the login page", async () => {
    setTestAuthState("anonymous");
    renderRoute("/login");

    const registerLink = await screen.findByRole("link", {
      name: "Зарегистрироваться",
    });
    expect(registerLink).toHaveAttribute("href", "/register");
  });

  it("validates the registration form", async () => {
    setTestAuthState("anonymous");
    const user = userEvent.setup();

    renderRoute("/register");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Регистрация" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Зарегистрироваться" }));

    expect(await screen.findByText("Минимум 3 символа")).toBeInTheDocument();
    expect(screen.getByText("Минимум 8 символов")).toBeInTheDocument();
    expect(screen.getByText("Введите имя")).toBeInTheDocument();
    expect(screen.getByText("Введите телефон")).toBeInTheDocument();
  });

  it("renders manager reports aggregates", async () => {
    renderRoute("/manager/reports");

    expect(
      screen.getByRole("heading", { level: 1, name: "Отчёты" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Завершена/)).toBeInTheDocument();
      expect(screen.getByText(/5\s?400,00\s?₽/)).toBeInTheDocument();
      expect(screen.getByText(/Бокс #1/)).toBeInTheDocument();
      expect(screen.getByText(/Мойщик #1/)).toBeInTheDocument();
    });
  });

  it("validates manager reports date range in the selected English language", async () => {
    await i18n.changeLanguage("en");

    renderRoute("/manager/reports");

    await screen.findByRole("heading", { level: 1, name: "Reports" });
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2099-05-10" },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2099-05-08" },
    });

    expect(
      screen.getByText("From date must be on or before To date."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/date_to/)).not.toBeInTheDocument();
    expect(screen.queryByText(/раньше/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDisabled();
  });

  it("validates car form input", async () => {
    const user = userEvent.setup();

    renderRoute("/my/cars");
    await screen.findByText("DEMO001");
    await user.click(screen.getByRole("button", { name: "Добавить автомобиль" }));

    const dialog = await screen.findByRole("dialog", { name: "Новый автомобиль" });
    await user.click(within(dialog).getByRole("button", { name: "Сохранить" }));

    expect(
      await within(dialog).findByText("Укажите номер автомобиля"),
    ).toBeInTheDocument();
  });

  it("opens manager assignment modal in the selected English language", async () => {
    const user = userEvent.setup();
    await i18n.changeLanguage("en");

    renderRoute("/manager/bookings");

    await user.click(await screen.findByRole("button", { name: "Assign" }));

    const dialog = await screen.findByRole("dialog", { name: "Assign booking #1" });
    expect(within(dialog).getByText("Current bay")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save assignment" })).toBeEnabled();
    expect(within(dialog).queryByText("Назначение заказа #1")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Сохранить назначение")).not.toBeInTheDocument();
  });
});
