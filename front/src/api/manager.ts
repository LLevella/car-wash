import { apiRequest } from "./client";
import type {
  Booking,
  BookingStatus,
  ManagerScheduleDay,
  ResourceBlock,
  WasherShift,
} from "./types";

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

export type ManagerResourceFilters = {
  station?: number;
  date?: string;
};

export type CreateManagerShiftPayload = {
  washer: number;
  wash_station: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
};

export type CreateResourceBlockPayload = {
  wash_station: number;
  wash_box?: number | null;
  washer?: number | null;
  starts_at: string;
  ends_at: string;
  reason: string;
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

export function getManagerBooking(id: number) {
  return apiRequest<Booking>(`/api/manager/bookings/${id}/`);
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

export function getManagerShifts(filters: ManagerResourceFilters = {}) {
  return apiRequest<WasherShift[]>(
    `/api/manager/shifts/?${new URLSearchParams(stringifyParams(filters)).toString()}`,
  );
}

export function createManagerShift(payload: CreateManagerShiftPayload) {
  return apiRequest<WasherShift>("/api/manager/shifts/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getManagerResourceBlocks(filters: ManagerResourceFilters = {}) {
  return apiRequest<ResourceBlock[]>(
    `/api/manager/resource-blocks/?${new URLSearchParams(
      stringifyParams(filters),
    ).toString()}`,
  );
}

export function createManagerResourceBlock(payload: CreateResourceBlockPayload) {
  return apiRequest<ResourceBlock>("/api/manager/resource-blocks/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function stringifyParams(params: Record<string, string | number | undefined>) {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
}
