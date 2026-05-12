import type { Station, WasherShift } from "../../api/types";
import {
  dateInputValue,
  formatDate,
  formatTime,
  formatTimeRange,
} from "../../i18n/format";

export const today = dateInputValue();

export function stationLabel(station: Station) {
  return station.address ? `${station.name}, ${station.address}` : station.name;
}

export function buildDateTime(day: string, time: string) {
  return `${day}T${time}:00`;
}

export function validateTimeRange(
  startsAt: string,
  endsAt: string,
): "missingFields" | "endsAfterStart" | null {
  if (!startsAt || !endsAt) {
    return "missingFields";
  }

  if (startsAt >= endsAt) {
    return "endsAfterStart";
  }

  return null;
}

export { formatDate, formatTime, formatTimeRange };

export function uniqueShiftWashers(shifts: WasherShift[]) {
  const washers = new Map<number, string>();

  for (const shift of shifts) {
    washers.set(shift.washer, shift.washer_name);
  }

  return Array.from(washers, ([id, name]) => ({ id, name })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
