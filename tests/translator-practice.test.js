"use strict";

/* Übersetzen üben: was gemerkt wird, wann ein Satz ins Archiv geht,
   welche Sätze eine Sitzung zieht. Ein Fehler hier zeigte sich erst nach
   Wochen - als Satz, der nie wiederkommt, oder als einer, der nie geht. */

const { test, is, ok, load } = require('./run.js');
const p = load('translator/practice.js');

/* ------------------------------------------------------------------ */
/* Die Folge der Versuche                                             */
/* ------------------------------------------------------------------ */

test('Versuche werden als lesbare Zeichen gemerkt', () => {
  is(p.addMark('', 'wrong'), '✗', 'der erste');
  is(p.addMark('✗', 'correct'), '✗✓', 'angehängt');
  is(p.addMark('✗✓', 'exact'), '✗✓★', 'wortgleich');
  is(p.readMarks('✗ ✓x★?'), ['wrong', 'correct', 'exact'], 'Fremdes wird überlesen');
  is(p.readMarks(null), [], 'nichts');
});

test('dreimal hintereinander richtig: ins Archiv', () => {
  ok(p.isArchived('✓✓✓'), 'dreimal richtig');
  ok(p.isArchived('✗✓★✓'), 'auch mit Sternchen, nach einem Fehler');
  ok(!p.isArchived('✓✗✓✓'), 'nur zweimal in einer Reihe');
  ok(!p.isArchived('✓✓'), 'erst zweimal gesehen');
  ok(!p.isArchived('✓✓✓✗'), 'zuletzt gescheitert - wieder offen');
  ok(p.isArchived('', true), 'ausgeschlossen ist archiviert');
});

test('was die Folge sagt', () => {
  const s = p.statsOf('✗✓✗★');
  is(s.seen, 4, 'gesehen');
  is(s.right, 2, 'richtig');
  is(s.wrong, 2, 'falsch');
  ok(!s.settled, 'nicht archiviert');
});

/* ------------------------------------------------------------------ */
/* Die schwierigsten                                                  */
/* ------------------------------------------------------------------ */

test('schwer ist, woran man scheitert - archivierte und fehlerlose nicht', () => {
  is(p.hardness('✓✓'), null, 'nie gescheitert');
  is(p.hardness(''), null, 'nie gesehen');
  is(p.hardness('✗✓✓✓'), null, 'archiviert');
  is(p.hardness('✗', true), null, 'ausgeschlossen');
  ok(p.hardness('✗✓') !== null, 'einmal gescheitert');
});

test('vorn steht der höhere Anteil, bei Gleichstand die öfter verfehlten', () => {
  const list = [
    { name: 'halb-klein', h: p.hardness('✗✓') },
    { name: 'fast-immer', h: p.hardness('✗✗✗✓') },
    { name: 'halb-gross', h: p.hardness('✗✓✗✓✗✓✗✓') },
    { name: 'selten', h: p.hardness('✗✓✓✗✓✓') }
  ];
  list.sort((a, b) => p.compareHardness(a.h, b.h));
  is(list.map((x) => x.name), ['fast-immer', 'halb-gross', 'halb-klein', 'selten'], 'Reihenfolge');
});

/* ------------------------------------------------------------------ */
/* Wortgleich                                                         */
/* ------------------------------------------------------------------ */

test('wortgleich ohne Groß und klein, Akzente und Satzzeichen', () => {
  ok(p.isExact('paul va au cinema', 'Paul va au cinéma.'), 'eingesprochen');
  ok(p.isExact("C'est l'heure !", 'c’est l’heure'), 'Apostroph und Ausrufezeichen');
  ok(!p.isExact('Paul va au théâtre', 'Paul va au cinéma.'), 'anderes Wort');
  ok(!p.isExact('', ''), 'nichts ist nicht wortgleich');
});

test('das Ergebnis eines Versuchs', () => {
  is(p.resultOf(false, 'Paul va au cinéma', 'Paul va au cinéma'), 'wrong', 'die KI sagt falsch');
  is(p.resultOf(true, 'paul va au cinema', 'Paul va au cinéma.'), 'exact', 'richtig und wortgleich');
  is(p.resultOf(true, 'Paul se rend au cinéma', 'Paul va au cinéma.'), 'correct', 'richtig, anders gesagt');
});

/* ------------------------------------------------------------------ */
/* Zusammenhang und Ziehen                                            */
/* ------------------------------------------------------------------ */

const saetze = (n) => Array.from({ length: n }, (_, i) => ({ id: 's' + (i + 1) }));

test('jeder Satz bringt bis zu zwei Vorgänger als Zusammenhang mit', () => {
  const items = p.storyItems('paul', saetze(4));
  is(items[0].contextKeys, [], 'der erste hat keinen');
  is(items[1].contextKeys, ['paul#s1'], 'der zweite einen');
  is(items[3].contextKeys, ['paul#s2', 'paul#s3'], 'danach zwei');
  is(items[3].key, 'paul#s4', 'Schlüssel mit Geschichte');
});

/* Ein Zufall, der die Reihenfolge stehen lässt. */
const still = () => 0.9999;

test('kein Satz zweimal, und keiner, der schon als Zusammenhang dastand', () => {
  const items = p.storyItems('t', saetze(10));
  /* Rückwärts gelegt: s10 zuerst, dann s9 - aber s9 und s8 standen als
     Zusammenhang über s10. */
  const draw = new p.Draw(items.slice().reverse(), { random: still });
  const keys = [];
  let item;
  while ((item = draw.next())) keys.push(item.key);
  is(keys, ['t#s10', 't#s7', 't#s4', 't#s1'], 'Zusammenhang wird übersprungen');
});

test('die schwersten: die ersten gemischt, dahinter die nächstschweren der Reihe nach', () => {
  const items = p.storyItems('t', saetze(20)).filter((x) => x.index % 3 === 0);
  /* s1, s4, s7, s10, s13, s16, s19 - keiner steht im Zusammenhang des
     anderen. */
  const draw = new p.Draw(items, { mode: 'hardest', size: 3, random: () => 0 });
  const first = [draw.next(), draw.next(), draw.next()].map((x) => x.key).sort();
  is(first, ['t#s1', 't#s4', 't#s7'], 'die drei schwersten zuerst');
  is(draw.next().key, 't#s10', 'dann der nächstschwere');
});

/* ------------------------------------------------------------------ */
/* Die Sitzung                                                        */
/* ------------------------------------------------------------------ */

const sitzung = (n, size) =>
  new p.Session(new p.Draw(p.storyItems('t', saetze(n)).filter((x) => x.index % 3 === 0),
    { random: still }), size);

test('eine Sitzung endet nach der gewählten Zahl', () => {
  const s = sitzung(30, 5);
  let schutz = 0;
  while (!s.done && schutz++ < 20) {
    s.record('correct');
    s.next();
  }
  is(s.results.length, 5, 'fünf Versuche');
  ok(s.done, 'fertig');
});

test('ausschließen zählt nicht und zieht den nächsten nach', () => {
  const s = sitzung(30, 5);
  const erst = s.card.key;
  const weg = s.exclude();
  is(weg.key, erst, 'der ausgeschlossene');
  ok(s.card && s.card.key !== erst, 'ein anderer liegt da');
  is(s.position, 1, 'immer noch die erste Karte');
  is(s.excluded, 1, 'gezählt als ausgeschlossen');
});

test('gehen die Sätze aus, endet die Sitzung früher', () => {
  const s = sitzung(4, 7);
  let schutz = 0;
  while (!s.done && schutz++ < 20) {
    s.record('wrong');
    s.next();
  }
  ok(s.results.length < 7, 'weniger als gewählt');
  ok(s.done, 'trotzdem fertig');
  is(s.right, 0, 'nichts richtig');
});
