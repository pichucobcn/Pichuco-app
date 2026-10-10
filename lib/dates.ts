/**
 * Utilidades de fecha. Toda la lógica de "hoy", "mañana", "esta noche" se
 * calcula en la zona horaria del restaurante (Barcelona por defecto).
 * Las fechas de servicio se manejan como strings ISO "YYYY-MM-DD" y se guardan
 * en columnas DATE (medianoche UTC).
 */
export const RESTAURANT_TZ = process.env.TZ_RESTAURANT || "Europe/Madrid";

const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function parts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: RESTAURANT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, hour: Number(p.hour) };
}

export function todayISO(now = new Date()): string {
  return parts(now).date;
}

export function nowHHMM(now = new Date()): string {
  return parts(now).time;
}

export function currentHour(now = new Date()): number {
  return parts(now).hour;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function toDbDate(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

export function fromDbDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isISODate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

export function weekdayName(iso: string): string {
  return DAYS[new Date(iso + "T00:00:00Z").getUTCDay()];
}

/** "sábado 10/10" */
export function prettyDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${weekdayName(iso)} ${d}/${m}`;
}

/** "hoy", "mañana" o "sábado 10/10" */
export function relativeDay(iso: string, today = todayISO()): string {
  if (iso === today) return "hoy";
  if (iso === addDays(today, 1)) return "mañana";
  if (iso === addDays(today, -1)) return "ayer";
  return prettyDate(iso);
}

export function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isHHMM(s: unknown): s is string {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** Hora local del restaurante "HH:MM" de un instante. */
export function timeOf(d: Date): string {
  return parts(d).time;
}

/** Fecha local del restaurante de un instante. */
export function dateOf(d: Date): string {
  return parts(d).date;
}

/**
 * Interpreta expresiones de fecha en castellano rioplatense/peninsular:
 * hoy, mañana, pasado mañana, esta noche, el viernes, 12/10, 2026-10-12.
 */
export function parseSpanishDate(text: string, today = todayISO()): string | null {
  const t = text.toLowerCase();
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso && isISODate(iso[1])) return iso[1];
  if (/pasado\s+mañana/.test(t)) return addDays(today, 2);
  const mananas = (t.match(/\bmañana\b/g) || []).length;
  const laManana = (t.match(/\bla\s+mañana\b/g) || []).length;
  if (mananas > laManana) return addDays(today, 1);
  if (/\b(hoy|esta noche|esta tarde|ahora)\b/.test(t)) return today;
  const dm = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (dm) {
    const year = Number(today.slice(0, 4));
    let cand = `${year}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
    if (isISODate(cand) && cand < today) cand = `${year + 1}${cand.slice(4)}`;
    if (isISODate(cand)) return cand;
  }
  const dayIdx = DAYS.findIndex((d) => new RegExp(`\\b${d.replace("é", "[eé]")}\\b`).test(t));
  if (dayIdx >= 0) {
    const cur = new Date(today + "T00:00:00Z").getUTCDay();
    let diff = (dayIdx - cur + 7) % 7;
    if (diff === 0) diff = 7;
    return addDays(today, diff);
  }
  return null;
}
