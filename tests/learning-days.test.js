"use strict";

/* Die Lerntage: lesen, schreiben, zählen, Grafik. */

const { test, is, ok, load } = require('./run.js');
const d = load('learning/days.js');

test('Spannen und einzelne Tage werden zu einzelnen Tagen', () => {
  is(d.readDays(['2026-09-20..2026-09-22', '2026-09-27']),
    ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-27'], 'ausgepackt');
  is(d.readDays('2026-09-27, 2026-09-20'), ['2026-09-20', '2026-09-27'], 'auch als Text');
  is(d.readDays(['quatsch', '2026-13-99x', null]), [], 'Unsinn wird überlesen');
  is(d.readDays(['2026-09-22..2026-09-20']), [], 'eine verkehrte Spanne zählt nicht');
});

test('über den Monatswechsel', () => {
  is(d.readDays(['2026-09-29..2026-10-02']), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'], 'September/Oktober');
});

test('geschrieben wird knapp, als Spannen', () => {
  is(d.writeDays(['2026-09-22', '2026-09-20', '2026-09-21', '2026-09-27', '2026-09-27']),
    ['2026-09-20..2026-09-22', '2026-09-27'], 'sortiert, ohne Doppel');
  is(d.writeDays([]), [], 'nichts');
});

test('einen Tag dazunehmen verbindet Spannen', () => {
  is(d.addDay(['2026-09-20..2026-09-22', '2026-09-24'], '2026-09-23'), ['2026-09-20..2026-09-24'], 'Lücke geschlossen');
  is(d.addDay(['2026-09-20'], '2026-09-20'), ['2026-09-20'], 'zweimal am Tag zählt einmal');
});

const tage = (...list) => d.readDays(list);

test('laufender Streak bis heute', () => {
  is(d.statsOf(tage('2026-10-10..2026-10-14'), '2026-10-14'), { current: 5, longest: 5, total: 5 }, 'heute gelernt');
});

test('laufender Streak bis gestern - der Tag ist noch nicht vorbei', () => {
  is(d.statsOf(tage('2026-10-10..2026-10-13'), '2026-10-14').current, 4, 'gilt noch');
});

test('vorgestern zuletzt: der Streak ist vorbei, der längste bleibt', () => {
  is(d.statsOf(tage('2026-10-01..2026-10-07', '2026-10-11..2026-10-12'), '2026-10-14'),
    { current: 0, longest: 7, total: 9 }, 'vorbei');
});

test('nie gelernt', () => {
  is(d.statsOf([], '2026-10-14'), { current: 0, longest: 0, total: 0 }, 'alles null');
});

test('die Grafik: jeder Tag, ob gelernt, und die Summe bis dahin', () => {
  const line = d.timeline(tage('2026-10-10', '2026-10-12..2026-10-13'), '2026-10-10', '2026-10-14');
  is(line.map((x) => x.active), [true, false, true, true, false], 'Punkte');
  is(line.map((x) => x.total), [1, 1, 2, 3, 3], 'kumuliert');
  is(line[4].day, '2026-10-14', 'bis heute');
  is(d.timeline([], null, '2026-10-14'), [], 'ohne Anfang nichts');
});
