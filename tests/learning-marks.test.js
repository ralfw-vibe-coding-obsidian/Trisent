"use strict";

/* Der Index: aufnehmen, zählen, archivieren, löschen, sortieren. */

const { test, is, ok, load } = require('./run.js');
const m = load('learning/marks.js');

const T1 = '2026-10-09T10:00:00Z';
const T2 = '2026-10-10T08:30:00Z';

test('ein Wort ohne Index-Eigenschaften steht nicht im Index', () => {
  is(m.markOf({ key: 'fr:aller:VERB', status: 'learning' }), null, 'nichts');
  is(m.markOf({ indexCount: 0 }), null, 'Zähler null');
  is(m.markOf(null), null, 'kein Kopf');
});

test('aufnehmen: zählt, merkt Herkunft und Zeit', () => {
  const fm = { key: 'fr:foudroyant:ADJ' };
  m.addMark(fm, 'reader', T1);
  const mark = m.markOf(fm);
  is(mark.count, 1, 'einmal');
  is(mark.from, ['reader'], 'aus dem Reader');
  is(mark.first, T1, 'erstes Mal');
  is(mark.last, T1, 'letztes Mal');
  ok(!mark.archived, 'nicht archiviert');
});

test('erneut aufnehmen: einmal im Index, aber mit Zähler und beiden Herkünften', () => {
  const fm = {};
  m.addMark(fm, 'reader', T1);
  m.addMark(fm, 'translator', T2);
  m.addMark(fm, 'translator', T2);
  const mark = m.markOf(fm);
  is(mark.count, 3, 'dreimal');
  is(mark.from, ['reader', 'translator'], 'beide, in fester Reihenfolge, ohne Doppel');
  is(mark.first, T1, 'das erste Mal bleibt');
  is(mark.last, T2, 'das letzte Mal wandert');
});

test('archivieren behält alles; erneut aufnehmen holt es zurück', () => {
  const fm = {};
  m.addMark(fm, 'reader', T1);
  m.archiveMark(fm);
  ok(m.markOf(fm).archived, 'archiviert');
  is(m.markOf(fm).count, 1, 'Zähler bleibt');
  m.addMark(fm, 'reader', T2);
  ok(!m.markOf(fm).archived, 'wieder da');
  is(m.markOf(fm).count, 2, 'und gezählt');
});

test('wiederherstellen ohne aufzunehmen', () => {
  const fm = {};
  m.addMark(fm, 'reader', T1);
  m.archiveMark(fm);
  m.restoreMark(fm);
  ok(!m.markOf(fm).archived, 'zurück');
  is(m.markOf(fm).count, 1, 'nicht hochgezählt');
});

test('löschen nimmt es ohne Spur heraus, der Rest der Notiz bleibt', () => {
  const fm = { key: 'fr:x:NOUN', status: 'learning' };
  m.addMark(fm, 'translator', T1);
  m.archiveMark(fm);
  m.clearMark(fm);
  is(m.markOf(fm), null, 'nicht mehr im Index');
  is(Object.keys(fm).sort(), ['key', 'status'], 'nur das Übrige bleibt');
});

test('ein Wort, das nicht im Index steht, lässt sich nicht archivieren', () => {
  const fm = {};
  m.archiveMark(fm);
  is(fm.indexArchived, undefined, 'nichts gesetzt');
});

test('Herkunft von Hand verunglückt: wird bereinigt gelesen', () => {
  const mark = m.markOf({ indexCount: '2', indexFrom: 'translator' });
  is(mark.count, 2, 'Zahl als Text');
  is(mark.from, ['translator'], 'ein einzelner Wert');
  is(m.markOf({ indexCount: 1, indexFrom: ['reader', 'kino'] }).from, ['reader'], 'Unbekanntes fällt weg');
});

/* ------------------------------------------------------------------ */
/* Wie oft ein Wort vorkommt                                          */
/* ------------------------------------------------------------------ */

const satz = (...keys) => ({ units: keys.map((key) => ({ key: key })) });

test('Sätze und Texte zählen - ein Satz zählt einmal', () => {
  const texts = [
    { id: 'a', data: { paragraphs: [{ sentences: [satz('etre', 'paul'), satz('etre', 'etre'), satz('rare')] }] } },
    { id: 'b', data: { paragraphs: [{ sentences: [satz('etre')] }, { sentences: [satz('paul')] }] } }
  ];
  const f = m.frequencies(texts);
  is(f.get('etre'), { sentences: 3, texts: 2 }, 'être');
  is(f.get('rare'), { sentences: 1, texts: 1 }, 'selten');
  is(f.get('paul'), { sentences: 2, texts: 2 }, 'Paul');
  is(f.get('nirgends'), undefined, 'kommt nicht vor');
});

test('Wendungen zählen mit', () => {
  const texts = [{ id: 'a', data: { paragraphs: [{ sentences: [{ units: [], phrases: [{ key: 'il-y-a' }] }] }] } }];
  is(m.frequencies(texts).get('il-y-a'), { sentences: 1, texts: 1 }, 'Wendung');
});

/* ------------------------------------------------------------------ */
/* Reihenfolgen                                                       */
/* ------------------------------------------------------------------ */

const item = (lemma, count, last, sentences, texts) =>
  ({ lemma: lemma, mark: { count: count, last: last }, freq: { sentences: sentences, texts: texts } });

const liste = () => [
  item('bateau', 1, '2026-10-01T00:00:00Z', 17, 1),
  item('aller', 7, '2026-10-05T00:00:00Z', 40, 12),
  item('chat', 2, '2026-10-09T00:00:00Z', 17, 5),
  item('dire', 7, '2026-10-08T00:00:00Z', 3, 3)
];
const sortiert = (mode) => liste().sort(m.compareItems(mode)).map((x) => x.lemma);

test('zuletzt aufgenommen zuerst', () => {
  is(sortiert('recent'), ['chat', 'dire', 'aller', 'bateau'], 'neueste oben');
});

test('alphabetisch', () => {
  is(sortiert('alphabetical'), ['aller', 'bateau', 'chat', 'dire'], 'A–Z');
});

test('am häufigsten aufgenommen, bei Gleichstand das jüngere', () => {
  is(sortiert('stumbled'), ['dire', 'aller', 'chat', 'bateau'], 'Zähler, dann zuletzt');
});

test('am häufigsten in Sätzen, bei Gleichstand in mehr Texten', () => {
  is(sortiert('frequent'), ['aller', 'chat', 'bateau', 'dire'], '17 Sätze in 5 Texten vor 17 in einem');
});
