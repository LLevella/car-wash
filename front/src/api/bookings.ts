import { apiRequest } from "./client";
import type { AvailabilitySlot, Booking, BookingStatus } from "./types";

export type AvailabilityParams = {
  station: number;
  car_type: number;
  wash_type: number;
  date: string;
};

export type CreateBookingPayload = {
  customer: number;
  car: number;
  wash_station: number;
  wash_type: number;
  starts_at: string;
};

export function getAvailability(params: AvailabilityParams) {
  return apiRequest<AvailabilitySlot[]>(
    `/api/car-wash/availability/?${new URLSearchParams(
      stringifyParams(params),
    ).toString()}`,
  );
}

export function getBookings() {
  return apiRequest<Booking[]>("/api/car-wash/bookings/");
}

export function createBooking(payload: CreateBookingPayload) {
  return apiRequest<Booking>("/api/car-wash/bookings/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function cancelBooking(id: number) {
  return apiRequest<Booking>(`/api/car-wash/bookings/${id}/cancel/`, {
    method: "PATCH",
  });
}

export function changeBookingStatus(id: number, status: BookingStatus) {
  return apiRequest<Booking>(`/api/car-wash/bookings/${id}/status/`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

function stringifyParams(params: Record<string, string | number>) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  );
}
