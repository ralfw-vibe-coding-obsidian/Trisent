"use strict";

/* Der Ablauf einer Sitzung. Beim Üben merkt man einen Fehler hier kaum:
   Eine Karte, die verschwindet oder zweimal kommt, hält man für den
   eigenen Fehlklick. */

const { test, is, ok, load } = require('./run.js');
const { Session } = load('flashcards/session.js');

const HEUTE = '2026-09-19';

const card = (front, over) =>
  Object.assign({ key: 'fr:' + front + ':NOUN', front: front, back: front + '-de',
                  level: 0, seen: 0, wrong: 0, due: null }, over);

const stapel = () => [card('un'), card('deux'), card('drei')];

/* Ohne Mischen, damit die Reihenfolge prüfbar ist. */
const sitzung = (cards, over) =>
  new Session(cards || stapel(), Object.assign({ shuffle: false }, over));

test('ein leerer Stapel ist sofort fertig', () => {
  const s = sitzung([]);
  ok(s.done, 'fertig');
  is(s.card, null, 'keine Karte');
  is(s.total, 0, 'Umfang');
  is(s.answer('known', HEUTE), null, 'Bewerten tut nichts');
});

test('die Karten kommen der Reihe nach', () => {
  const s = sitzung();
  is(s.total, 3, 'Umfang');
  is(s.card.front, 'un', 'erste');
  s.answer('known', HEUTE);
  is(s.card.front, 'deux', 'zweite');
  s.answer('known', HEUTE);
  is(s.card.front, 'drei', 'dritte');
  s.answer('known', HEUTE);
  ok(s.done, 'fertig');
  is(s.card, null, 'keine Karte mehr');
});

test('der Fortschritt zählt von eins und läuft nicht über', () => {
  const s = sitzung();
  is(s.position, 1, 'am Anfang');
  s.answer('known', HEUTE);
  is(s.position, 2, 'nach der ersten');
  s.answer('unknown', HEUTE);
  is(s.position, 3, 'nach der zweiten');
  s.answer('known', HEUTE);
  is(s.position, 3, 'am Ende nicht 4 von 3');
});

test('bekannt und unbekannt werden getrennt gezählt', () => {
  const s = sitzung();
  s.answer('known', HEUTE);
  s.answer('unknown', HEUTE);
  s.answer('known', HEUTE);
  is(s.known, 2, 'bekannt');
  is(s.unknown, 1, 'unbekannt');
  is(s.settled, 3, 'erledigt');
  is(s.repeats, 0, 'keine Wiederholung');
});

test('die Bewertung liefert den Stand, den die Rechnung ergibt', () => {
  const s = sitzung();
  const ergebnis = s.answer('known', HEUTE);
  is(ergebnis.card.front, 'un', 'welche Karte');
  is(ergebnis.state.level, 1, 'Level steigt');
  is(ergebnis.state.seen, 1, 'einmal gesehen');
  is(ergebnis.state.due, '2026-09-20', 'Wiedervorlage');

  const zweite = s.answer('unknown', HEUTE);
  is(zweite.state.level, 1, 'zurück auf eins');
  is(zweite.state.wrong, 1, 'ein Fehler');
  is(zweite.state.due, '2026-09-20', 'morgen wieder');
});

test('die Bewertung verändert die übergebene Karte nicht', () => {
  const cards = stapel();
  const s = sitzung(cards);
  s.answer('known', HEUTE);
  is(cards[0].level, 0, 'Level unberührt');
  is(cards[0].seen, 0, 'Zähler unberührt');
});

test('nochmal legt die Karte ans Ende, ohne einen Stand zu ändern', () => {
  const s = sitzung();
  is(s.answer('again', HEUTE), null, 'nichts festzuhalten');
  is(s.card.front, 'deux', 'die nächste kommt zuerst');
  is(s.settled, 0, 'nichts erledigt');
  is(s.repeats, 1, 'eine Wiederholung');
  is(s.position, 1, 'der Fortschritt läuft nicht rückwärts');

  s.answer('known', HEUTE);
  s.answer('known', HEUTE);
  is(s.card.front, 'un', 'die zurückgelegte kommt wieder');
  ok(!s.done, 'noch nicht fertig');
});

test('nochmal bei einer einzigen Karte hält die Sitzung offen', () => {
  const s = sitzung([card('seul')]);
  s.answer('again', HEUTE);
  is(s.card.front, 'seul', 'dieselbe Karte');
  ok(!s.done, 'nicht fertig');
  is(s.total, 1, 'der Umfang wächst nicht');
});

test('jede Karte kommt genau einmal, auch nach Wiederholungen', () => {
  const s = sitzung();
  const gesehen = [];
  let schutz = 0;
  while (!s.done && schutz++ < 50) {
    const name = s.card.front;
    /* "un" einmal zurücklegen, dann beantworten. */
    if (name === 'un' && s.repeats === 0) {
      s.answer('again', HEUTE);
      continue;
    }
    gesehen.push(name);
    s.answer('known', HEUTE);
  }
  is(gesehen.sort(), ['deux', 'drei', 'un'], 'alle genau einmal bewertet');
  is(s.settled, 3, 'drei erledigt');
});

test('die Frageseite lässt sich umdrehen', () => {
  const vorne = sitzung();
  is(vorne.question, 'un', 'Frage ist das Wort');
  is(vorne.answerText, 'un-de', 'Antwort ist die Bedeutung');

  const hinten = sitzung(stapel(), { ask: 'back' });
  is(hinten.question, 'un-de', 'Frage ist die Bedeutung');
  is(hinten.answerText, 'un', 'Antwort ist das Wort');
});

test('umgedreht wird immer nur eine Karte', () => {
  const s = sitzung();
  ok(!s.revealed, 'am Anfang zu');
  s.reveal();
  ok(s.revealed, 'aufgedeckt');
  s.answer('known', HEUTE);
  ok(!s.revealed, 'die nächste liegt wieder zu');

  s.reveal();
  s.answer('again', HEUTE);
  ok(!s.revealed, 'auch nach nochmal');
});

test('gemischt wird mit dem hereingereichten Zufall', () => {
  const cards = stapel();
  /* Ein Zufall, der immer 0 liefert, tauscht jede Stelle mit der ersten:
     [un, deux, drei] -> [drei, deux, un] -> [deux, drei, un]. */
  const s = new Session(cards, { random: () => 0 });
  is(s.queue.map((c) => c.front), ['deux', 'drei', 'un'], 'vorhersagbar gemischt');
  is(s.total, 3, 'keine Karte verloren');
});
