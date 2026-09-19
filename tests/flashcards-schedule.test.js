"use strict";

/* Die Wiedervorlage. Von Hand kaum zu prüfen: Ein Fehler zeigt sich erst
   Wochen später, wenn eine Karte zum falschen Zeitpunkt erscheint - oder
   nie wieder. */

const { test, is, ok, load } = require('./run.js');
const s = load('flashcards/schedule.js');

const HEUTE = '2026-09-19';
const card = (over) => Object.assign({ level: 0, seen: 0, wrong: 0, due: null }, over);

test('Rhythmus ist die vereinbarte Folge', () => {
  is(s.RHYTHM, [1, 1, 2, 3, 5, 8, 13, 21, 34, 9999], 'Rhythmus');
  is(s.MAX_LEVEL, 9, 'höchstes Level');
});

test('Tage rechnen kommt über Monats- und Jahresgrenzen', () => {
  is(s.addDays('2026-09-19', 1), '2026-09-20', 'ein Tag');
  is(s.addDays('2026-09-30', 1), '2026-10-01', 'Monatswechsel');
  is(s.addDays('2026-12-31', 1), '2027-01-01', 'Jahreswechsel');
  is(s.addDays('2028-02-28', 1), '2028-02-29', 'Schaltjahr');
  is(s.addDays('2026-03-28', 2), '2026-03-30', 'über die Zeitumstellung');
  is(s.addDays('2026-09-19', 9999), '2054-02-03', 'nie wieder');
});

test('bekannt: erst der Rhythmus des jetzigen Levels, dann eine Stufe höher', () => {
  const erwartet = [
    [0, 1], [1, 1], [2, 2], [3, 3], [4, 5],
    [5, 8], [6, 13], [7, 21], [8, 34], [9, 9999]
  ];
  for (const [level, tage] of erwartet) {
    const neu = s.rate(card({ level: level, seen: 3 }), 'known', HEUTE);
    is(neu.due, s.addDays(HEUTE, tage), 'Level ' + level + ' -> Wiedervorlage');
    is(neu.level, Math.min(level + 1, 9), 'Level ' + level + ' -> neues Level');
  }
});

test('bekannt auf Level 9 bleibt auf Level 9', () => {
  const neu = s.rate(card({ level: 9, seen: 12 }), 'known', HEUTE);
  is(neu.level, 9, 'Level bleibt stehen');
  ok(neu.due > '2050-01-01', 'Wiedervorlage liegt in weiter Ferne');
});

test('unbekannt: morgen wieder, zurück auf Stufe 1, ein Fehler mehr', () => {
  const neu = s.rate(card({ level: 7, seen: 9, wrong: 2 }), 'unknown', HEUTE);
  is(neu.level, 1, 'Level');
  is(neu.due, '2026-09-20', 'Wiedervorlage');
  is(neu.wrong, 3, 'Fehler');
  is(neu.seen, 10, 'Vorlagen');
});

test('nochmal ändert nichts - auch nicht die Zahl der Vorlagen', () => {
  const vorher = card({ level: 4, seen: 6, wrong: 1, due: '2026-10-01' });
  is(s.rate(vorher, 'again', HEUTE), s.normalize(vorher), 'unverändert');
});

test('jede Bewertung zählt eine Vorlage, nochmal nicht', () => {
  is(s.rate(card({ seen: 5 }), 'known', HEUTE).seen, 6, 'bekannt');
  is(s.rate(card({ seen: 5 }), 'unknown', HEUTE).seen, 6, 'unbekannt');
  is(s.rate(card({ seen: 5 }), 'again', HEUTE).seen, 5, 'nochmal');
});

test('die Bewertung lässt die alte Karte in Ruhe', () => {
  const vorher = card({ level: 2, seen: 1 });
  s.rate(vorher, 'known', HEUTE);
  is(vorher, { level: 2, seen: 1, wrong: 0, due: null }, 'Original');
});

test('Unsinn in der Notiz bringt die Rechnung nicht um', () => {
  is(s.normalize({ level: 99 }).level, 9, 'Level über dem Maximum');
  is(s.normalize({ level: -3 }).level, 0, 'Level unter null');
  is(s.normalize({ level: 'drei' }).level, 0, 'Level als Wort');
  is(s.normalize({ due: 'morgen' }).due, null, 'Datum als Wort');
  is(s.normalize({ seen: 2.7 }).seen, 2, 'Bruchzahl');
  is(s.rate({ level: 'x' }, 'known', HEUTE).due, '2026-09-20', 'rechnet trotzdem');
});

test('fällig ist, was gesehen wurde und dessen Tag gekommen ist', () => {
  ok(!s.isDue(card({ seen: 0 }), HEUTE), 'neue Karte ist nicht fällig');
  ok(s.isDue(card({ seen: 1, due: '2026-09-18' }), HEUTE), 'gestern fällig');
  ok(s.isDue(card({ seen: 1, due: HEUTE }), HEUTE), 'heute fällig');
  ok(!s.isDue(card({ seen: 1, due: '2026-09-20' }), HEUTE), 'morgen noch nicht');
  ok(s.isDue(card({ seen: 1, due: null }), HEUTE), 'ohne Datum sofort');
});

/* --- Die Auswahl für eine Sitzung --------------------------------- */

const neu = (n) => card({ seen: 0, level: 0 });
const faellig = (tag, fehler) => card({ seen: 3, level: 2, due: tag, wrong: fehler || 0 });

test('neue: nur ungesehene, höchstens der Umfang', () => {
  const stapel = [neu(), neu(), neu(), faellig('2026-09-01')];
  is(s.pick(stapel, 'new', 2, HEUTE).length, 2, 'begrenzt auf den Umfang');
  is(s.pick(stapel, 'new', 10, HEUTE).length, 3, 'weniger vorhanden: alle');
});

test('fällige: am längsten überfällige zuerst', () => {
  const a = faellig('2026-09-17'), b = faellig('2026-09-10'), c = faellig('2026-09-18');
  const gewaehlt = s.pick([a, b, c], 'due', 3, HEUTE);
  is(gewaehlt.map((x) => x.due), ['2026-09-10', '2026-09-17', '2026-09-18'], 'Reihenfolge');
});

test('fällige werden mit neuen aufgefüllt, wenn zu wenige da sind', () => {
  const stapel = [faellig('2026-09-18'), neu(), neu(), neu()];
  const gewaehlt = s.pick(stapel, 'due', 3, HEUTE);
  is(gewaehlt.length, 3, 'Umfang erreicht');
  is(gewaehlt[0].due, '2026-09-18', 'die fällige zuerst');
  is(gewaehlt.slice(1).every(s.isNew), true, 'dahinter neue');
});

test('fällige werden nicht aufgefüllt, wenn schon genug da sind', () => {
  const stapel = [faellig('2026-09-18'), faellig('2026-09-17'), neu()];
  const gewaehlt = s.pick(stapel, 'due', 2, HEUTE);
  is(gewaehlt.some(s.isNew), false, 'keine neue dabei');
});

test('eine Karte kommt beim Auffüllen nicht zweimal in den Stapel', () => {
  const stapel = [neu(), neu()];
  const gewaehlt = s.pick(stapel, 'due', 5, HEUTE);
  is(gewaehlt.length, new Set(gewaehlt).size, 'keine Doppelten');
});

test('schwierige: nach Fehlern absteigend, nur mit Fehlern', () => {
  const a = faellig('2026-10-01', 1), b = faellig('2026-10-01', 7), c = faellig('2026-10-01', 3);
  const d = faellig('2026-10-01', 0);
  is(s.pick([a, b, c, d], 'hard', 3, HEUTE).map((x) => x.wrong), [7, 3, 1], 'Reihenfolge');
  is(s.pick([a, b, c, d], 'hard', 10, HEUTE).length, 3, 'fehlerfreie bleiben draußen');
});

test('die Auswahl sortiert den Bestand nicht um', () => {
  const a = faellig('2026-09-17'), b = faellig('2026-09-10');
  const stapel = [a, b];
  s.pick(stapel, 'due', 2, HEUTE);
  is(stapel[0], a, 'Reihenfolge des Bestands');
});

test('Umfang null ergibt einen leeren Stapel', () => {
  is(s.pick([neu(), neu()], 'new', 0, HEUTE), [], 'nichts');
});

test('Mischen behält alle Karten', () => {
  const stapel = [1, 2, 3, 4, 5];
  let n = 0;
  const gemischt = s.shuffle(stapel, () => ((n = (n + 0.37) % 1), n));
  is(gemischt.slice().sort(), [1, 2, 3, 4, 5], 'derselbe Inhalt');
  is(stapel, [1, 2, 3, 4, 5], 'Original unberührt');
});
