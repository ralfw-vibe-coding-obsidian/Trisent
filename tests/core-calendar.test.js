"use strict";

/* Welcher Tag heute ist.

   Der Fehler, um den es hier geht, zeigt sich nur zwischen Mitternacht
   und zwei Uhr nachts, und nur östlich von Greenwich: Die App nahm das
   Datum der Weltzeit, und in Hamburg wechselte der Tag damit erst um 2 Uhr.
   Deshalb legt dieser Test die Zeitzone fest - sonst prüfte er auf einem
   Rechner in UTC gar nichts. */

const previousZone = process.env.TZ;
process.env.TZ = 'Europe/Berlin';

const { test, is, load } = require('./run.js');
const c = load('core/calendar.js');

/* Eine Uhrzeit in Hamburg. Monat wie im Kalender, nicht ab null. */
const hamburg = (y, m, d, hh, mm) => new Date(y, m - 1, d, hh, mm);

test('nach Mitternacht ist schon der neue Tag', () => {
  is(c.today(hamburg(2026, 9, 25, 0, 30)), '2026-09-25', 'halb eins');
  is(c.today(hamburg(2026, 9, 25, 1, 59)), '2026-09-25', 'kurz vor zwei');
});

test('vor Mitternacht ist noch der alte Tag', () => {
  is(c.today(hamburg(2026, 9, 24, 23, 59)), '2026-09-24', 'kurz vor zwölf');
});

test('auch im Winter wechselt der Tag um Mitternacht', () => {
  /* Im Winter liegt Hamburg eine Stunde vor der Weltzeit, nicht zwei. */
  is(c.today(hamburg(2026, 12, 3, 0, 30)), '2026-12-03', 'halb eins im Dezember');
});

test('in der Nacht der Zeitumstellung', () => {
  is(c.today(hamburg(2026, 10, 25, 2, 30)), '2026-10-25', 'Umstellung auf Winterzeit');
  is(c.today(hamburg(2027, 3, 28, 3, 30)), '2027-03-28', 'Umstellung auf Sommerzeit');
});

test('Silvester nach Mitternacht ist schon das neue Jahr', () => {
  is(c.today(hamburg(2027, 1, 1, 0, 15)), '2027-01-01', 'Neujahr');
});

test('ohne Angabe gilt jetzt', () => {
  is(c.today(), c.today(new Date()), 'dasselbe');
});

test('Tage rechnen, auch über die Zeitumstellung', () => {
  is(c.addDays('2026-10-24', 1), '2026-10-25', 'in die Umstellung');
  is(c.addDays('2026-10-25', 1), '2026-10-26', 'aus ihr heraus');
  is(c.addDays('2026-12-31', 1), '2027-01-01', 'Jahreswechsel');
  is(c.addDays('2028-02-28', 1), '2028-02-29', 'Schaltjahr');
});

test('der Tag davor', () => {
  is(c.dayBefore('2026-09-25'), '2026-09-24', 'gestern');
  is(c.dayBefore('2026-03-01'), '2026-02-28', 'über den Monat');
  is(c.dayBefore('2027-01-01'), '2026-12-31', 'über das Jahr');
});

test('Tage zwischen zwei Daten', () => {
  is(c.daysBetween('2026-09-24', '2026-09-25'), 1, 'einer');
  is(c.daysBetween('2026-10-24', '2026-10-26'), 2, 'über die Umstellung zwei, nicht 2,04');
  is(c.daysBetween('2026-09-25', '2026-09-24'), -1, 'rückwärts');
});

/* Der Streak, so wie er rechnet: Ein ausgelassener Tag darf nicht
   verschwinden, nur weil nach Mitternacht gelesen wurde. */
test('wer Dienstag nach Mitternacht liest, hat Montag ausgelassen', () => {
  const sonntagAbend = c.today(hamburg(2026, 9, 20, 21, 0));
  const dienstagNacht = c.today(hamburg(2026, 9, 22, 0, 30));
  is(sonntagAbend, '2026-09-20', 'Sonntag');
  is(dienstagNacht, '2026-09-22', 'Dienstag - nicht Montag');
  is(c.dayBefore(dienstagNacht) === sonntagAbend, false, 'Sonntag war nicht gestern: der Streak reißt');
});

/* ------------------------------------------------------------------ */
/* Zeitpunkte in UTC, gelesen am Ort der Person                       */
/* ------------------------------------------------------------------ */

/* Die Zeitzone für einen einzelnen Test umstellen - so reist der Test. */
function inZone(zone, fn) {
  const before = process.env.TZ;
  process.env.TZ = zone;
  try { return fn(); } finally { process.env.TZ = before; }
}

test('gespeichert wird in UTC', () => {
  is(c.now(hamburg(2026, 9, 24, 23, 3)), '2026-09-24T21:03:00Z', 'Hamburg 23:03 ist 21:03 UTC');
  is(c.now(hamburg(2026, 12, 3, 23, 3)), '2026-12-03T22:03:00Z', 'im Winter eine Stunde');
});

test('gespeichert wird ohne Millisekunden', () => {
  const t = c.now(new Date(Date.UTC(2026, 8, 24, 21, 3, 7, 456)));
  is(t, '2026-09-24T21:03:07Z', 'lesbar');
});

test('derselbe Zeitpunkt ist an jedem Ort der dortige Tag', () => {
  const abends = '2026-09-24T21:03:00Z';   /* in Hamburg 23:03 am 24. */
  is(inZone('Europe/Berlin', () => c.dayOf(abends)), '2026-09-24', 'Hamburg');
  is(inZone('America/New_York', () => c.dayOf(abends)), '2026-09-24', 'New York: 17:03 am 24.');
  is(inZone('Asia/Tokyo', () => c.dayOf(abends)), '2026-09-25', 'Tokio: 06:03 am 25.');
});

test('ein bloßes Datum bleibt, was es ist - so hat die App früher gespeichert', () => {
  is(inZone('Asia/Tokyo', () => c.dayOf('2026-09-24')), '2026-09-24', 'kein Zeitpunkt, keine Verschiebung');
});

test('Unsinn ergibt keinen Tag', () => {
  is(c.dayOf('gestern'), null, 'ein Wort');
  is(c.dayOf(''), null, 'leer');
  is(c.dayOf(null), null, 'nichts');
});

test('ein altes Datum wird zum Mittag dieses Tages', () => {
  is(c.instantOfDay('2026-09-24'), '2026-09-24T10:00:00Z', 'Mittag in Hamburg ist 10 Uhr UTC');
  is(c.dayOf(c.instantOfDay('2026-09-24')), '2026-09-24', 'und ergibt hier wieder denselben Tag');
  is(c.instantOfDay('kein Datum'), null, 'Unsinn bleibt draußen');
});

test('vom Mittag aus verschiebt Reisen den Tag nicht', () => {
  const alt = c.instantOfDay('2026-09-24');
  is(inZone('America/New_York', () => c.dayOf(alt)), '2026-09-24', 'nach Westen');
  is(inZone('Asia/Tokyo', () => c.dayOf(alt)), '2026-09-24', 'nach Osten');
});

test('ein Zeitpunkt ist kein Datum, und ein Datum kein Zeitpunkt', () => {
  is(c.isInstant('2026-09-24T21:03:00Z'), true, 'Zeitpunkt');
  is(c.isInstant('2026-09-24'), false, 'Datum');
  is(c.isInstant('gestern'), false, 'Unsinn');
});

/* Der Streak auf Reisen: Gelernt am Abend in Hamburg, am nächsten Abend
   in New York - das sind aus Sicht der Person zwei Tage hintereinander. */
test('Streak auf Reisen: zwei Abende hintereinander bleiben zwei Tage', () => {
  const hamburgAbend = '2026-09-24T19:00:00Z';                 /* 21:00 in Hamburg */
  const newYorkHeute = inZone('America/New_York', () => c.today(new Date('2026-09-26T00:30:00Z')));
  is(newYorkHeute, '2026-09-25', 'in New York ist der 25.');
  const zuletzt = inZone('America/New_York', () => c.dayOf(hamburgAbend));
  is(zuletzt, '2026-09-24', 'gelernt hat sie dort am 24.');
  is(c.dayBefore(newYorkHeute), zuletzt, 'also gestern: der Streak läuft weiter');
});

/* Die Zeitzone wieder freigeben - alle Tests laufen in einem Prozess, und
   die anderen sollen nicht in Hamburg rechnen, nur weil diese es tun. Die
   Tests hier laufen sofort beim Laden, also ist hier alles erledigt. */
if (previousZone === undefined) delete process.env.TZ;
else process.env.TZ = previousZone;
