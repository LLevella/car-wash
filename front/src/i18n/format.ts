import i18n from "./index";

export function dateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDate(value: string, locale?: string) {
  const date = parseDate(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat(activeLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatTime(value: string, locale?: string) {
  const date = parseDate(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat(activeLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDateTime(value: string, locale?: string) {
  const date = parseDate(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat(activeLocale(locale), {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatTimeRange(startsAt: string, endsAt: string, locale?: string) {
  return `${formatTime(startsAt, locale)}-${formatTime(endsAt, locale)}`;
}

export function formatMoney(value: string, locale?: string, currency = "RUB") {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return value;
  }

  return new Intl.NumberFormat(activeLocale(locale), {
    currency,
    style: "currency",
  }).format(amount);
}

function activeLocale(locale?: string) {
  return locale ?? i18n.resolvedLanguage ?? i18n.language;
}

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
