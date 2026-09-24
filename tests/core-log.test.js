"use strict";

/*
 * Das Logbuch.
 *
 * Es wird von mehreren Teilen der App beschrieben und von niemandem
 * gepflegt. Was hier schiefgeht - ein verrutschter Tag, ein Kürzen, das
 * die falschen Einträge trifft -, sieht man erst Monate später.
 */

const { test, is, ok, report, load } = require('./run.js');
const { addEntry } = load('core/log.js');

const at = (day, time) => new Date(day + 'T' + time + ':00');
const entries = (text) => text.split('\n').filter((one) => /^- \d{2}:\d{2} · /.test(one));
const days = (text) => text.split('\n').filter((one) => /^## \d{4}/.test(one));

test('ein leeres Logbuch bekommt Kopf, Tag und Eintrag', () => {
  const text = addEntry('', at('2026-09-24', '09:12'), 'Packager', 'Moved the rules.');
  ok(text.startsWith('---\ntype: trisent-log\n---'), 'der Kopf');
  is(days(text), ['## 2026-09-24'], 'ein Tag');
  is(entries(text), ['- 09:12 · Packager · Moved the rules.'], 'ein Eintrag');
});

test('das Neueste steht oben, innerhalb des Tages auch', () => {
  let text = addEntry('', at('2026-09-24', '09:12'), 'Packager', 'first');
  text = addEntry(text, at('2026-09-24', '09:40'), 'Learning', 'second');
  is(entries(text), ['- 09:40 · Learning · second', '- 09:12 · Packager · first'], 'neu oben');
  is(days(text).length, 1, 'derselbe Tag bleibt ein Tag');
});

test('ein neuer Tag kommt ganz nach oben', () => {
  let text = addEntry('', at('2026-09-23', '21:40'), 'Packager', 'yesterday');
  text = addEntry(text, at('2026-09-24', '08:00'), 'Packager', 'today');
  is(days(text), ['## 2026-09-24', '## 2026-09-23'], 'heute über gestern');
});

test('gekürzt wird von hinten, und ein leerer Tag verschwindet ganz', () => {
  let text = addEntry('', at('2026-09-22', '10:00'), 'Packager', 'old');
  text = addEntry(text, at('2026-09-23', '10:00'), 'Packager', 'middle');
  text = addEntry(text, at('2026-09-24', '10:00'), 'Packager', 'new', 2);

  is(entries(text).map((one) => one.split(' · ')[2]), ['new', 'middle'], 'der älteste fiel weg');
  is(days(text), ['## 2026-09-24', '## 2026-09-23'], 'sein Tag auch');
});

test('eine Meldung über mehrere Zeilen wird eine Zeile', () => {
  const text = addEntry('', at('2026-09-24', '09:12'), 'Packager', 'two\n  lines');
  is(entries(text), ['- 09:12 · Packager · two lines'], 'zusammengezogen');
});

test('was die Person dazugeschrieben hat, bleibt stehen', () => {
  let text = addEntry('', at('2026-09-24', '09:12'), 'Packager', 'first');
  text = text.replace('- 09:12 · Packager · first', '- 09:12 · Packager · first\n  Hier muss ich nachsehen.');
  text = addEntry(text, at('2026-09-24', '10:00'), 'Packager', 'second');
  ok(text.indexOf('Hier muss ich nachsehen.') > 0, 'ihre Notiz ist noch da');
});

test('Zeiten mit führender Null', () => {
  const text = addEntry('', at('2026-01-05', '07:03'), 'Reading', 'x');
  is(days(text), ['## 2026-01-05'], 'Datum');
  is(entries(text), ['- 07:03 · Reading · x'], 'Uhrzeit');
});

if (require.main === module) report();
