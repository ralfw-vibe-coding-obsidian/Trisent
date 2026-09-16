/*
 * Aus dem Plugin-Ordner eine Fassung zum Weitergeben machen.
 *
 * Beim Entwickeln liegt das Plugin als ein Dutzend Dateien in der Vault.
 * Wer es über BRAT installiert, bekommt aber nur drei: main.js,
 * manifest.json und styles.css. Also werden hier alle Bausteine in die
 * main.js hineingelegt und alle Stilvorlagen in eine styles.css.
 *
 * Läuft auf dem Runner bei GitHub, nie auf dem Rechner der Person -
 * deshalb darf es node benutzen.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const PLUGIN = '.obsidian/plugins/my-vault-app';
const OUT = 'dist';

const read = (name) => readFile(path.join(PLUGIN, name), 'utf8');

/* Die Listen stehen in main.js - dort und nur dort. Zweimal gepflegt
   hieße irgendwann: hier vergessen, und das Plugin startet beim
   Empfänger nicht. */
function listFrom(source, name) {
  const block = source.match(new RegExp('const ' + name + ' = \\[([^\\]]*)\\]'));
  if (!block) throw new Error('No ' + name + ' list in main.js');
  return [...block[1].matchAll(/'([^']+)'/g)].map((hit) => hit[1]);
}

const main = await read('main.js');
const modules = listFrom(main, 'MODULES');
const styles = listFrom(main, 'MODULE_STYLES');

if (!main.includes('const EMBEDDED = null;')) {
  throw new Error('main.js has no place to put the files into.');
}

/* Die Bausteine als Zeichenketten einsetzen. JSON.stringify kümmert sich
   um Anführungszeichen, Zeilenumbrüche und alles Weitere. */
const sources = {};
for (const name of modules) sources[name] = await read(name);

const bundled = main.replace(
  'const EMBEDDED = null;',
  'const EMBEDDED = ' + JSON.stringify(sources, null, 0) + ';'
);

/* Stilvorlagen hintereinander, jede mit ihrem Namen darüber. */
const css = [await read('styles.css')];
for (const name of styles) {
  css.push('/* ' + name + ' */');
  css.push(await read(name));
}

const manifest = JSON.parse(await read('manifest.json'));

/* BRAT liest das Manifest im Wurzelverzeichnis, Obsidian das im
   Plugin-Ordner. Laufen die beiden auseinander, sucht BRAT eine Fassung,
   die es nicht gibt. */
const atRoot = JSON.parse(await readFile('manifest.json', 'utf8'));
if (JSON.stringify(atRoot) !== JSON.stringify(manifest)) {
  throw new Error('manifest.json in the root differs from the one in the plugin folder.');
}

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'main.js'), bundled);
await writeFile(path.join(OUT, 'styles.css'), css.join('\n\n'));
await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

/* Eine kaputte main.js merkt sonst erst der Empfänger. */
new Function(bundled);

console.log('Trisent ' + manifest.version);
console.log('  ' + modules.length + ' modules, ' + styles.length + ' extra stylesheets');
console.log('  main.js    ' + bundled.length + ' bytes');
console.log('  styles.css ' + css.join('\n\n').length + ' bytes');
