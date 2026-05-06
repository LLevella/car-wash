import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url.includes("/api/auth/me/")) {
        return jsonResponse({
          is_authenticated: true,
          user: {
            id: 1,
            username: "demo_customer",
            email: "",
            first_name: "",
            last_name: "",
            is_staff: false,
            is_superuser: false,
          },
          roles: ["customer"],
          customer_id: 1,
        });
      }

      if (url.includes("/api/auth/csrf/")) {
        return jsonResponse({ csrf_token: "test-csrf" });
      }

      if (url.includes("/api/personal/stations/")) {
        return jsonResponse([
          {
            id: 1,
            name: "Demo Station",
            address: "1 Demo Street",
            city: { id: 1, name: "Demo City" },
            district: { id: 1, name: "Central" },
          },
        ]);
      }

      if (url.includes("/api/car-wash/wash-types/")) {
        return jsonResponse([
          {
            id: 1,
            name: "Standard wash",
            description: "Exterior wash and drying",
          },
        ]);
      }

      if (url.includes("/api/customers/me/")) {
        return jsonResponse({
          id: 1,
          name: "Demo Customer",
          phone_number: "+10000000000",
          user_id: 1,
          car: {
            id: 1,
            number: "DEMO001",
            car_type: {
              id: 1,
              name: "Sedan",
              description: "Passenger car",
            },
          },
        });
      }

      if (url.includes("/api/customers/cars/")) {
        return jsonResponse([
          {
            id: 1,
            number: "DEMO001",
            car_type: {
              id: 1,
              name: "Sedan",
              description: "Passenger car",
            },
          },
        ]);
      }

      if (url.includes("/api/car-wash/availability/")) {
        return jsonResponse([
          {
            starts_at: "2026-05-06T10:30:00",
            ends_at: "2026-05-06T11:15:00",
            duration_minutes: 45,
            boxes: [{ id: 1, name: "Bay 1" }],
            washers: [{ id: 1, name: "Alex Washer" }],
          },
        ]);
      }

      if (url.includes("/api/car-wash/bookings/")) {
        return jsonResponse([]);
      }

      return jsonResponse(null);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}
