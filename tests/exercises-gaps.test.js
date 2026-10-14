"use strict";

/* Der Lückensatz: welche Wörter fehlen, welche Angebote es gibt, wie
   geprüft wird. */

const { test, is, ok, load } = require('./run.js');
const g = load('exercises/gaps.js');

const u = (start, end, key, pos) => ({ start: start, end: end, key: key, partOfSpeech: pos });

/* "Julie habite à Paris avec ses amis." */
const satz = {
  source: 'Julie habite à Paris avec ses amis.',
  units: [
    u(0, 5, 'fr:julie:PROPN', 'PROPN'),
    u(6, 12, 'fr:habiter:VERB', 'VERB'),
    u(13, 14, 'fr:à:ADP', 'ADP'),
    u(15, 20, 'fr:paris:PROPN', 'PROPN'),
    u(21, 25, 'fr:avec:ADP', 'ADP'),
    u(26, 29, 'fr:son:DET', 'DET'),
    u(30, 34, 'fr:ami:NOUN', 'NOUN')
  ]
};

const dictionary = {
  'fr:habiter:VERB': { lemma: 'habiter', forms: ['habites', 'habite'] },
  'fr:ami:NOUN': { lemma: 'ami', forms: ['ami', 'amis', 'amie'] },
  'fr:son:DET': { lemma: 'son', forms: ['son', 'sa', 'ses'] }
};

const others = [
  { text: 'parle', partOfSpeech: 'VERB' }, { text: 'fête', partOfSpeech: 'NOUN' },
  { text: 'chambre', partOfSpeech: 'NOUN' }, { text: 'dans', partOfSpeech: 'ADP' }
];

const still = () => 0.9999;

test('wie viele Lücken ein Satz verträgt', () => {
  is([g.gapCount(3), g.gapCount(4), g.gapCount(5), g.gapCount(9), g.gapCount(10)], [1, 1, 2, 2, 3], 'nach Länge');
});

test('nie Eigennamen, bevorzugt was man noch lernt, Inhaltswörter vor Bindewörtern', () => {
  const units = g.unitsOf(satz);
  const status = { 'fr:habiter:VERB': 'learning', 'fr:ami:NOUN': 'known', 'fr:avec:ADP': 'unknown' };
  const chosen = g.pickGaps(units, (k) => status[k] || 'known', new Set(), still);
  const keys = chosen.map((i) => units[i].key);
  ok(!keys.includes('fr:julie:PROPN') && !keys.includes('fr:paris:PROPN'), 'keine Namen');
  is(keys.length, 2, 'sieben Wörter - zwei Lücken');
  ok(keys.includes('fr:avec:ADP'), 'das unbekannte zuerst');
  ok(keys.includes('fr:habiter:VERB'), 'dann das, das man lernt');
});

test('Wörter aus dem Index fehlen vor allen anderen', () => {
  const units = g.unitsOf(satz);
  const chosen = g.pickGaps(units, () => 'unknown', new Set(['fr:son:DET']), still);
  ok(chosen.map((i) => units[i].key).includes('fr:son:DET'), 'das aus dem Index');
});

test('nicht zwei Lücken nebeneinander, solange es anders geht', () => {
  const units = g.unitsOf(satz);
  const chosen = g.pickGaps(units, () => 'unknown', new Set(), still);
  ok(chosen.every((i, n) => n === 0 || i - chosen[n - 1] > 1), 'mit Abstand');
});

test('falsche Angebote: zuerst andere Formen und die Grundform desselben Wortes', () => {
  const wrong = g.distractorsFor('habite', 'VERB', dictionary['fr:habiter:VERB'], others, new Set(['habite']), 2, still);
  is(wrong.slice().sort(), ['habiter', 'habites'], 'habites und habiter');
});

test('reichen die eigenen Formen nicht, dann Wörter derselben Art', () => {
  const wrong = g.distractorsFor('fête', 'NOUN', { lemma: 'fête', forms: ['fête'] }, others, new Set(['fête']), 2, still);
  is(wrong.length, 2, 'zwei');
  ok(wrong.every((w) => ['chambre', 'fête'].includes(w) || w === 'parle' || w === 'dans'), 'aus dem Vorrat');
  ok(wrong.includes('chambre'), 'ein Nomen zuerst');
  ok(!wrong.includes('fête'), 'nie die Lösung');
});

test('die Aufgabe: Satz in Stücken, Lösungen, ein gemeinsamer Topf', () => {
  const task = g.buildGaps(satz, dictionary, () => 'unknown', new Set(), others, still);
  is(task.gaps.length, 2, 'zwei Lücken');
  const text = task.parts.map((p) => (p.text !== undefined ? p.text : '___')).join('');
  is(text.split('___').length - 1, 2, 'zwei Lücken im Satz');
  ok(text.endsWith('.'), 'das Satzzeichen bleibt');
  is(task.options.length, 6, 'zwei Lösungen und je zwei falsche');
  for (const gap of task.gaps) ok(task.options.some((o) => o.text === gap.answer), 'Lösung im Topf: ' + gap.answer);
  is(new Set(task.options.map((o) => o.text)).size, 6, 'nichts doppelt');
});

test('prüfen: je Lücke, ohne Groß und klein', () => {
  const gaps = [{ answer: 'habite' }, { answer: "l'" }];
  is(g.checkGaps(['Habite', 'l’'], gaps), { correct: true, right: [true, true] }, 'richtig');
  is(g.checkGaps(['habites', "l'"], gaps), { correct: false, right: [false, true] }, 'eine falsch');
  is(g.checkGaps([null, "l'"], gaps).correct, false, 'leer ist falsch');
});
