"use strict";

/*
 * Ein Archiv schreiben und wieder lesen.
 *
 * Das ist der Punkt, an dem der Packager sein Erzeugnis abliefert und der
 * Reader es aufmacht. Geht dabei ein Byte verloren, merkt es niemand beim
 * Packen - erst der Fremde, bei dem das Paket nicht aufgeht.
 */

const { test, testAsync, is, ok, report, load } = require('./run.js');
const { readZip, writeZip } = load('core/zip.js');

const text = (bytes) => new TextDecoder('utf-8').decode(bytes);

testAsync('was hineingeht, kommt wieder heraus', async ({ is }) => {
  const files = new Map();
  files.set('package.json', '{"id":"fr-test","version":2}');
  files.set('text.json', '{"paragraphs":[]}');
  files.set('audio/s001.mp3', new Uint8Array([1, 2, 3, 4, 5]));

  const archive = await writeZip(files);
  const back = await readZip(archive.buffer);

  is([...back.keys()].sort(), ['audio/s001.mp3', 'package.json', 'text.json'], 'alle Dateien');
  is(text(back.get('package.json')), '{"id":"fr-test","version":2}', 'der Kopf');
  is([...back.get('audio/s001.mp3')], [1, 2, 3, 4, 5], 'die Tonspur');
});

testAsync('Umlaute und kyrillische Namen überleben', async ({ is }) => {
  const files = new Map();
  files.set('Momtscheto/après-midi.json', '{"lemma":"après-midi"}');
  files.set('кучето.txt', 'Момчето и кучето');

  const back = await readZip((await writeZip(files)).buffer);

  is(text(back.get('кучето.txt')), 'Момчето и кучето', 'kyrillischer Inhalt');
  is(text(back.get('Momtscheto/après-midi.json')), '{"lemma":"après-midi"}', 'Pfad mit Akzent');
});

testAsync('derselbe Inhalt ergibt dieselben Bytes', async ({ is }) => {
  const one = new Map([['b.json', '{"n":1}'], ['a.json', '{"n":2}']]);
  const two = new Map([['a.json', '{"n":2}'], ['b.json', '{"n":1}']]);

  const first = await writeZip(one);
  const second = await writeZip(two);

  is([...first], [...second], 'Reihenfolge beim Hineinlegen ändert nichts');
});

testAsync('ein langer Text wird kleiner, eine kurze Tonspur nicht größer', async ({ ok }) => {
  const long = 'Paul est à une fête avec ses amis. '.repeat(200);
  const noise = new Uint8Array(400);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 37 + 11) % 251;

  const packed = await writeZip(new Map([['text.json', long]]));
  const kept = await writeZip(new Map([['audio/s001.mp3', noise]]));

  ok(packed.length < long.length / 2, 'Text wird gepackt');
  ok(kept.length < noise.length + 200, 'Unpackbares bläht sich nicht auf');
});

testAsync('ein leeres Archiv ist ein gültiges Archiv', async ({ is }) => {
  const back = await readZip((await writeZip(new Map())).buffer);
  is([...back.keys()], [], 'nichts drin, aber lesbar');
});

if (require.main === module) report();
