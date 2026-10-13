"use strict";

/*
 * Der Bau eines Pakets aus der Werkbank - hier nur die Prüfung, ob ein Wort
 * zwei Schreibweisen derselben Grundform bekommen hat.
 *
 * Fängt sie zu wenig, zerfällt der Lernstand still in zwei Hälften. Fängt
 * sie zu viel, lehnt die Werkstatt einen richtigen Text ab - wie bei einer
 * spanischen Geschichte mit "que" und "qué".
 */

const { test, ok, report, load } = require('./run.js');
const build = load('packager/build.js');

function workOf(sentences) {
  return [
    '---', 'type: packager-work', 'language: es', 'id: es-probe', 'title: Probe', '---', ''
  ].concat(sentences).join('\n') + '\n';
}

function wordsFor(keys) {
  const words = new Map();
  for (const key of keys) {
    const [, lemma, partOfSpeech] = key.split(':');
    words.set(key, { key: key, lemma: lemma, partOfSpeech: partOfSpeech, gloss: 'x', forms: [], grammar: '' });
  }
  return words;
}

function problemsOf(sentences, original, keys) {
  const work = build.parseWork(workOf(sentences));
  return build.buildPackage(work, original, wordsFor(keys), 1, new Map(), 'de').problems;
}

const twoSpellings = (problems) => problems.some((one) => /two spellings/.test(one));

test('"que" und "qué" sind zwei Wörter, keine zwei Schreibweisen', () => {
  const problems = problemsOf([
    '¿Qué hotel es?',
    ': Welches Hotel ist es?',
    '    Qué · welches · qué · PRON',
    '    hotel · Hotel · hotel · NOUN',
    '    es · ist · ser · AUX',
    '',
    'El hotel que reservé.',
    ': Das Hotel, das ich reserviert habe.',
    '    El · das · el · DET',
    '    hotel · Hotel · hotel · NOUN',
    '    que · das · que · PRON',
    '    reservé · reservierte · reservar · VERB'
  ], '¿Qué hotel es? El hotel que reservé.',
  ['es:qué:PRON', 'es:hotel:NOUN', 'es:ser:AUX', 'es:el:DET', 'es:que:PRON', 'es:reservar:VERB']);

  ok(!twoSpellings(problems), 'nicht beanstandet');
});

test('dasselbe Wort mit zwei Grundformen wird weiter gefunden', () => {
  const problems = problemsOf([
    'Sé que vienes.',
    ': Ich weiß, dass du kommst.',
    '    Sé · weiß · saber · VERB',
    '    que · dass · que · PRON',
    '    vienes · kommst · venir · VERB',
    '',
    'Dice que sí.',
    ': Er sagt ja.',
    '    Dice · sagt · decir · VERB',
    '    que · dass · qué · PRON',
    '    sí · ja · sí · ADV'
  ], 'Sé que vienes. Dice que sí.',
  ['es:saber:VERB', 'es:que:PRON', 'es:venir:VERB', 'es:decir:VERB', 'es:qué:PRON', 'es:sí:ADV']);

  ok(twoSpellings(problems), 'beanstandet: "que" einmal mit "que", einmal mit "qué"');
});

if (require.main === module) report();
