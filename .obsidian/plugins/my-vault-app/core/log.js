"use strict";

/*
 * Das Logbuch: was die App getan hat, zum Nachlesen.
 *
 * Gemeinsamer Code. Eine Meldung steht fünfzehn Sekunden da und ist dann
 * weg - auch wenn sie sagt, dass gerade zweihundert Notizen umgeschrieben
 * wurden. Das Logbuch sagt es später noch einmal.
 *
 * Hinein gehört, was die Dateien der Person verändert hat oder was sie
 * wissen sollte, auch wenn sie gerade nicht hinsah: Umbauten, Importe,
 * Deploys, aufgefrischte Regelwerke. Nicht hinein gehört, was nur uns
 * interessiert. Faustregel: Jede Meldung, die etwas GETANES berichtet,
 * geht auch ins Logbuch. Die Meldung sagt es jetzt, das Logbuch später.
 *
 * Die Bereiche heißen, wie die Person sie sieht: Reading, Translation,
 * Flashcards, Packager - und Learning für das, was allen Lernwerkzeugen
 * gehört.
 *
 * Absichtlich ohne require('obsidian'): Das Einfügen einer Zeile ist eine
 * reine Textrechnung und wird in tests/core-log.test.js geprüft.
 */

const LOG_FILE = 'log.md';

/* So viele Einträge bleiben stehen. Genug für ein paar Monate, und die
   Notiz wird in einem Jahr nicht zur Last. */
const KEEP = 500;

const HEAD = [
  '---',
  'type: trisent-log',
  '---',
  '',
  '<!-- What Trisent did, newest first. The app writes here by itself;',
  '     you can still change whatever you like. -->',
  ''
].join('\n');

function pad(n) {
  return String(n).padStart(2, '0');
}

/* Ortszeit - die Person liest das Logbuch auf ihrer Uhr, nicht in UTC. */
function stamp(when) {
  return {
    day: when.getFullYear() + '-' + pad(when.getMonth() + 1) + '-' + pad(when.getDate()),
    time: pad(when.getHours()) + ':' + pad(when.getMinutes())
  };
}

/* Eine Zeile in den Text des Logbuchs einfügen: oben in den heutigen Tag,
   oder als neuer Tag ganz oben. Danach wird von hinten gekürzt, bis nur
   noch "keep" Einträge übrig sind.

   Was die Person selbst hineingeschrieben hat und nicht wie ein Eintrag
   aussieht, bleibt stehen. */
function addEntry(text, when, area, message, keep) {
  const limit = keep || KEEP;
  const { day, time } = stamp(when);
  const line = '- ' + time + ' · ' + String(area) + ' · ' + oneLine(message);

  const source = String(text || '').trim() ? String(text) : HEAD;
  const lines = source.replace(/\r\n/g, '\n').split('\n');

  /* Der Kopf reicht bis zur ersten Tagesüberschrift. */
  let first = lines.findIndex((one) => /^## \d{4}-\d{2}-\d{2}\s*$/.test(one));
  if (first < 0) first = lines.length;
  const head = lines.slice(0, first);
  const body = lines.slice(first);

  if (body.length > 0 && body[0].trim() === '## ' + day) {
    body.splice(1, 0, '', line);
    /* Eine Leerzeile hinter der Überschrift reicht. */
    if (body[3] === '') body.splice(3, 1);
  } else {
    body.unshift('## ' + day, '', line, '');
  }

  return trim(head, body, limit);
}

function oneLine(message) {
  return String(message || '').replace(/\s+/g, ' ').trim();
}

/* Von hinten kürzen. Ein Tag, der dabei leer wird, verschwindet samt
   Überschrift. */
function trim(head, body, limit) {
  let count = 0;
  const kept = [];
  let dayLines = [];

  const flush = () => {
    if (dayLines.some((one) => isEntry(one))) kept.push.apply(kept, dayLines);
    dayLines = [];
  };

  for (const one of body) {
    if (/^## \d{4}-\d{2}-\d{2}\s*$/.test(one)) {
      flush();
      dayLines.push(one);
      continue;
    }
    if (isEntry(one)) {
      count += 1;
      if (count > limit) continue;
    }
    dayLines.push(one);
  }
  flush();

  const text = head.join('\n').replace(/\n*$/, '\n\n') + kept.join('\n');
  return text.replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n');
}

function isEntry(line) {
  return /^- \d{2}:\d{2} · /.test(line);
}

function logPath(plugin) {
  const base = String((plugin.settings && plugin.settings.libraryFolder) || '').trim();
  return (base ? base.replace(/\/+$/, '') + '/' : '') + LOG_FILE;
}

/* Eine Zeile ins Logbuch schreiben.

   Das Anhängen geht über vault.process() - das ist in Obsidian atomar je
   Datei, also können mehrere Teile der App gleichzeitig schreiben, ohne
   einander zu überschreiben.

   Nur das Anlegen ist es nicht. Beim Start laufen die Umbauten beider
   Seiten gleichzeitig; gibt es das Logbuch noch nicht, versuchen es beide
   anzulegen, und einer bekommt "already exists". Dann eben die Datei
   holen und anhängen - sie ist ja jetzt da.

   Das Logbuch darf nie etwas anderes zum Scheitern bringen. Geht hier
   etwas schief, steht es in der Konsole, und die eigentliche Arbeit ist
   trotzdem getan. */
async function log(plugin, area, message) {
  try {
    const vault = plugin.app.vault;
    const path = logPath(plugin);
    const now = new Date();

    let file = vault.getAbstractFileByPath(path);
    if (!file) {
      await ensureParent(vault, path);
      try {
        await vault.create(path, addEntry('', now, area, message));
        return;
      } catch (error) {
        if (!/exist/i.test(String(error && error.message || error))) throw error;
        file = await waitFor(vault, path);
      }
    }
    if (!file || !('extension' in file)) return;

    await vault.process(file, (text) => addEntry(text, now, area, message));
  } catch (error) {
    console.error('Trisent log', error);
  }
}

async function ensureParent(vault, path) {
  const parent = path.split('/').slice(0, -1).join('/');
  if (!parent || vault.getAbstractFileByPath(parent)) return;
  try {
    await vault.createFolder(parent);
  } catch (error) {
    if (!/exist/i.test(String(error && error.message || error))) throw error;
  }
}

/* Die Datei, die die andere Seite gerade angelegt hat, kennt Obsidians
   Verzeichnis womöglich noch nicht. Kurz warten statt aufgeben. */
async function waitFor(vault, path) {
  for (let n = 0; n < 10; n++) {
    const file = vault.getAbstractFileByPath(path);
    if (file) return file;
    await new Promise((done) => setTimeout(done, 100));
  }
  return null;
}

module.exports = { log, logPath, addEntry, LOG_FILE };
