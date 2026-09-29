"use strict";

/* Tags an Texten und der Filter der Textliste:
   Suchwort UND (Tag ODER Tag). */

const { test, is, ok, load } = require('./run.js');
const t = load('learning/tags.js');

test('ein Tag wird so geschrieben, wie Obsidian ihn kennt', () => {
  is(t.cleanTag('#A1'), 'A1', 'ohne Raute');
  is(t.cleanTag('  Paul et Julie '), 'Paul-et-Julie', 'Leerzeichen werden Bindestriche');
  is(t.cleanTag('alltag,'), 'alltag', 'kein Komma');
  is(t.cleanTag('   '), '', 'nichts bleibt nichts');
});

test('was in tags steht, wird eine saubere Liste - auch von Hand geschrieben', () => {
  is(JSON.stringify(t.tagsOf(['A1', '#alltag', 'a1'])), '["A1","alltag"]', 'Liste, ohne Doppelte');
  is(JSON.stringify(t.tagsOf('a1, alltag')), '["a1","alltag"]', 'Text mit Komma');
  is(JSON.stringify(t.tagsOf(null)), '[]', 'nichts');
  is(JSON.stringify(t.tagsOf(42)), '[]', 'Unsinn');
});

test('an- und abwählen, ohne auf Groß und klein zu achten', () => {
  is(JSON.stringify(t.toggleTag(['A1'], 'alltag')), '["A1","alltag"]', 'dazu');
  is(JSON.stringify(t.toggleTag(['A1', 'alltag'], 'a1')), '["alltag"]', 'weg, auch klein getippt');
  is(JSON.stringify(t.toggleTag(['A1'], '  ')), '["A1"]', 'ein leerer Tag ändert nichts');
});

test('alle Tags einer Sprache: einmal jeder, alphabetisch', () => {
  const all = t.allTags([['alltag', 'A1'], ['a1', 'B2'], null, 'reise']);
  is(JSON.stringify(all), '["A1","alltag","B2","reise"]', 'sortiert, erste Schreibweise gewinnt');
});

const paul = { title: 'Paul et Julie au café', subtitle: 'Paul und Julie im Café', tags: ['A1', 'alltag'] };
const hotel = { title: "À la réception de l'hôtel", subtitle: 'An der Hotelrezeption', tags: ['A2', 'reise'] };
const kino = { title: 'Paul et Julie au cinéma', subtitle: 'Im Kino', tags: ['A2'] };

test('ohne Filter passt alles', () => {
  ok(t.matchesText(paul, {}), 'leerer Filter');
  ok(t.matchesText(hotel, { query: '  ', tags: [] }), 'nur Leerzeichen');
});

test('das Suchwort steckt im Titel oder seiner Übersetzung, ohne Akzente', () => {
  ok(t.matchesText(paul, { query: 'paul' }), 'klein getippt');
  ok(t.matchesText(hotel, { query: 'hotel' }), 'ohne Akzent findet hôtel');
  ok(t.matchesText(kino, { query: 'Kino' }), 'in der Übersetzung');
  ok(!t.matchesText(hotel, { query: 'paul' }), 'passt nicht');
});

test('Tags untereinander mit ODER', () => {
  const filter = { tags: ['a1', 'reise'] };
  ok(t.matchesText(paul, filter), 'trägt A1');
  ok(t.matchesText(hotel, filter), 'trägt reise');
  ok(!t.matchesText(kino, filter), 'trägt keinen von beiden');
});

test('"Paul" UND (#A1 ODER #alltag)', () => {
  const filter = { query: 'Paul', tags: ['A1', 'alltag'] };
  ok(t.matchesText(paul, filter), 'Paul mit A1');
  ok(!t.matchesText(kino, filter), 'Paul, aber ohne die Tags');
  ok(!t.matchesText(hotel, filter), 'weder noch');
});

test('ein Text ohne Tags fällt heraus, sobald Tags gewählt sind', () => {
  ok(!t.matchesText({ title: 'Paul', tags: [] }, { tags: ['A1'] }), 'keine Tags');
  ok(t.matchesText({ title: 'Paul' }, { query: 'paul' }), 'ohne Tag-Filter aber da');
});
