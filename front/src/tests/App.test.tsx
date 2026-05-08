import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "../app/App";
import { queryClient } from "../app/queryClient";
import { BookingPage } from "../features/booking/BookingPage";
import { ManagerBookingsPage } from "../features/manager-bookings/ManagerBookingsPage";

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
});
