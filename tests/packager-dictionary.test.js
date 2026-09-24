"use strict";

/*
 * Der Wortvorrat der Werkstatt.
 *
 * Hier hängt die Ordnung dran, um die es beim Umbau geht: ein Wort, eine
 * Beschreibung, über alle Texte hinweg. Fehler darin fielen erst auf,
 * wenn dieselbe Vokabel in zwei Texten verschieden erklärt wird - also
 * Wochen später.
 */

const { test, is, ok, report, load } = require('./run.js');
const dictionary = load('packager/dictionary.js');

const note = [
  '---',
  'type: packager-word',
  'language: fr',
  'lemma: chercher',
  'partOfSpeech: VERB',
  'key: "fr:chercher:VERB"',
  'gloss: "suchen"',
  'forms: [cherche, cherchons]',
  '---',
  '',
  '## Grammar',
  '',
  'Regelmäßig auf -er.',
  ''
].join('\n');

test('aus einer Wortnotiz wird ein Eintrag', () => {
  const made = dictionary.fromNote(note, 'fr');
  is(made.key, 'fr:chercher:VERB', 'der Schlüssel');
  is(made.entry.lemma, 'chercher', 'die Grundform');
  is(made.entry.forms, ['cherche', 'cherchons'], 'die Formen');
  is(made.entry.grammar, 'Regelmäßig auf -er.', 'die Beschreibung');
  is(made.entry.entrySchema, 0, 'eine alte Notiz zählt als Bauplan null');
});

test('eine Notiz ohne Grundform ergibt keinen Eintrag', () => {
  is(dictionary.fromNote('---\ntype: packager-word\n---\n', 'fr'), null, 'nichts');
});

test('was schon da ist, wird nicht überschrieben', () => {
  const vorrat = {
    'fr:chercher:VERB': dictionary.entry({ lemma: 'chercher', partOfSpeech: 'VERB', gloss: 'suchen', entrySchema: 3 })
  };
  const added = dictionary.addMissing(vorrat, {
    'fr:chercher:VERB': { lemma: 'chercher', partOfSpeech: 'VERB', gloss: 'etwas ganz anderes', entrySchema: 9 },
    'fr:trouver:VERB': { lemma: 'trouver', partOfSpeech: 'VERB', gloss: 'finden', entrySchema: 3 }
  });

  is(added, ['fr:trouver:VERB'], 'nur das Fehlende kam dazu');
  is(vorrat['fr:chercher:VERB'].gloss, 'suchen', 'der vorhandene Eintrag blieb unangetastet');
  is(vorrat['fr:chercher:VERB'].entrySchema, 3, 'auch seine Bauplannummer');
});

test('fehlende Schlüssel werden benannt', () => {
  const vorrat = { 'fr:chercher:VERB': dictionary.entry({ lemma: 'chercher', partOfSpeech: 'VERB', gloss: 'suchen' }) };
  is(
    dictionary.missingFrom(vorrat, ['fr:chercher:VERB', 'fr:trouver:VERB', 'fr:le:DET']),
    ['fr:trouver:VERB', 'fr:le:DET'],
    'zwei fehlen'
  );
});

test('der Auszug für einen Text enthält nur dessen Wörter', () => {
  const vorrat = {
    'fr:chercher:VERB': dictionary.entry({ lemma: 'chercher', partOfSpeech: 'VERB', gloss: 'suchen' }),
    'fr:trouver:VERB': dictionary.entry({ lemma: 'trouver', partOfSpeech: 'VERB', gloss: 'finden' })
  };
  is(Object.keys(dictionary.extract(vorrat, ['fr:trouver:VERB'])), ['fr:trouver:VERB'], 'nur eines');
});

test('leere Felder stehen nicht in der Datei', () => {
  const written = dictionary.serialize({
    'fr:le:DET': dictionary.entry({ lemma: 'le', partOfSpeech: 'DET', gloss: 'der', forms: [], grammar: '   ' })
  });
  ok(written.indexOf('forms') < 0, 'keine leere Formenliste');
  ok(written.indexOf('grammar') < 0, 'keine leere Beschreibung');
});

test('dieselben Einträge ergeben dieselbe Datei', () => {
  const one = {
    'fr:trouver:VERB': dictionary.entry({ lemma: 'trouver', partOfSpeech: 'VERB', gloss: 'finden' }),
    'fr:chercher:VERB': dictionary.entry({ lemma: 'chercher', partOfSpeech: 'VERB', gloss: 'suchen' })
  };
  const two = {
    'fr:chercher:VERB': dictionary.entry({ lemma: 'chercher', partOfSpeech: 'VERB', gloss: 'suchen' }),
    'fr:trouver:VERB': dictionary.entry({ lemma: 'trouver', partOfSpeech: 'VERB', gloss: 'finden' })
  };
  is(dictionary.serialize(one), dictionary.serialize(two), 'Reihenfolge beim Einfügen ändert nichts');
});

test('gelesen wird, was lesbar ist - der Rest wird gemeldet', () => {
  const result = dictionary.parse(JSON.stringify({
    'fr:chercher:VERB': { lemma: 'chercher', partOfSpeech: 'VERB', gloss: 'suchen', entrySchema: 2 },
    'fr:kaputt:VERB': { gloss: 'ohne Grundform' },
    'fr:auch:ADV': 'gar kein Eintrag'
  }));

  is(Object.keys(result.dictionary), ['fr:chercher:VERB'], 'ein brauchbarer Eintrag');
  is(result.problems.length, 2, 'zwei Meldungen');
});

test('eine kaputte Datei wirft nicht, sie meldet', () => {
  const result = dictionary.parse('{ das ist kein JSON');
  is(result.dictionary, {}, 'nichts gelesen');
  is(result.problems.length, 1, 'eine Meldung');
});

test('Formen aus einem neuen Text kommen dazu, sonst nichts', () => {
  const vorrat = {
    'fr:aller:VERB': dictionary.entry({ lemma: 'aller', partOfSpeech: 'VERB', gloss: 'gehen', forms: ['va'], grammar: 'alt', entrySchema: 1 })
  };
  const changed = dictionary.mergeForms(vorrat, {
    'fr:aller:VERB': { lemma: 'aller', partOfSpeech: 'VERB', gloss: 'etwas anderes', forms: ['va', 'allons', 'irai'], grammar: 'neu', entrySchema: 5 },
    'fr:unbekannt:NOUN': { lemma: 'unbekannt', partOfSpeech: 'NOUN', gloss: 'x', forms: ['y'] }
  });

  is(changed, 1, 'ein Eintrag geändert');
  is(vorrat['fr:aller:VERB'].forms, ['va', 'allons', 'irai'], 'alle Formen, die alten zuerst');
  is(vorrat['fr:aller:VERB'].gloss, 'gehen', 'die Bedeutung blieb');
  is(vorrat['fr:aller:VERB'].grammar, 'alt', 'die Beschreibung blieb');
  is(vorrat['fr:aller:VERB'].entrySchema, 1, 'die Bauplannummer blieb');
  ok(!vorrat['fr:unbekannt:NOUN'], 'Unbekanntes wird hier nicht aufgenommen');
});

test('nichts Neues, nichts geändert', () => {
  const vorrat = { 'fr:aller:VERB': dictionary.entry({ lemma: 'aller', partOfSpeech: 'VERB', gloss: 'gehen', forms: ['va'] }) };
  is(dictionary.mergeForms(vorrat, { 'fr:aller:VERB': { forms: ['va'] } }), 0, 'keine Änderung');
});

test('eine unlesbare Notiz gilt nicht als übernommen', () => {
  is(dictionary.covers({}, null), false, 'nicht enthalten');
});

test('übernommen heißt: alles, was die Notiz wusste', () => {
  const made = dictionary.fromNote(note, 'fr');
  const vorrat = { 'fr:chercher:VERB': dictionary.entry(made.entry) };
  ok(dictionary.covers(vorrat, made), 'gleich: enthalten');

  vorrat['fr:chercher:VERB'].grammar = 'etwas anderes';
  ok(!dictionary.covers(vorrat, made), 'andere Beschreibung: nicht enthalten');

  vorrat['fr:chercher:VERB'] = dictionary.entry(made.entry);
  vorrat['fr:chercher:VERB'].forms = ['cherche'];
  ok(!dictionary.covers(vorrat, made), 'eine Form fehlt: nicht enthalten');

  vorrat['fr:chercher:VERB'].forms = ['cherche', 'cherchons', 'cherchez'];
  ok(dictionary.covers(vorrat, made), 'mehr Formen: enthalten');
});

if (require.main === module) report();
