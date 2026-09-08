/**
 * Canonical WITA (Asia/Makassar / UTC+8) Date & Time Presentation Utility
 * 
 * Enforces authoritative WITA representation across form inputs, displays,
 * and server actions, eliminating client browser timezone drift.
 */

export const WITA_TIMEZONE = "Asia/Makassar";
export const WITA_OFFSET_HOURS = 8;
export const WITA_OFFSET_STRING = "+08:00";

/**
 * Converts any UTC Date, ISO string, or timestamp to a YYYY-MM-DDTHH:mm string
 * strictly in the Asia/Makassar (WITA) timezone, suitable for <input type="datetime-local">.
 */
export function toWitaDatetimeLocalValue(date: Date | string | number = new Date()): string {
  const d = typeof date === "object" ? date : new Date(date);
  if (isNaN(d.getTime())) {
    return "";
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: WITA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "00";

  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  let hour = getPart("hour");
  // Some locales or engines format 24:00 as hour 24
  if (hour === "24") hour = "00";
  const minute = getPart("minute");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * Parses a YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss datetime-local form input
 * strictly as WITA (Asia/Makassar / UTC+8), returning an authoritative UTC Date object.
 */
export function parseWitaDatetimeLocalInput(inputValue: string): Date {
  if (!inputValue || !inputValue.trim()) {
    throw new Error("Input tanggal dan waktu WITA tidak boleh kosong.");
  }

  const clean = inputValue.trim();
  // Strip any existing timezone offset if accidentally passed
  const bare = clean.replace(/[Zz]$/, "").replace(/([+-]\d{2}:\d{2})$/, "");

  let isoWithOffset: string;
  if (bare.length === 16) {
    isoWithOffset = `${bare}:00${WITA_OFFSET_STRING}`;
  } else if (bare.length === 19) {
    isoWithOffset = `${bare}${WITA_OFFSET_STRING}`;
  } else {
    isoWithOffset = `${bare}${WITA_OFFSET_STRING}`;
  }

  const parsed = new Date(isoWithOffset);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Format tanggal dan waktu WITA tidak valid: "${inputValue}".`);
  }

  return parsed;
}

/**
 * Formats a Date or timestamp into natural Indonesian Atelier WITA string.
 * Example: "18 Agu 2026, 23.59 WITA"
 */
export function formatWitaDate(
  date: Date | string | number | null | undefined,
  options?: {
    includeTime?: boolean;
    monthFormat?: "short" | "long" | "numeric";
  }
): string {
  if (!date) return "Belum Ditentukan";
  const d = typeof date === "object" ? date : new Date(date);
  if (isNaN(d.getTime())) return "Waktu Tidak Valid";

  const includeTime = options?.includeTime ?? true;
  const monthFormat = options?.monthFormat ?? "short";

  const dateFormatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: WITA_TIMEZONE,
    day: "numeric",
    month: monthFormat,
    year: "numeric",
    ...(includeTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }
      : {}),
  });

  const formatted = dateFormatter.format(d);
  return includeTime ? `${formatted.replace(/\./g, ":")} WITA` : formatted;
}
