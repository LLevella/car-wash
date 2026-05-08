import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { ManagerSchedulePage } from "../features/manager-schedule/ManagerSchedulePage";

function renderRoute(path = "/book") {
  const router = createMemoryRouter(
    [
      {
        element: <App />,
        path: "/",
        children: [
          { path: "/book", element: <BookingPage /> },
          { path: "/my/bookings", element: <BookingPage view="bookings" /> },
          {
            path: "/my/bookings/:bookingId",
            element: <BookingPage view="details" />,
          },
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
});
