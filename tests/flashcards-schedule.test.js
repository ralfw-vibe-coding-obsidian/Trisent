"use strict";

/* Die Wiedervorlage. Von Hand kaum zu prüfen: Ein Fehler zeigt sich erst
   Wochen später, wenn eine Karte zum falschen Zeitpunkt erscheint - oder
   nie wieder. */

const { test, is, ok, load } = require('./run.js');
const s = load('flashcards/schedule.js');

const HEUTE = '2026-09-19';
const card = (over) => Object.assign({ level: 0, seen: 0, wrong: 0, due: null }, over);

test('Rhythmus ist die vereinbarte Folge', () => {
  is(s.DEFAULT_RHYTHM, [1, 1, 2, 3, 5, 8, 13, 21, 34, 9999], 'Rhythmus');
  is(s.rhythm(), [1, 1, 2, 3, 5, 8, 13, 21, 34, 9999], 'ohne Einstellung gilt er');
  is(s.maxLevel(), 9, 'höchstes Level');
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

/* ------------------------------------------------------------------ */
/* Der einstellbare Rhythmus                                          */
/* ------------------------------------------------------------------ */

/* Achtung: configure() wirkt auf das ganze Modul. Jeder Test hier stellt
   am Ende wieder auf die Vorgabe zurück. */

test('eine Eingabe wird gelesen, egal wie sie getrennt ist', () => {
  is(s.parseRhythm('1, 2, 3'), [1, 2, 3], 'Kommas');
  is(s.parseRhythm('1 2 3'), [1, 2, 3], 'Leerzeichen');
  is(s.parseRhythm(' 1,2 ,  3 '), [1, 2, 3], 'krumm getippt');
  is(s.parseRhythm('1;2;3'), [1, 2, 3], 'Semikolons');
});

test('Unsinn wird abgewiesen, nicht zurechtgebogen', () => {
  is(s.parseRhythm(''), null, 'leer');
  is(s.parseRhythm('7'), null, 'eine einzige Stufe');
  is(s.parseRhythm('1, 0, 3'), null, 'null Tage liefe im Kreis');
  is(s.parseRhythm('1, -2'), null, 'negativ');
  is(s.parseRhythm('1, 2.5'), null, 'halbe Tage');
  is(s.parseRhythm('1, zwei'), null, 'Wörter');
  is(s.parseRhythm(null), null, 'nichts');
  is(s.parseRhythm('1, 200000'), null, 'unfassbar lang');
});

test('ein gesetzter Rhythmus gilt für die Rechnung', () => {
  ok(s.configure('2, 4, 8'), 'angenommen');
  is(s.rhythm(), [2, 4, 8], 'gesetzt');
  is(s.maxLevel(), 2, 'drei Stufen, höchste ist 2');

  is(s.rate(card({ level: 0, seen: 1 }), 'known', HEUTE).due,
    s.addDays(HEUTE, 2), 'Stufe 0 nach zwei Tagen');
  is(s.rate(card({ level: 2, seen: 5 }), 'known', HEUTE).due,
    s.addDays(HEUTE, 8), 'Stufe 2 nach acht Tagen');
  is(s.rate(card({ level: 2, seen: 5 }), 'known', HEUTE).level, 2, 'bleibt oben');

  s.configure(s.DEFAULT_RHYTHM);
});

test('eine kürzere Folge holt zu hohe Karten auf die neue Spitze', () => {
  s.configure('1, 2, 3');
  is(s.normalize(card({ level: 8, seen: 20 })).level, 2, 'gekappt');
  s.configure(s.DEFAULT_RHYTHM);
  is(s.normalize(card({ level: 8, seen: 20 })).level, 8, 'und wieder wie vorher');
});

test('ein abgewiesener Rhythmus lässt den alten stehen', () => {
  ok(!s.configure('1'), 'abgewiesen');
  is(s.rhythm(), [1, 1, 2, 3, 5, 8, 13, 21, 34, 9999], 'unverändert');
});

test('configure nimmt auch eine fertige Liste', () => {
  ok(s.configure([3, 6, 9]), 'als Array');
  is(s.rhythm(), [3, 6, 9], 'gesetzt');
  s.configure(s.DEFAULT_RHYTHM);
});

test('die Anzeige einer Folge ist wieder lesbar', () => {
  is(s.formatRhythm([1, 2, 3]), '1, 2, 3', 'formatiert');
  is(s.parseRhythm(s.formatRhythm(s.DEFAULT_RHYTHM)), s.DEFAULT_RHYTHM, 'hin und zurück');
});

/* ------------------------------------------------------------------ */
/* Der Zeitstrahl                                                     */
/* ------------------------------------------------------------------ */

test('der Zeitstrahl hat für jeden Tag einen Platz, auch einen leeren', () => {
  const strahl = s.timeline([], HEUTE, 5);
  is(strahl.days.length, 5, 'fünf Tage');
  is(strahl.days[0].day, HEUTE, 'der erste ist heute');
  is(strahl.days[4].day, '2026-09-23', 'der letzte');
  is(strahl.days.map((d) => d.count), [0, 0, 0, 0, 0], 'alle leer');
  is(strahl.over, 0, 'nichts überfällig');
  is(strahl.later, 0, 'nichts später');
});

test('jede Karte landet auf ihrem Tag', () => {
  const strahl = s.timeline([
    card({ seen: 1, due: HEUTE }),
    card({ seen: 1, due: HEUTE }),
    card({ seen: 3, due: '2026-09-21' })
  ], HEUTE, 5);
  is(strahl.days.map((d) => d.count), [2, 0, 1, 0, 0], 'verteilt');
});

test('Überfälliges kommt vorn zusammen, Fernes hinten', () => {
  const strahl = s.timeline([
    card({ seen: 1, due: '2026-09-18' }),
    card({ seen: 1, due: '2026-01-01' }),
    card({ seen: 1, due: '2026-09-24' }),
    card({ seen: 1, due: '2054-02-03' })
  ], HEUTE, 5);
  is(strahl.over, 2, 'zwei überfällig');
  is(strahl.later, 2, 'zwei jenseits der fünf Tage');
  is(strahl.days.map((d) => d.count), [0, 0, 0, 0, 0], 'dazwischen nichts');
});

test('der letzte Tag gehört noch dazu, der Tag danach nicht mehr', () => {
  const strahl = s.timeline([
    card({ seen: 1, due: '2026-09-23' }),
    card({ seen: 1, due: '2026-09-24' })
  ], HEUTE, 5);
  is(strahl.days[4].count, 1, 'der fünfte Tag zählt');
  is(strahl.later, 1, 'der sechste ist später');
});

test('neue Karten haben keinen Termin und stehen für sich', () => {
  const strahl = s.timeline([
    card({ seen: 0, due: HEUTE }),
    card({ seen: 0, due: null }),
    card({ seen: 2, due: HEUTE })
  ], HEUTE, 5);
  is(strahl.fresh, 2, 'zwei neue');
  is(strahl.days[0].count, 1, 'nur die gesehene steht heute');
  is(strahl.over, 0, 'und keine ist überfällig');
});

test('eine gesehene Karte ohne Datum ist überfällig', () => {
  const strahl = s.timeline([card({ seen: 4, due: null })], HEUTE, 5);
  is(strahl.over, 1, 'überfällig');
});

test('ein unsinniger Umfang ergibt trotzdem einen Strahl', () => {
  is(s.timeline([], HEUTE, 0).days.length, 1, 'mindestens ein Tag');
  is(s.timeline([], HEUTE).days.length, 1, 'ohne Angabe auch');
});

test('die Balkenhöhe wächst, sättigt aber nach oben', () => {
  is(s.barHeight(0), 0, 'nichts ist nichts');
  ok(s.barHeight(1) > 0, 'eine Karte ist sichtbar');

  const zehn = s.barHeight(10);
  const dreissig = s.barHeight(30);
  ok(dreissig - zehn > 0.2, '10 und 30 sind gut zu unterscheiden');

  const hundertfuenfzig = s.barHeight(150);
  const hundertsiebzig = s.barHeight(170);
  ok(hundertsiebzig - hundertfuenfzig < 0.03, '150 und 170 kaum noch');

  ok(hundertsiebzig > dreissig, 'trotzdem höher');
  ok(s.barHeight(1000000) < 1, 'nie über die volle Höhe');
});

test('die Balkenhöhe steigt bei jeder zusätzlichen Karte', () => {
  let vorher = 0;
  for (let n = 1; n <= 200; n++) {
    const jetzt = s.barHeight(n);
    ok(jetzt > vorher, 'bei ' + n + ' Karten höher als bei ' + (n - 1));
    vorher = jetzt;
  }
});

test('bei HALF Karten steht der Balken auf halber Höhe', () => {
  is(s.barHeight(s.BAR_HALF), 0.5, 'genau die Hälfte');
  is(s.barHeight(5, 5), 0.5, 'auch mit eigenem Wert');
});

test('Unsinn ergibt keinen Balken', () => {
  is(s.barHeight(-3), 0, 'negativ');
  is(s.barHeight('zwei'), 0, 'keine Zahl');
  is(s.barHeight(null), 0, 'nichts');
});
