import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "../app/App";
import { queryClient } from "../app/queryClient";
import { BookingPage } from "../features/booking/BookingPage";

function renderRoute(path = "/book") {
  const router = createMemoryRouter(
    [
      {
        element: <App />,
        path: "/",
        children: [{ path: "/book", element: <BookingPage /> }],
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
  it("renders the booking workspace", () => {
    renderRoute();

    expect(
      screen.getByRole("heading", { level: 1, name: "Новая запись" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /10:30/i })).toHaveClass("slot--active");
  });
});
