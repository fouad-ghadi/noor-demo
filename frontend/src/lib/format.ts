/**
 * Formatage des dates et nombres en français.
 * Exemple : formatDate("2026-10-16") → "16 oct. 2026".
 *
 * Le backend renvoie des dates « locales » sans fuseau (ex. "2026-10-16T09:30:00") :
 * parseISO les interprète dans le fuseau du navigateur, ce qui est voulu.
 */
import { differenceInCalendarDays, format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

type DateInput = string | Date;

const toDate = (d: DateInput) => (typeof d === "string" ? parseISO(d) : d);

/** "16 oct. 2026" */
export const formatDate = (d: DateInput) => format(toDate(d), "d MMM yyyy", { locale: fr });

/** "16 oct." */
export const formatShortDate = (d: DateInput) => format(toDate(d), "d MMM", { locale: fr });

/** "16 oct. 2026 à 09:30" */
export const formatDateTime = (d: DateInput) => format(toDate(d), "d MMM yyyy 'à' HH:mm", { locale: fr });

/** "09:30" */
export const formatTime = (d: DateInput) => format(toDate(d), "HH:mm");

/** "vendredi 16 octobre" */
export const formatLongDay = (d: DateInput) => format(toDate(d), "EEEE d MMMM", { locale: fr });

/** "Aujourd'hui", "Demain", "Hier" ou "ven. 16 oct." */
export function formatRelativeDay(d: DateInput): string {
  const date = toDate(d);
  if (isToday(date)) return "Aujourd'hui";
  if (isTomorrow(date)) return "Demain";
  if (isYesterday(date)) return "Hier";
  return format(date, "EEE d MMM", { locale: fr });
}

/** "il y a 3 jours" */
export const formatAgo = (d: DateInput) => `il y a ${formatDistanceToNowStrict(toDate(d), { locale: fr })}`;

/** Nombre de jours entre aujourd'hui et une date (positif = dans le futur). */
export const daysFromToday = (d: DateInput) => differenceInCalendarDays(toDate(d), new Date());

/** Date → chaîne ISO locale sans fuseau, attendue par le backend : "2026-10-16T09:30:00". */
export const toApiDateTime = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm:ss");

/** Date → "2026-10-16" */
export const toApiDate = (d: Date) => format(d, "yyyy-MM-dd");

/** 72.4 → "72 %" */
export const formatPct = (n: number, digits = 0) => `${n.toFixed(digits).replace(".", ",")} %`;

/** Initiales pour les avatars : "Salma Berrada" → "SB" */
export const initials = (name: string) =>
  name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Mois de l'API → "Octobre 2026" ; version courte : "oct." */
export function formatPeriod(period: string, short = false): string {
  const m = Number(period.slice(5, 7)) - 1;
  return short ? MONTHS_SHORT[m] : `${capitalize(MONTHS[m])} ${period.slice(0, 4)}`;
}

/** "octobre 2026" → "Octobre 2026" */
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Montant en dirhams, abrégé : 16 800 000 → "16,8 M DH", 175 420 → "175 k DH" */
export function formatMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M DH`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000).toLocaleString("fr-FR")} k DH`;
  return `${Math.round(n).toLocaleString("fr-FR")} DH`;
}
