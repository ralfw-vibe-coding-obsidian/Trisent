"use strict";

/*
 * Welcher Tag heute ist - und wie man mit Tagen rechnet.
 *
 * GEMEINSAM, weil beide Seiten es brauchen: der Streak, die Wiedervorlage
 * der Lernkartei, die Daten in den Notizen - und die Werkstatt. Bisher hat
 * jede Stelle "heute" selbst ausgerechnet, und alle auf dieselbe falsche
 * Art:
 *
 *   new Date().toISOString().slice(0, 10)
 *
 * Das ist das Datum der Weltzeit (UTC), nicht das der Person. In Hamburg
 * wechselte der Tag damit im Sommer erst um 2 Uhr nachts, im Winter um 1
 * Uhr. Wer nach Mitternacht noch las, wurde für den Vortag gezählt - und
 * ein ausgelassener Tag ließ sich so überbrücken, ohne dass der Streak
 * abriss. Die Lernkartei machte eine Karte ebenfalls erst um 2 Uhr fällig.
 *
 * Ein Tag ist hier immer der Kalendertag der Person, dort wo sie gerade
 * ist. Gerechnet wird dann nur noch mit dem Datum selbst, mittags in
 * Weltzeit - an einem Datum ohne Uhrzeit kann keine Zeitumstellung etwas
 * verschieben.
 *
 * ZWEI ARTEN VON DATEN - und die Regel für beide:
 *
 * - Ein ZEITPUNKT sagt, wann etwas geschah: zuletzt gelernt, eine Notiz
 *   geändert, eine Karte angelegt. Er wird in UTC gespeichert
 *   (2026-09-24T21:03:00Z) und erst beim Lesen in den Tag übersetzt, der
 *   er DORT ist, wo die Person gerade ist. Die Person reist; ein
 *   gespeicherter Ortstag hinge an dem Ort, an dem er geschrieben wurde.
 *
 * - Ein KALENDERTAG sagt, an welchem Tag etwas ansteht: die Wiedervorlage
 *   einer Karteikarte. Er bleibt ein Datum ohne Uhrzeit (2026-09-25) und
 *   gilt an jedem Ort an genau diesem Tag. Als UTC-Zeitpunkt würde eine in
 *   Hamburg angelegte Karte in New York schon am Vorabend fällig.
 *
 * Ohne Obsidian, damit es geprüft werden kann - siehe
 * tests/core-calendar.test.js.
 */

function pad(number) {
  return String(number).padStart(2, '0');
}

/* Der heutige Kalendertag der Person, als JJJJ-MM-TT. `now` lässt sich
   hereinreichen, damit ein Test eine Uhrzeit festhalten kann. */
function today(now) {
  const date = now instanceof Date ? now : new Date();
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

/* Tage auf ein Datum rechnen. Mittags in Weltzeit - so kann weder eine
   Zeitzone noch die Sommerzeit den Tag verschieben. */
function addDays(day, days) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayBefore(day) {
  return addDays(day, -1);
}

function daysBetween(from, to) {
  const a = Date.parse(from + 'T12:00:00Z');
  const b = Date.parse(to + 'T12:00:00Z');
  return Math.round((b - a) / 86400000);
}

/* Jetzt, als Zeitpunkt in UTC - so wird gespeichert. Ohne Millisekunden:
   Eine Notiz soll lesbar bleiben, und so genau will es niemand wissen. */
function now(date) {
  const at = date instanceof Date ? date : new Date();
  return at.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/* Der Kalendertag, der ein gespeicherter Wert HIER ist.

   - Ein Zeitpunkt (2026-09-24T21:03:00Z) wird in den Tag der Zeitzone
     übersetzt, in der die App gerade läuft. Derselbe Zeitpunkt ist in
     Hamburg der 24., in Tokio schon der 25.
   - Ein bloßes Datum (2026-09-24) ist bereits ein Tag und bleibt es. So
     hat die App früher gespeichert; es wird weiter verstanden.
   - Alles andere ergibt null. */
function dayOf(value) {
  if (typeof value !== 'string' || !value) return null;
  if (DAY.test(value)) return value;
  const at = new Date(value);
  return isNaN(at.getTime()) ? null : today(at);
}

/* Ein altes, bloßes Datum in einen Zeitpunkt verwandeln - für den Umbau
   vorhandener Notizen. Welche Uhrzeit es war, weiß niemand mehr; genommen
   wird der Mittag dieses Tages hier. Mittag ist die Mitte: Ganz gleich, in
   welche Richtung die Person später reist, der Tag bleibt derselbe, solange
   sie nicht mehr als zwölf Stunden Zeitunterschied überquert. */
function instantOfDay(day) {
  if (typeof day !== 'string' || !DAY.test(day)) return null;
  const [y, m, d] = day.split('-').map(Number);
  return now(new Date(y, m - 1, d, 12, 0, 0));
}

/* Ist ein gespeicherter Wert schon ein Zeitpunkt? */
function isInstant(value) {
  return typeof value === 'string' && !DAY.test(value) && !isNaN(new Date(value).getTime());
}

module.exports = {
  today, addDays, dayBefore, daysBetween, now, dayOf, instantOfDay, isInstant
};
