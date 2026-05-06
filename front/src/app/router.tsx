import { createBrowserRouter, Navigate } from "react-router-dom";

import { App } from "./App";
import { HomeRedirect } from "../features/auth/HomeRedirect";
import { LoginPage } from "../features/auth/LoginPage";
import { ProtectedRoute } from "../features/auth/ProtectedRoute";
import { BookingPage } from "../features/booking/BookingPage";
import { ManagerBookingsPage } from "../features/manager-bookings/ManagerBookingsPage";
import { ManagerSchedulePage } from "../features/manager-schedule/ManagerSchedulePage";

export const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: "/login", element: <LoginPage /> },
      {
        path: "/book",
        element: (
          <ProtectedRoute roles={["customer"]}>
            <BookingPage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/my/bookings",
        element: (
          <ProtectedRoute roles={["customer"]}>
            <BookingPage view="bookings" />
          </ProtectedRoute>
        ),
      },
      {
        path: "/manager/schedule",
        element: (
          <ProtectedRoute roles={["manager", "admin"]}>
            <ManagerSchedulePage />
          </ProtectedRoute>
        ),
      },
      {
        path: "/manager/bookings",
        element: (
          <ProtectedRoute roles={["manager", "admin"]}>
            <ManagerBookingsPage />
          </ProtectedRoute>
        ),
      },
      { path: "*", element: <Navigate to="/book" replace /> },
    ],
  },
]);
