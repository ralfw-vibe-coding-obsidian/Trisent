"use strict";

/* Der Umbau alter Notizen. Eine Migration läuft einmal, über alles, und
   niemand sieht zu - ein Schnitt zu viel ist unwiederbringlich. */

const { test, is, ok, load } = require('./run.js');
const s = load('learning/schema.js');

const GRAMMATIK = 'Weiblich: l\'entrée, une entrée. Bedeutet auch „Eintrittspreis".';

const wortnotiz = (grammatik, eigenes) =>
  '\n## Grammar\n\n' + grammatik + '\n\n## My notes\n' + (eigenes ? '\n' + eigenes + '\n' : '');

/* ------------------------------------------------------------------ */
/* Abschnitte                                                         */
/* ------------------------------------------------------------------ */

test('ein Abschnitt wird samt Inhalt herausgenommen', () => {
  const taken = s.takeSection('\n## Grammar\n\nEins\n\n## My notes\n\nZwei\n', 'Grammar');
  is(taken.content, 'Eins', 'Inhalt');
  ok(taken.rest.indexOf('## Grammar') < 0, 'Überschrift weg');
  ok(taken.rest.indexOf('Zwei') >= 0, 'der Rest bleibt');
});

test('ein Abschnitt, den es nicht gibt, lässt den Text in Ruhe', () => {
  const text = '\n## My notes\n\nEigenes\n';
  const taken = s.takeSection(text, 'Grammar');
  is(taken.content, '', 'nichts gefunden');
  is(taken.rest, text, 'unverändert');
});

test('der letzte Abschnitt geht bis zum Ende', () => {
  const taken = s.takeSection('\n## My notes\n\nEins\nZwei\n', 'My notes');
  is(taken.content, 'Eins\nZwei', 'alles');
});

test('"My notes" entsteht, wenn es fehlt - und nicht doppelt', () => {
  is(s.withMyNotes(''), '## My notes\n', 'aus dem Nichts');
  is(s.withMyNotes('\n\n'), '## My notes\n', 'aus Leerzeilen');
  is(s.withMyNotes('## My notes\n\nDa\n'), '## My notes\n\nDa\n', 'nicht doppelt');
});

/* ------------------------------------------------------------------ */
/* Word notes                                                         */
/* ------------------------------------------------------------------ */

test('die Abschrift aus dem Paket fliegt raus', () => {
  const ergebnis = s.cleanWordNote(wortnotiz(GRAMMATIK), GRAMMATIK);
  ok(ergebnis.removed, 'etwas entfernt');
  ok(!ergebnis.rescued, 'nichts zu retten');
  is(ergebnis.body, '## My notes\n', 'nur noch der eigene Platz');
});

test('was die Person selbst geschrieben hat, bleibt', () => {
  const ergebnis = s.cleanWordNote(wortnotiz(GRAMMATIK, 'Merke: wie „Entree".'), GRAMMATIK);
  ok(ergebnis.body.indexOf('Merke: wie „Entree".') >= 0, 'eigener Text da');
  ok(ergebnis.body.indexOf('Eintrittspreis') < 0, 'Abschrift weg');
});

test('eine geänderte Grammatik wird gerettet, nicht gelöscht', () => {
  const geaendert = GRAMMATIK + ' Und noch mein eigener Zusatz.';
  const ergebnis = s.cleanWordNote(wortnotiz(geaendert), GRAMMATIK);
  ok(ergebnis.rescued, 'gerettet');
  ok(ergebnis.body.indexOf('mein eigener Zusatz') >= 0, 'der Zusatz ist da');
  ok(ergebnis.body.indexOf('## Grammar') < 0, 'aber nicht mehr als Grammatik');
  ok(ergebnis.body.indexOf('## My notes') >= 0, 'sondern unter den eigenen Notizen');
});

test('ein anderer Umbruch allein ist keine Änderung', () => {
  const umbrochen = GRAMMATIK.replace('. Bedeutet', '.\n\nBedeutet');
  const ergebnis = s.cleanWordNote(wortnotiz(umbrochen), GRAMMATIK);
  ok(!ergebnis.rescued, 'nichts zu retten');
  is(ergebnis.body, '## My notes\n', 'sauber weg');
});

test('eine Notiz ohne Grammatik bleibt, wie sie ist', () => {
  const ergebnis = s.cleanWordNote('\n## My notes\n\nEigenes\n', GRAMMATIK);
  ok(!ergebnis.removed, 'nichts entfernt');
  is(ergebnis.body, '## My notes\n\nEigenes\n', 'unverändert');
});

test('eine leere Notiz bekommt wenigstens ihren Platz', () => {
  is(s.cleanWordNote('', '').body, '## My notes\n', 'aus dem Nichts');
  is(s.cleanWordNote(null, null).body, '## My notes\n', 'auch aus gar nichts');
});

test('ohne Angabe aus dem Paket wird die Grammatik gerettet', () => {
  /* Das Wort kommt in keinem Paket mehr vor - dann weiß niemand, ob der
     Text eine Abschrift war. Also aufheben. */
  const ergebnis = s.cleanWordNote(wortnotiz(GRAMMATIK), '');
  ok(ergebnis.rescued, 'im Zweifel behalten');
  ok(ergebnis.body.indexOf('Eintrittspreis') >= 0, 'der Text ist noch da');
});

/* ------------------------------------------------------------------ */
/* Flashcards                                                         */
/* ------------------------------------------------------------------ */

test('der nackte Verweis kommt aus der Karte heraus', () => {
  const ergebnis = s.cleanFlashcard('\n[[après]]\n\n## My notes\n');
  is(ergebnis.target, 'après', 'wohin er zeigen wollte');
  ok(ergebnis.body.indexOf('[[') < 0, 'kein Link mehr im Text');
  is(ergebnis.body, '## My notes\n', 'nur noch der eigene Platz');
});

test('ein Verweis mit Beschriftung wird auch erkannt', () => {
  const ergebnis = s.cleanFlashcard('[[Trisent/learning/FR/dictionary/après|après]]\n');
  is(ergebnis.target, 'Trisent/learning/FR/dictionary/après', 'der Pfad');
});

test('eine Karte ohne Verweis bleibt unangetastet', () => {
  const ergebnis = s.cleanFlashcard('## My notes\n\nMerksatz\n');
  is(ergebnis.target, null, 'nichts gefunden');
  is(ergebnis.body, '## My notes\n\nMerksatz\n', 'unverändert');
});

test('was die Person auf die Karte geschrieben hat, bleibt', () => {
  const ergebnis = s.cleanFlashcard('\n[[après]]\n\n## My notes\n\nVerwechsle ich mit avant.\n');
  ok(ergebnis.body.indexOf('Verwechsle ich mit avant.') >= 0, 'der Merksatz ist da');
});

test('ein Link mitten im Satz ist kein Verweis', () => {
  const text = '## My notes\n\nSiehe [[avant]] zum Vergleich.\n';
  const ergebnis = s.cleanFlashcard(text);
  is(ergebnis.target, null, 'nicht angefasst');
  is(ergebnis.body, text, 'unverändert');
});

/* ------------------------------------------------------------------ */
/* Welche Schritte anstehen                                           */
/* ------------------------------------------------------------------ */

test('eine alte Vault läuft durch alle Schritte', () => {
  is(s.pendingSteps(1, [2, 3, 4]), [2, 3, 4], 'von ganz unten');
});

test('eine halb umgebaute Vault macht dort weiter', () => {
  is(s.pendingSteps(2, [2, 3, 4]), [3, 4], 'die erledigten nicht noch einmal');
  is(s.pendingSteps(3, [2, 3, 4]), [4], 'nur der letzte');
});

test('eine Vault auf dem neuesten Stand tut nichts', () => {
  is(s.pendingSteps(4, [2, 3, 4]), [], 'nichts zu tun');
});

test('eine Vault aus der Zukunft wird in Ruhe gelassen', () => {
  /* Dort war jemand mit einer neueren Fassung unterwegs. Rückwärts
     umzubauen wäre schlimmer als gar nichts. */
  is(s.pendingSteps(9, [2, 3]), [], 'kein Rückbau');
});

test('die Schritte kommen der Reihe nach, wie man sie auch hinschreibt', () => {
  is(s.pendingSteps(1, [4, 2, 3]), [2, 3, 4], 'sortiert');
});

test('Unsinn als Stand zählt als ganz unten', () => {
  is(s.pendingSteps(null, [2]), [2], 'nichts');
  is(s.pendingSteps('zwei', [2]), [2], 'ein Wort');
  is(s.pendingSteps(1, null), [], 'keine Schritte');
});

/* ------------------------------------------------------------------ */
/* Den Kopf einer Notiz lesen                                         */
/* ------------------------------------------------------------------ */

const kopf = [
  '---',
  'type: word',
  'language: fr',
  'lemma: entrée',
  'key: "fr:entrée:NOUN"',
  'forms:',
  '  - entrée',
  '  - entrées',
  'status: familiar',
  '---',
  ''
].join('\n');

test('die einfachen Zeilen werden gelesen', () => {
  const front = s.frontmatterOf(kopf);
  is(front.type, 'word', 'Art');
  is(front.key, 'fr:entrée:NOUN', 'Schlüssel, ohne Anführungszeichen');
  is(front.lemma, 'entrée', 'Grundform');
  is(front.status, 'familiar', 'Lernstand');
});

test('eine Liste über mehrere Zeilen ist bekannt, aber ohne Wert', () => {
  const front = s.frontmatterOf(kopf);
  ok('forms' in front, 'der Name ist da');
  is(front.forms, null, 'der Wert nicht');
  ok(!('entrée' in front), 'die eingerückten Zeilen sind keine Eigenschaften');
});

test('was nicht dasteht, ist undefined - und das heißt "nicht da"', () => {
  const front = s.frontmatterOf(kopf);
  is(front.gloss, undefined, 'keine Bedeutung');
  ok(front.grammar === undefined, 'keine Beschreibung');
});

test('ein Wikilink als Wert bleibt heil', () => {
  const front = s.frontmatterOf('---\nflashcard: "[[Trisent/learning/FR/flashcards/après|après]]"\n---\n');
  is(front.flashcard, '[[Trisent/learning/FR/flashcards/après|après]]', 'ganz');
});

test('ein leerer oder fehlender Kopf ergibt nichts', () => {
  is(Object.keys(s.frontmatterOf('')), [], 'leer');
  is(Object.keys(s.frontmatterOf(null)), [], 'gar nichts');
  is(Object.keys(s.frontmatterOf('---\n---\n')), [], 'nur die Striche');
});

test('Text ohne Doppelpunkt ist keine Eigenschaft', () => {
  const front = s.frontmatterOf('---\ntype: word\nirgendein Satz ohne alles\n---\n');
  is(front.type, 'word', 'das Gute ist da');
  is(Object.keys(front).length, 1, 'und sonst nichts');
});
