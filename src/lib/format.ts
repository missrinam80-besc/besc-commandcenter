const dateFormatter = new Intl.DateTimeFormat("nl-BE", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("nl-BE", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const currencyFormatter = new Intl.NumberFormat("nl-BE", {
  style: "currency",
  currency: "EUR",
});

export function formatDate(value?: string | null, fallback = "Niet bepaald") {
  if (!value) return fallback;
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? fallback : dateFormatter.format(date);
}

export function formatDateTime(value?: string | null, fallback = "Geen deadline") {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : dateTimeFormatter.format(date);
}

export function formatCurrency(value?: number | string | null, fallback = "Niet bepaald") {
  if (value === null || value === undefined || value === "") return fallback;
  const amount = Number(value);
  return Number.isFinite(amount) ? currencyFormatter.format(amount) : fallback;
}
