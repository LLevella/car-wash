import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const method = init?.method?.toUpperCase() ?? "GET";

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

      const carDetailMatch = url.match(/\/api\/customers\/cars\/(\d+)\//);
      if (carDetailMatch) {
        const id = Number(carDetailMatch[1]);
        if (method === "DELETE") {
          return jsonResponse({
            id,
            number: `CAR${id}`,
            customer: 1,
            is_active: false,
            car_type: {
              id: 1,
              name: "Sedan",
              description: "Passenger car",
            },
          });
        }

        if (method === "PATCH") {
          const body = init?.body ? JSON.parse(String(init.body)) : {};
          return jsonResponse({
            id,
            number: body.number ?? `CAR${id}`,
            customer: 1,
            is_active: true,
            car_type: {
              id: body.car_type ?? 1,
              name: "Sedan",
              description: "Passenger car",
            },
          });
        }
      }

      if (url.includes("/api/customers/cars/") && method === "POST") {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return jsonResponse(
          {
            id: 99,
            number: body.number ?? "NEW001",
            customer: 1,
            is_active: true,
            car_type: {
              id: body.car_type ?? 1,
              name: "Sedan",
              description: "Passenger car",
            },
          },
          201,
        );
      }

      if (url.includes("/api/customers/cars/")) {
        return jsonResponse([
          {
            id: 1,
            number: "DEMO001",
            customer: 1,
            is_active: true,
            car_type: {
              id: 1,
              name: "Sedan",
              description: "Passenger car",
            },
          },
        ]);
      }

      if (url.includes("/api/cars/types/")) {
        return jsonResponse([
          { id: 1, name: "Sedan", description: "Passenger car" },
          { id: 2, name: "SUV", description: "Sport utility" },
        ]);
      }

      if (url.includes("/api/car-wash/availability/")) {
        return jsonResponse([
          {
            starts_at: "2099-05-08T10:30:00",
            ends_at: "2099-05-08T11:15:00",
            duration_minutes: 45,
            boxes: [{ id: 1, name: "Bay 1" }],
            washers: [{ id: 1, name: "Alex Washer" }],
          },
        ]);
      }

      if (url.includes("/api/manager/schedule/")) {
        return jsonResponse({
          station: 1,
          date: "2099-05-08",
          day_starts_at: "2099-05-08T00:00:00",
          day_ends_at: "2099-05-09T00:00:00",
          step_minutes: 30,
          boxes: [{ id: 1, name: "Bay 1", is_active: true }],
          shifts: [
            {
              id: 1,
              washer: 1,
              washer_name: "Alex Washer",
              wash_station: 1,
              starts_at: "2099-05-08T09:00:00",
              ends_at: "2099-05-08T18:00:00",
              is_active: true,
            },
          ],
          resource_blocks: [],
          bookings: [bookingFixture()],
          summary: {
            total_bookings: 1,
            active_bookings: 1,
            busy_box_minutes: [{ wash_box: 1, minutes: 45 }],
            busy_washer_minutes: [{ washer: 1, minutes: 45 }],
          },
        });
      }

      if (url.includes("/api/manager/bookings/1/assign/")) {
        return jsonResponse(bookingFixture());
      }

      if (url.includes("/api/manager/bookings/")) {
        return jsonResponse([bookingFixture()]);
      }

      if (url.includes("/api/manager/shifts/") && method === "POST") {
        return jsonResponse(shiftFixture(), 201);
      }

      if (url.includes("/api/manager/shifts/")) {
        return jsonResponse([shiftFixture()]);
      }

      if (url.includes("/api/manager/resource-blocks/") && method === "POST") {
        return jsonResponse({
          id: 1,
          wash_station: 1,
          wash_box: null,
          washer: null,
          starts_at: "2099-05-08T12:00:00",
          ends_at: "2099-05-08T13:00:00",
          reason: "Технический перерыв",
        });
      }

      if (url.includes("/api/manager/resource-blocks/")) {
        return jsonResponse([]);
      }

      if (url.includes("/api/car-wash/bookings/1/cancel/")) {
        return jsonResponse({ ...bookingFixture(), status: "cancelled" });
      }

      if (url.includes("/api/car-wash/bookings/1/reschedule/")) {
        return jsonResponse({
          ...bookingFixture(),
          starts_at: "2099-05-08T10:30:00",
          ends_at: "2099-05-08T11:15:00",
        });
      }

      if (url.includes("/api/car-wash/bookings/") && method === "POST") {
        return jsonResponse(bookingFixture(), 201);
      }

      if (url.includes("/api/car-wash/bookings/")) {
        return jsonResponse([bookingFixture()]);
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

function shiftFixture() {
  return {
    id: 1,
    washer: 1,
    washer_name: "Alex Washer",
    wash_station: 1,
    starts_at: "2099-05-08T09:00:00",
    ends_at: "2099-05-08T18:00:00",
    is_active: true,
  };
}

function bookingFixture() {
  return {
    id: 1,
    customer: 1,
    car: 1,
    wash_station: 1,
    wash_box: 1,
    wash_type: 1,
    starts_at: "2099-05-08T09:00:00",
    ends_at: "2099-05-08T09:45:00",
    status: "pending",
    cost: "1200.00",
    down_payment: "300.00",
    residual: "900.00",
    washers: [{ id: 1, name: "Alex Washer", role: "main" }],
  };
}
