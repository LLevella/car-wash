import { apiRequest } from "./client";
import type { Booking, BookingStatus, ManagerScheduleDay } from "./types";

export type ManagerScheduleParams = {
  station: number;
  date: string;
};

export type ManagerBookingFilters = {
  station?: number;
  date?: string;
  status?: BookingStatus;
  box?: number;
  washer?: number;
};

export function getManagerSchedule(params: ManagerScheduleParams) {
  return apiRequest<ManagerScheduleDay>(
    `/api/manager/schedule/?${new URLSearchParams(stringifyParams(params)).toString()}`,
  );
}

export function getManagerBookings(filters: ManagerBookingFilters = {}) {
  return apiRequest<Booking[]>(
    `/api/manager/bookings/?${new URLSearchParams(
      stringifyParams(filters),
    ).toString()}`,
  );
}

export function assignBooking(
  id: number,
  payload: { wash_box: number | null; washers: number[] },
) {
  return apiRequest<Booking>(`/api/manager/bookings/${id}/assign/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function updateManagerBookingStatus(id: number, status: BookingStatus) {
  return apiRequest<Booking>(`/api/manager/bookings/${id}/status/`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

function stringifyParams(params: Record<string, string | number | undefined>) {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
}
