import { createBrowserRouter, Navigate } from "react-router-dom";

import { App } from "./App";
import { LoginPage } from "../features/auth/LoginPage";
import { BookingPage } from "../features/booking/BookingPage";
import { ManagerBookingsPage } from "../features/manager-bookings/ManagerBookingsPage";
import { ManagerSchedulePage } from "../features/manager-schedule/ManagerSchedulePage";

export const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/book" replace /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/book", element: <BookingPage /> },
      { path: "/my/bookings", element: <BookingPage view="bookings" /> },
      { path: "/manager/schedule", element: <ManagerSchedulePage /> },
      { path: "/manager/bookings", element: <ManagerBookingsPage /> },
      { path: "*", element: <Navigate to="/book" replace /> },
    ],
  },
]);
