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

module.exports = { today, addDays, dayBefore, daysBetween };
