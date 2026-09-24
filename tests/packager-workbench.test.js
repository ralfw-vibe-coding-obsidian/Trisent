"use strict";

/*
 * Die Werkbank als Gedächtnis.
 *
 * Geht das Wiedererkennen daneben, bezahlt die Person einen Absatz ein
 * zweites Mal - oder, schlimmer, eine alte Aufbereitung bleibt an einem
 * geänderten Absatz kleben.
 */

const { test, is, ok, report, load } = require('./run.js');
const bench = load('packager/workbench.js');

const head = '---\ntype: packager-work\nlanguage: fr\n---\n';

function block(sentence, fluent) {
  return sentence + '\n: ' + fluent + '\n    ' + sentence.split(' ')[0] + ' · x · x · NOUN';
}

const one = block('Paul est là.', 'Paul ist da.');
const two = block('Julie arrive.', 'Julie kommt.');
const work = head + '\n' + one + '\n\n---\n\n' + two + '\n';

test('Kopf und Blöcke werden sauber getrennt', () => {
  const split = bench.splitWork(work);
  is(split.head, head, 'der Kopf');
  is(split.blocks, [one, two], 'zwei Blöcke');
});

test('zusammensetzen ergibt wieder dieselbe Werkbank', () => {
  const split = bench.splitWork(work);
  is(bench.joinWork(split.head, split.blocks), work, 'unverändert');
});

test('unveränderte Absätze werden wiedererkannt', () => {
  const planned = bench.plan(['Paul est là.', 'Julie arrive.'], bench.splitWork(work).blocks);
  is(planned.map((p) => p.block), [one, two], 'beide wiedererkannt');
});

test('ein geänderter Absatz wird nicht wiedererkannt', () => {
  const planned = bench.plan(['Paul est ici.', 'Julie arrive.'], bench.splitWork(work).blocks);
  is(planned[0].block, null, 'der geänderte ist offen');
  is(planned[1].block, two, 'der andere bleibt');
});

test('ein eingefügter Absatz verschiebt nichts', () => {
  const planned = bench.plan(['Paul est là.', 'Il pleut.', 'Julie arrive.'], bench.splitWork(work).blocks);
  is(planned.map((p) => p.block), [one, null, two], 'nur der neue ist offen');
});

test('ein anderer Zeilenumbruch ist keine Änderung', () => {
  const planned = bench.plan(['Paul\nest   là.'], [one]);
  is(planned[0].block, one, 'wiedererkannt');
});

test('zwei gleichlautende Absätze brauchen zwei Blöcke', () => {
  const planned = bench.plan(['Paul est là.', 'Paul est là.'], [one]);
  is(planned[0].block, one, 'der erste bekommt ihn');
  is(planned[1].block, null, 'der zweite ist offen');
});

test('ein Block mit Sprecher wird samt Sprecher behalten', () => {
  const spoken = '@ Paul\n' + one;
  const planned = bench.plan(['Paul est là.'], [spoken]);
  is(planned[0].block, spoken, 'mit Sprecherzeile');
});

test('eine leere Werkbank: alles ist offen', () => {
  const split = bench.splitWork('');
  is(split.blocks, [], 'keine Blöcke');
  ok(bench.plan(['a', 'b'], split.blocks).every((p) => p.block === null), 'alles offen');
});

if (require.main === module) report();
