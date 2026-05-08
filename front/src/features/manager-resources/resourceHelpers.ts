import type { Station, WasherShift } from "../../api/types";

export const today = new Date().toISOString().slice(0, 10);

export function stationLabel(station: Station) {
  return station.address ? `${station.name}, ${station.address}` : station.name;
}

export function buildDateTime(day: string, time: string) {
  return `${day}T${time}:00`;
}

export function validateTimeRange(startsAt: string, endsAt: string) {
  if (!startsAt || !endsAt) {
    return "Заполните начало и окончание интервала.";
  }

  if (startsAt >= endsAt) {
    return "Окончание должно быть позже начала.";
  }

  return null;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatTimeRange(startsAt: string, endsAt: string) {
  return `${formatTime(startsAt)}-${formatTime(endsAt)}`;
}

export function uniqueShiftWashers(shifts: WasherShift[]) {
  const washers = new Map<number, string>();

  for (const shift of shifts) {
    washers.set(shift.washer, shift.washer_name);
  }

  return Array.from(washers, ([id, name]) => ({ id, name })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
