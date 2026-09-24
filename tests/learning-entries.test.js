"use strict";

/* Der Abgleich zweier Wörterbuchfassungen.

   Die heikelste Rechnung der App: Geht sie falsch, überschreibt ein
   Import leise eine gute Erklärung durch eine schlechtere. Niemand
   bemerkt es - die Person hält das Dürftige für den Stand der Dinge. */

const { test, is, ok, load } = require('./run.js');
const e = load('learning/entries.js');

const eintrag = (gloss, schema, over) =>
  Object.assign({
    lemma: 'chambre', partOfSpeech: 'NOUN', gloss: gloss,
    forms: ['chambre'], grammar: 'Weiblich.', entrySchema: schema
  }, over);

const sammlung = (paare) => new Map(paare);

/* ------------------------------------------------------------------ */
/* Die Nummer am Eintrag                                              */
/* ------------------------------------------------------------------ */

test('die Nummer wird gelesen, wie sie dasteht', () => {
  is(e.schemaOf({ entrySchema: 3 }), 3, 'eine Zahl');
  is(e.schemaOf({ entrySchema: '3' }), 3, 'als Text geschrieben');
});

test('fehlt die Nummer, gilt null', () => {
  is(e.schemaOf({}), 0, 'gar nicht da');
  is(e.schemaOf(null), 0, 'gar kein Eintrag');
  is(e.schemaOf({ entrySchema: null }), 0, 'leer');
});

test('Unsinn als Nummer zählt als null, nicht als unendlich', () => {
  /* Die ungefährliche Richtung: Unsinn friert nichts ein. */
  is(e.schemaOf({ entrySchema: -5 }), 0, 'negativ');
  is(e.schemaOf({ entrySchema: 'drei' }), 0, 'ein Wort');
  is(e.schemaOf({ entrySchema: Infinity }), 0, 'unendlich');
  is(e.schemaOf({ entrySchema: 2.7 }), 2, 'abgeschnitten');
});

/* ------------------------------------------------------------------ */
/* Einträge in Form bringen                                           */
/* ------------------------------------------------------------------ */

test('ein Eintrag wird auf verlässliche Felder gebracht', () => {
  const entry = e.normalizeEntry(eintrag('Zimmer', 3), 'fr:chambre:NOUN');
  is(entry.lemma, 'chambre', 'Grundform');
  is(entry.partOfSpeech, 'NOUN', 'Wortart');
  is(entry.gloss, 'Zimmer', 'Bedeutung');
  is(entry.forms, ['chambre'], 'Formen');
  is(entry.entrySchema, 3, 'Nummer');
});

test('fehlt die Grundform, steht sie im Schlüssel', () => {
  const entry = e.normalizeEntry({ gloss: 'Zimmer' }, 'fr:chambre:NOUN');
  is(entry.lemma, 'chambre', 'aus dem Schlüssel');
  is(entry.partOfSpeech, 'NOUN', 'auch die Wortart');
});

test('es wird nichts erfunden, nur weggelassen', () => {
  const entry = e.normalizeEntry({ lemma: 'ne', forms: 'keine Liste' }, 'fr:ne:PART');
  is(entry.gloss, '', 'keine Bedeutung');
  is(entry.grammar, '', 'keine Beschreibung');
  is(entry.forms, [], 'keine Formen statt Unsinn');
});

test('was kein Eintrag ist, wird keiner', () => {
  is(e.normalizeEntry(null, 'fr:x:NOUN'), null, 'nichts');
  is(e.normalizeEntry('Zimmer', 'fr:x:NOUN'), null, 'bloßer Text');
});

test('ein ganzes Wörterbuch auf einmal', () => {
  const all = e.normalizeAll({
    'fr:chambre:NOUN': eintrag('Zimmer', 2),
    'fr:kaputt:NOUN': 'kein Eintrag'
  });
  is(all.size, 1, 'nur das Brauchbare');
  ok(all.has('fr:chambre:NOUN'), 'das Gute ist da');
  is(e.normalizeAll(null).size, 0, 'gar nichts ist auch etwas');
});

/* ------------------------------------------------------------------ */
/* Die Abgleichregel                                                  */
/* ------------------------------------------------------------------ */

test('ein unbekanntes Wort wird aufgenommen', () => {
  const ergebnis = e.mergeEntries(
    sammlung([]),
    sammlung([['fr:chambre:NOUN', eintrag('Zimmer', 1)]])
  );
  is(ergebnis.entries.size, 1, 'drin');
  is(ergebnis.report, { added: 1, replaced: 0, kept: 0 }, 'gezählt');
});

test('eine höhere Nummer gewinnt', () => {
  const ergebnis = e.mergeEntries(
    sammlung([['fr:chambre:NOUN', eintrag('Zimmer', 1)]]),
    sammlung([['fr:chambre:NOUN', eintrag('das Zimmer, der Raum', 3)]])
  );
  is(ergebnis.entries.get('fr:chambre:NOUN').gloss, 'das Zimmer, der Raum', 'die neue');
  is(ergebnis.report, { added: 0, replaced: 1, kept: 0 }, 'ersetzt');
});

test('eine niedrigere Nummer verliert', () => {
  const ergebnis = e.mergeEntries(
    sammlung([['fr:chambre:NOUN', eintrag('das Zimmer, der Raum', 3)]]),
    sammlung([['fr:chambre:NOUN', eintrag('Zimmer', 1)]])
  );
  is(ergebnis.entries.get('fr:chambre:NOUN').gloss, 'das Zimmer, der Raum', 'die alte bleibt');
  is(ergebnis.report, { added: 0, replaced: 0, kept: 1 }, 'liegen gelassen');
});

test('bei gleicher Nummer bleibt das Vorhandene', () => {
  const ergebnis = e.mergeEntries(
    sammlung([['fr:chambre:NOUN', eintrag('erste Fassung', 2)]]),
    sammlung([['fr:chambre:NOUN', eintrag('zweite Fassung', 2)]])
  );
  is(ergebnis.entries.get('fr:chambre:NOUN').gloss, 'erste Fassung', 'unverändert');
  is(ergebnis.report.kept, 1, 'liegen gelassen');
});

test('ein Eintrag ohne Nummer löst nichts ab', () => {
  const ergebnis = e.mergeEntries(
    sammlung([['fr:chambre:NOUN', eintrag('gut', 2)]]),
    sammlung([['fr:chambre:NOUN', e.normalizeEntry({ lemma: 'chambre', gloss: 'dürftig' }, 'fr:chambre:NOUN')]])
  );
  is(ergebnis.entries.get('fr:chambre:NOUN').gloss, 'gut', 'die gute bleibt stehen');
});

test('ein Eintrag ohne Nummer wird aufgenommen, wenn er der erste ist', () => {
  const ergebnis = e.mergeEntries(
    sammlung([]),
    sammlung([['fr:ne:PART', e.normalizeEntry({ lemma: 'ne' }, 'fr:ne:PART')]])
  );
  is(ergebnis.entries.size, 1, 'besser als nichts');
});

test('es wird als Ganzes ersetzt, nicht Feld für Feld', () => {
  const alt = eintrag('Zimmer', 1, { grammar: 'Eine alte Erklärung.', forms: ['chambre', 'chambres'] });
  const neu = eintrag('Raum', 2, { grammar: '', forms: [] });

  const ergebnis = e.mergeEntries(
    sammlung([['fr:chambre:NOUN', alt]]),
    sammlung([['fr:chambre:NOUN', neu]])
  );
  const drin = ergebnis.entries.get('fr:chambre:NOUN');
  is(drin.grammar, '', 'auch das Leere kommt mit');
  is(drin.forms, [], 'keine Reste der alten Fassung');
});

test('der Bestand wird nicht verändert', () => {
  const bestand = sammlung([['fr:chambre:NOUN', eintrag('alt', 1)]]);
  e.mergeEntries(bestand, sammlung([
    ['fr:chambre:NOUN', eintrag('neu', 5)],
    ['fr:porte:NOUN', eintrag('Tür', 1)]
  ]));
  is(bestand.size, 1, 'nichts dazugekommen');
  is(bestand.get('fr:chambre:NOUN').gloss, 'alt', 'nichts ersetzt');
});

test('viele Wörter auf einmal, jedes nach seiner eigenen Nummer', () => {
  const ergebnis = e.mergeEntries(
    sammlung([
      ['fr:a:NOUN', eintrag('alt a', 2)],
      ['fr:b:NOUN', eintrag('alt b', 2)]
    ]),
    sammlung([
      ['fr:a:NOUN', eintrag('neu a', 3)],
      ['fr:b:NOUN', eintrag('neu b', 1)],
      ['fr:c:NOUN', eintrag('neu c', 1)]
    ])
  );
  is(ergebnis.entries.get('fr:a:NOUN').gloss, 'neu a', 'höher: ersetzt');
  is(ergebnis.entries.get('fr:b:NOUN').gloss, 'alt b', 'niedriger: bleibt');
  is(ergebnis.entries.get('fr:c:NOUN').gloss, 'neu c', 'unbekannt: dazu');
  is(ergebnis.report, { added: 1, replaced: 1, kept: 1 }, 'alles gezählt');
});

test('nichts abzugleichen ändert nichts', () => {
  const bestand = sammlung([['fr:a:NOUN', eintrag('a', 1)]]);
  const ergebnis = e.mergeEntries(bestand, sammlung([]));
  is(ergebnis.entries.size, 1, 'unverändert');
  is(ergebnis.report, { added: 0, replaced: 0, kept: 0 }, 'nichts geschehen');
});

/* ------------------------------------------------------------------ */
/* Schreiben                                                          */
/* ------------------------------------------------------------------ */

test('geschrieben wird nach Schlüssel sortiert', () => {
  const out = e.toObject(sammlung([
    ['fr:porte:NOUN', eintrag('Tür', 1)],
    ['fr:chambre:NOUN', eintrag('Zimmer', 1)]
  ]));
  is(Object.keys(out), ['fr:chambre:NOUN', 'fr:porte:NOUN'], 'sortiert');
});

test('derselbe Bestand ergibt immer dieselbe Datei', () => {
  const a = e.toObject(sammlung([['fr:b:NOUN', eintrag('b', 1)], ['fr:a:NOUN', eintrag('a', 1)]]));
  const b = e.toObject(sammlung([['fr:a:NOUN', eintrag('a', 1)], ['fr:b:NOUN', eintrag('b', 1)]]));
  is(JSON.stringify(a), JSON.stringify(b), 'Zeichen für Zeichen gleich');
});

/* ------------------------------------------------------------------ */
/* Der Sonderfall beim Umbau alter Pakete                             */
/* ------------------------------------------------------------------ */

const alt = (forms, over) => Object.assign({
  lemma: 'aller', partOfSpeech: 'VERB', gloss: 'gehen',
  grammar: 'Unregelmäßig.', forms: forms, entrySchema: 0
}, over);

test('alte Pakete: die Formen verschiedener Texte werden vereinigt', () => {
  const erg = e.mergeLegacy(
    sammlung([['fr:aller:VERB', alt(['vont'])]]),
    sammlung([['fr:aller:VERB', alt(['vont', 'va', 'vais'])]])
  );
  is(erg.get('fr:aller:VERB').forms, ['vont', 'va', 'vais'], 'alle da, ohne Doppelte');
});

test('alte Pakete: die Reihenfolge bleibt, wie sie zuerst kam', () => {
  const erg = e.mergeLegacy(
    sammlung([['fr:aller:VERB', alt(['va', 'vont'])]]),
    sammlung([['fr:aller:VERB', alt(['vais', 'va'])]])
  );
  is(erg.get('fr:aller:VERB').forms, ['va', 'vont', 'vais'], 'die ersten vorn, die neuen hinten');
});

test('alte Pakete: sonst bleibt der erste Eintrag, wie er ist', () => {
  const erg = e.mergeLegacy(
    sammlung([['fr:aller:VERB', alt(['vont'], { gloss: 'gehen' })]]),
    sammlung([['fr:aller:VERB', alt(['va'], { gloss: 'fahren', grammar: 'Anders.' })]])
  );
  is(erg.get('fr:aller:VERB').gloss, 'gehen', 'Bedeutung vom ersten');
  is(erg.get('fr:aller:VERB').grammar, 'Unregelmäßig.', 'Beschreibung vom ersten');
});

test('alte Pakete: ein unbekanntes Wort wird einfach aufgenommen', () => {
  const erg = e.mergeLegacy(sammlung([]), sammlung([['fr:aller:VERB', alt(['va'])]]));
  is(erg.get('fr:aller:VERB').forms, ['va'], 'drin');
});

test('alte Pakete: der Bestand wird nicht verändert', () => {
  const vorher = alt(['vont']);
  const bestand = sammlung([['fr:aller:VERB', vorher]]);
  e.mergeLegacy(bestand, sammlung([['fr:aller:VERB', alt(['va'])]]));
  is(vorher.forms, ['vont'], 'die Liste des Bestands ist dieselbe geblieben');
});
