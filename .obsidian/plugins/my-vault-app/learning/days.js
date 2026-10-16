"use strict";

/*
 * Die Lerntage einer Sprache - die Regeln, ohne Obsidian.
 *
 * An welchen Tagen die Person mit einer Sprache gearbeitet hat (gelesen,
 * übersetzt, geübt). Daraus: der laufende Streak, der längste bisher, die
 * Tage insgesamt - und die kleine Grafik auf der Startseite.
 *
 * Ein Lerntag ist ein KALENDERTAG der Person (siehe core/calendar.js):
 * ein Datum ohne Uhrzeit, so wie er dort war, wo sie gerade lernte.
 *
 * Gespeichert in language.md unter `days`, knapp und lesbar als
 * Zeitspannen:
 *
 *   days:
 *     - 2026-09-20..2026-09-25
 *     - 2026-09-27
 *
 * Geprüft in tests/learning-days.test.js.
 */

const { addDays, daysBetween } = require('../core/calendar.js');

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/* Was in `days` steht -> sortierte Liste einzelner Tage, ohne Doppel.
   Verträgt einzelne Tage, Spannen "a..b", einen Text statt einer Liste
   und alles, was von Hand verunglückt ist (wird überlesen). */
function readDays(value) {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\s]+/) : [];
  const out = new Set();
  for (const raw of items) {
    const text = String(raw || '').trim();
    const span = text.split('..');
    if (span.length === 2 && DAY.test(span[0]) && DAY.test(span[1]) && span[0] <= span[1]) {
      /* Eine Spanne über Jahre würde man nicht von Hand schreiben -
         gedeckelt, damit ein Tippfehler die App nicht lahmlegt. */
      let day = span[0];
      for (let n = 0; day <= span[1] && n < 4000; n++) {
        out.add(day);
        day = addDays(day, 1);
      }
    } else if (DAY.test(text)) {
      out.add(text);
    }
  }
  return [...out].sort();
}

/* Sortierte Tage -> knappe Liste mit Spannen. */
function writeDays(days) {
  const sorted = [...new Set(days || [])].filter((day) => DAY.test(day)).sort();
  const out = [];
  let start = null;
  let last = null;
  for (const day of sorted) {
    if (last && addDays(last, 1) === day) {
      last = day;
      continue;
    }
    if (start) out.push(start === last ? start : start + '..' + last);
    start = day;
    last = day;
  }
  if (start) out.push(start === last ? start : start + '..' + last);
  return out;
}

/* Einen Tag dazunehmen. */
function addDay(value, day) {
  return writeDays(readDays(value).concat([day]));
}

/* Die Zahlen: laufender Streak, längster, Tage insgesamt.

   Der laufende Streak zählt bis heute - oder bis gestern: Der heutige Tag
   ist ja noch nicht vorbei. Endete die Serie vorgestern, ist sie vorbei. */
function statsOf(days, today) {
  const sorted = [...new Set(days || [])].sort();
  let longest = 0;
  let run = 0;
  let previous = null;
  for (const day of sorted) {
    run = previous && addDays(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }

  let current = 0;
  if (previous && (previous === today || addDays(previous, 1) === today)) current = run;
  return { current: current, longest: longest, total: sorted.length };
}

/* Für die Grafik: jeder Tag von first bis today, ob gelernt, und wie
   viele Lerntage es bis dahin insgesamt waren. */
function timeline(days, first, today) {
  const set = new Set(days || []);
  if (!first || !today || first > today) return [];
  const span = daysBetween(first, today);
  const out = [];
  let total = 0;
  for (let n = 0; n <= span; n++) {
    const day = addDays(first, n);
    const active = set.has(day);
    if (active) total += 1;
    out.push({ day: day, active: active, total: total });
  }
  return out;
}

module.exports = { readDays, writeDays, addDay, statsOf, timeline };
