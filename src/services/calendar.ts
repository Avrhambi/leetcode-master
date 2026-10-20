import { REMINDER_DEFAULT_MINUTES } from './constants';

// Builds the practice-reminder calendar file (RFC 5545). Pure: the start date is
// passed in as a `YYYY-MM-DD` local string and the app URL as an argument, so the
// same input always gives the same text. Nothing here is stored or sent anywhere.

export const WEEKDAYS = [
  { code: 'MO', label: 'Mon', name: 'Monday' },
  { code: 'TU', label: 'Tue', name: 'Tuesday' },
  { code: 'WE', label: 'Wed', name: 'Wednesday' },
  { code: 'TH', label: 'Thu', name: 'Thursday' },
  { code: 'FR', label: 'Fri', name: 'Friday' },
  { code: 'SA', label: 'Sat', name: 'Saturday' },
  { code: 'SU', label: 'Sun', name: 'Sunday' }
] as const;
export type Weekday = (typeof WEEKDAYS)[number]['code'];

export interface ReminderInput {
  days: readonly Weekday[];
  /** Local time of day, `HH:MM`. */
  time: string;
  /** Today's local date; the first event falls on or after it. */
  startDate: string;
  /** Event length in minutes: the time budget when one is set. */
  durationMinutes?: number;
  /** The deployed app's URL, or null when not known. */
  appUrl?: string | null;
}

export const REMINDER_FILE_NAME = 'leetcode-master-practice-reminder.ics';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;
const CODE_BY_UTC_DAY: Weekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function isReminderTime(time: string): boolean {
  return TIME_PATTERN.test(time);
}

// Days offered when the user has a weekly goal of N days, spread across the week.
const GOAL_DAYS: Record<number, Weekday[]> = {
  1: ['MO'],
  2: ['MO', 'TH'],
  3: ['MO', 'WE', 'FR'],
  4: ['MO', 'TU', 'TH', 'FR'],
  5: ['MO', 'TU', 'WE', 'TH', 'FR'],
  6: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA'],
  7: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
};

// The prefilled days: the weekly goal's day count when one is set, else three days.
export function defaultReminderDays(weeklyGoal: number | null): Weekday[] {
  return [...(GOAL_DAYS[weeklyGoal ?? 3] ?? GOAL_DAYS[3])];
}

// RFC 5545 TEXT escaping: backslash, semicolon, comma, and newlines as a literal \n.
export function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();

// Fold a content line to at most 75 octets. A continuation line begins with one
// space, which counts toward its 75. Splits fall between code points, never inside
// a multi-byte UTF-8 character.
export function foldLine(line: string): string {
  const lines: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const width = encoder.encode(char).length;
    if (size + width > 75) {
      lines.push(current);
      current = ' ';
      size = 1;
    }
    current += char;
    size += width;
  }
  lines.push(current);
  return lines.join('\r\n');
}

// Only a public https page counts as "the deployed app": a local dev server or a
// file:// page is not a link anyone could open. The filename, query and hash are
// dropped so the link is the app's folder. Pass `window.location.href` from the caller.
export function deployedAppUrl(href: string): string | null {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  const host = url.hostname;
  const local = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '[::1]' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
  if (url.protocol !== 'https:' || local) return null;
  return `${url.origin}${url.pathname.replace(/[^/]*$/, '')}`;
}

function parseDate(date: string): number {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new RangeError(`Invalid start date: ${date}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function compactDate(utcMillis: number): string {
  return new Date(utcMillis).toISOString().slice(0, 10).replace(/-/g, '');
}

// The calendar text for a weekly practice reminder, CRLF line endings throughout.
export function buildReminderIcs({ days, time, startDate, durationMinutes = REMINDER_DEFAULT_MINUTES, appUrl = null }: ReminderInput): string {
  const picked = WEEKDAYS.map((day) => day.code).filter((code) => days.includes(code));
  if (picked.length === 0) throw new RangeError('Pick at least one day.');
  if (!isReminderTime(time)) throw new RangeError(`Invalid time: ${time}`);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1) throw new RangeError(`Invalid duration: ${durationMinutes}`);

  const start = parseDate(startDate);
  // DTSTART is the first picked day on or after the start date, so it agrees with BYDAY.
  let first = start;
  while (!picked.includes(CODE_BY_UTC_DAY[new Date(first).getUTCDay()])) first += DAY_MS;
  const clock = time.replace(':', '');
  const intro = 'Time for your LeetCode Master practice.';
  const description = appUrl ? `${intro}\nOpen the app: ${appUrl}` : intro;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LeetCode Master//Practice reminder//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:practice-${picked.join('')}-${clock}@leetcode-master`,
    `DTSTAMP:${compactDate(start)}T000000Z`,
    `DTSTART:${compactDate(first)}T${clock}00`,
    `DURATION:PT${durationMinutes}M`,
    `RRULE:FREQ=WEEKLY;BYDAY=${picked.join(',')}`,
    'SUMMARY:LeetCode practice',
    `DESCRIPTION:${escapeText(description)}`,
    ...(appUrl ? [`URL:${appUrl}`] : []),
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
