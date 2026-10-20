import { describe, expect, it } from 'vitest';
import { buildReminderIcs, defaultReminderDays, deployedAppUrl, escapeText, foldLine, isReminderTime } from './calendar';

// 2026-10-20 is a Tuesday, so the first Mon/Wed/Fri event is Wednesday 2026-10-21.
const sample = { days: ['FR', 'MO', 'WE'] as const, time: '18:00', startDate: '2026-10-20', durationMinutes: 45, appUrl: 'https://example.github.io/leetcode-master/' };

const GOLDEN_WITH_URL = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//LeetCode Master//Practice reminder//EN',
  'CALSCALE:GREGORIAN',
  'BEGIN:VEVENT',
  'UID:practice-MOWEFR-1800@leetcode-master',
  'DTSTAMP:20261020T000000Z',
  'DTSTART:20261021T180000',
  'DURATION:PT45M',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR',
  'SUMMARY:LeetCode practice',
  'DESCRIPTION:Time for your LeetCode Master practice.\\nOpen the app: https://',
  ' example.github.io/leetcode-master/',
  'URL:https://example.github.io/leetcode-master/',
  'END:VEVENT',
  'END:VCALENDAR',
  ''
].join('\r\n');

const GOLDEN_NO_URL = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//LeetCode Master//Practice reminder//EN',
  'CALSCALE:GREGORIAN',
  'BEGIN:VEVENT',
  'UID:practice-MOWEFR-1800@leetcode-master',
  'DTSTAMP:20261020T000000Z',
  'DTSTART:20261021T180000',
  'DURATION:PT45M',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR',
  'SUMMARY:LeetCode practice',
  'DESCRIPTION:Time for your LeetCode Master practice.',
  'END:VEVENT',
  'END:VCALENDAR',
  ''
].join('\r\n');

describe('buildReminderIcs', () => {
  it('matches the golden file when the app URL is known', () => {
    expect(buildReminderIcs(sample)).toBe(GOLDEN_WITH_URL);
  });

  it('has no link, and no URL property, when the app URL is not known', () => {
    expect(buildReminderIcs({ ...sample, appUrl: null })).toBe(GOLDEN_NO_URL);
    expect(buildReminderIcs({ days: sample.days, time: sample.time, startDate: sample.startDate })).toBe(GOLDEN_NO_URL);
  });

  it('uses CRLF for every line break and ends with one', () => {
    const text = buildReminderIcs(sample);
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('never exceeds 75 octets a line, even with multi-byte text', () => {
    const text = buildReminderIcs({ ...sample, appUrl: 'https://example.com/' + 'é'.repeat(80) + '/' });
    for (const line of text.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it('is deterministic and gives the same UID for the same days and time', () => {
    expect(buildReminderIcs(sample)).toBe(buildReminderIcs({ ...sample, days: ['MO', 'WE', 'FR', 'MO'] }));
    const uid = (text: string) => /UID:(.*)\r\n/.exec(text)?.[1];
    expect(uid(buildReminderIcs({ ...sample, startDate: '2027-01-05', durationMinutes: 60 }))).toBe(uid(buildReminderIcs(sample)));
    expect(uid(buildReminderIcs({ ...sample, time: '07:30' }))).not.toBe(uid(buildReminderIcs(sample)));
    expect(uid(buildReminderIcs({ ...sample, days: ['MO'] }))).not.toBe(uid(buildReminderIcs(sample)));
  });

  it('starts on the start date itself when it is a picked day, otherwise the next picked day', () => {
    expect(buildReminderIcs({ ...sample, startDate: '2026-10-21' })).toContain('DTSTART:20261021T180000');
    expect(buildReminderIcs({ ...sample, startDate: '2026-10-22' })).toContain('DTSTART:20261023T180000');
    // Rolls over a year: Thursday 2026-12-31 -> Friday 2027-01-01, and Saturday 2027-01-02 -> Monday 2027-01-04.
    expect(buildReminderIcs({ ...sample, startDate: '2026-12-31' })).toContain('DTSTART:20270101T180000');
    expect(buildReminderIcs({ ...sample, startDate: '2027-01-02' })).toContain('DTSTART:20270104T180000');
    expect(buildReminderIcs({ ...sample, days: ['SU'], startDate: '2026-10-18' })).toContain('DTSTART:20261018T180000');
  });

  it('puts the time budget in as the duration', () => {
    expect(buildReminderIcs({ ...sample, durationMinutes: 30 })).toContain('DURATION:PT30M');
    expect(buildReminderIcs({ ...sample, durationMinutes: undefined })).toContain('DURATION:PT45M');
  });

  it('rejects input it cannot express', () => {
    expect(() => buildReminderIcs({ ...sample, days: [] })).toThrow(RangeError);
    expect(() => buildReminderIcs({ ...sample, time: '24:00' })).toThrow(RangeError);
    expect(() => buildReminderIcs({ ...sample, time: '' })).toThrow(RangeError);
    expect(() => buildReminderIcs({ ...sample, startDate: '20-10-2026' })).toThrow(RangeError);
    expect(() => buildReminderIcs({ ...sample, durationMinutes: 0 })).toThrow(RangeError);
  });
});

describe('escapeText', () => {
  it('escapes backslashes, semicolons, commas and newlines', () => {
    expect(escapeText('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf');
  });

  it('escapes a URL with commas and semicolons inside the description', () => {
    const text = buildReminderIcs({ ...sample, appUrl: 'https://x.test/a,b;c/' }).replace(/\r\n /g, '');
    expect(text).toContain('DESCRIPTION:Time for your LeetCode Master practice.\\nOpen the app: https://x.test/a\\,b\\;c/');
    expect(text).toContain('URL:https://x.test/a,b;c/');
  });
});

describe('foldLine', () => {
  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short');
    expect(foldLine('x'.repeat(75))).toBe('x'.repeat(75));
  });

  it('folds at 75 octets and unfolding restores the line', () => {
    const line = 'X-LONG:' + 'abcdefghij'.repeat(20);
    const folded = foldLine(line);
    const parts = folded.split('\r\n');
    expect(parts[0]).toHaveLength(75);
    expect(parts.slice(1).every((part) => part.startsWith(' ') && part.length <= 75)).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });

  it('does not split a multi-byte character', () => {
    const line = 'X:' + '€'.repeat(40); // 3 octets each
    const folded = foldLine(line);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
  });
});

describe('defaultReminderDays', () => {
  it('prefills as many days as the weekly goal', () => {
    for (const goal of [1, 2, 3, 4, 5, 6, 7]) expect(defaultReminderDays(goal)).toHaveLength(goal);
    expect(defaultReminderDays(3)).toEqual(['MO', 'WE', 'FR']);
  });

  it('falls back to three days with no goal, and returns a fresh array', () => {
    expect(defaultReminderDays(null)).toEqual(['MO', 'WE', 'FR']);
    defaultReminderDays(null).pop();
    expect(defaultReminderDays(null)).toHaveLength(3);
  });
});

describe('deployedAppUrl', () => {
  it('returns the app folder of a public https page', () => {
    expect(deployedAppUrl('https://owner.github.io/leetcode-master/index.html?x=1#top')).toBe('https://owner.github.io/leetcode-master/');
    expect(deployedAppUrl('https://owner.github.io/leetcode-master/')).toBe('https://owner.github.io/leetcode-master/');
    expect(deployedAppUrl('https://example.com')).toBe('https://example.com/');
  });

  it('is null for a local dev server, a file page, plain http or junk', () => {
    expect(deployedAppUrl('http://localhost:8080/')).toBeNull();
    expect(deployedAppUrl('https://localhost:8080/')).toBeNull();
    expect(deployedAppUrl('https://192.168.1.4/')).toBeNull();
    expect(deployedAppUrl('http://example.com/')).toBeNull();
    expect(deployedAppUrl('file:///home/me/dist/index.html')).toBeNull();
    expect(deployedAppUrl('not a url')).toBeNull();
  });
});

describe('isReminderTime', () => {
  it('accepts HH:MM on a 24-hour clock only', () => {
    expect(isReminderTime('00:00')).toBe(true);
    expect(isReminderTime('23:59')).toBe(true);
    expect(isReminderTime('24:00')).toBe(false);
    expect(isReminderTime('7:30')).toBe(false);
    expect(isReminderTime('')).toBe(false);
  });
});
