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

/* Ob irgendeine Karte einen Satz abfragt, der auf einer früheren schon
   als Zusammenhang dastand. */
function verraten(keys, items) {
  const byKey = new Map(items.map((x) => [x.key, x]));
  const gesehen = new Set();
  for (const key of keys) {
    if (gesehen.has(key)) return true;
    for (const c of byKey.get(key).contextKeys) gesehen.add(c);
  }
  return false;
}

function alle(draw) {
  const keys = [];
  let item;
  while ((item = draw.next())) keys.push(item.key);
  return keys;
}

test('eine kurze Geschichte kommt ganz dran - der Reihe nach', () => {
  const items = p.storyItems('t', saetze(5));
  const keys = alle(new p.Draw(items, { size: 5 }));
  is(keys, ['t#s1', 't#s2', 't#s3', 't#s4', 't#s5'], 'alle fünf, früherer vor späterem');
});

test('nie ein Satz, dessen Lösung eben als Zusammenhang dastand', () => {
  const items = p.storyItems('t', saetze(30));
  for (let seed = 1; seed <= 40; seed++) {
    let x = seed;
    const random = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    const keys = alle(new p.Draw(items, { size: 7, random: random }));
    ok(keys.length >= 7, 'mindestens die gewählte Zahl verfügbar (Lauf ' + seed + ')');
    ok(!verraten(keys.slice(0, 7), items), 'nichts verraten (Lauf ' + seed + ')');
    is(new Set(keys).size, keys.length, 'keiner doppelt (Lauf ' + seed + ')');
  }
});

test('der Vorrat nimmt nur, was noch nirgends Zusammenhang war', () => {
  const items = p.storyItems('t', saetze(6));
  const draw = new p.Draw(items, { size: 1, random: still });
  /* Ohne Mischen ist s1 vorgemerkt; der Vorrat ist s2..s6. */
  is(draw.next().key, 't#s1', 'der vorgemerkte');
  const rest = alle(draw);
  ok(!verraten(['t#s1'].concat(rest), items), 'auch aus dem Vorrat nichts verraten');
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
    { random: still, size: size }), size);

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

/* ------------------------------------------------------------------ */
/* Was eine Geschichte über das Üben verrät                           */
/* ------------------------------------------------------------------ */

test('wie viele Sätze schon vorgelegt wurden, wie viele Versuche es gab', () => {
  const items = p.storyItems('t', saetze(6));
  const record = {
    marks: { s1: '✗✓', s2: '✓✓✓', s3: '★', s9: '✗✗' },
    excluded: new Set(['s4'])
  };
  const st = p.storyStats(items, record);
  is(st.total, 6, 'sechs Sätze');
  is(st.practised, 3, 's1, s2, s3 - s9 gehört nicht zur Geschichte');
  is(st.attempts, 6, '2 + 3 + 1');
  is(st.archived, 2, 's2 sitzt, s4 ist ausgeschlossen');
  is(st.open.map((x) => x.key), ['t#s1', 't#s3', 't#s5', 't#s6'], 'der Rest kann kommen');
});

test('eine Geschichte ohne Versuche', () => {
  const st = p.storyStats(p.storyItems('t', saetze(3)), { marks: {}, excluded: new Set() });
  is([st.practised, st.attempts, st.archived, st.open.length], [0, 0, 0, 3], 'alles offen');
});
