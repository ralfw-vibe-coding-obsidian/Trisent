"use strict";

/*
 * Der Umbau alter Notizen auf das heutige Schema - der Teil, der Text
 * umschreibt.
 *
 * Kennt weder Obsidian noch Dateien. Das ist hier besonders wichtig:
 * Eine Migration läuft genau einmal, über alle Notizen der Person, und
 * niemand sieht zu. Schneidet sie einen Satz zu viel weg, ist er weg.
 * Deshalb steht die Schere hier und wird in tests/learning-schema.test.js
 * geprüft, während das Öffnen und Schreiben der Dateien woanders liegt.
 *
 * Grundsatz bei allem hier: Was die Person selbst geschrieben hat, bleibt.
 * Im Zweifel wird etwas aufgehoben, nicht weggeworfen.
 */

/* Zum Vergleichen: Zeilenumbrüche und doppelte Leerzeichen sind kein
   Unterschied. Ein Text, der nur anders umbrochen ist, ist derselbe. */
function sameText(a, b) {
  const flat = (text) => String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  return flat(a) === flat(b);
}

/* Einen Abschnitt "## Titel" aus einem Notiztext herausnehmen. Liefert
   den Inhalt des Abschnitts und den Text ohne ihn. */
function takeSection(body, title) {
  const lines = String(body == null ? '' : body).split('\n');
  const start = lines.findIndex((line) => line.trim() === '## ' + title);
  if (start < 0) return { content: '', rest: String(body == null ? '' : body) };

  let end = start + 1;
  while (end < lines.length && !/^##\s/.test(lines[end])) end++;

  const content = lines.slice(start + 1, end).join('\n').trim();
  const rest = lines.slice(0, start).concat(lines.slice(end)).join('\n');
  return { content: content, rest: rest };
}

/* Sicherstellen, dass es "## My notes" gibt - dort schreibt die Person
   hin, und der Cursor springt dorthin. */
function withMyNotes(body) {
  const text = String(body == null ? '' : body).replace(/^\n+/, '').trimEnd();
  if (/^##\s+My notes\s*$/m.test(text)) return text + '\n';
  return (text ? text + '\n\n' : '') + '## My notes\n';
}

/* Eine Word note auf das heutige Schema bringen: Die Grammatik gehört
   dem Paket und fliegt raus.

   ABER: Hat die Person daran etwas geändert, ist es ihr Text. Der wird
   dann unter "My notes" gerettet, statt gelöscht zu werden. Ein Satz,
   den jemand selbst geschrieben hat, ist mehr wert als ein sauberes
   Schema. */
function cleanWordNote(body, entryGrammar) {
  const taken = takeSection(body, 'Grammar');
  const rescue = taken.content && !sameText(taken.content, entryGrammar);

  let rest = withMyNotes(taken.rest);
  if (rescue) rest = rest.trimEnd() + '\n\n' + taken.content + '\n';

  return {
    body: rest,
    removed: Boolean(taken.content),
    rescued: Boolean(rescue)
  };
}

/* Eine Flashcard auf das heutige Schema bringen: Der nackte Wikilink im
   Text war ein Fehlgriff - er zeigte auf die Karte selbst, weil beide
   Notizen gleich heißen. Er kommt raus; wohin er zeigen wollte, wird
   zurückgegeben, damit der Aufrufer den richtigen Verweis setzen kann. */
function cleanFlashcard(body) {
  const lines = String(body == null ? '' : body).split('\n');
  const at = lines.findIndex((line) => /^\[\[[^\]]+\]\]$/.test(line.trim()));

  let target = null;
  if (at >= 0) {
    target = lines[at].trim().slice(2, -2).split('|')[0];
    lines.splice(at, 1);
  }

  return { body: withMyNotes(lines.join('\n')), target: target };
}

/* ------------------------------------------------------------------ */
/* Welche Umbauschritte noch anstehen                                 */
/* ------------------------------------------------------------------ */

/* Aus "die Vault steht auf 1" und "es gibt die Schritte 2 und 3" wird
   "2 und 3 sind zu tun". Eine Vault, die weiter ist als die App, bleibt
   in Ruhe - dort war jemand mit einer neueren Fassung unterwegs, und
   rückwärts umzubauen wäre schlimmer als gar nichts.

   Jeder Schritt wird einzeln vermerkt. Bricht der dritte ab, bleibt der
   zweite erledigt; beim nächsten Start geht es dort weiter. */
function pendingSteps(from, versions) {
  const at = Math.trunc(Number(from)) || 0;
  return (versions || [])
    .map((value) => Math.trunc(Number(value)))
    .filter((value) => Number.isFinite(value) && value > at)
    .sort((a, b) => a - b);
}

/* ------------------------------------------------------------------ */
/* Frontmatter lesen, ohne Obsidian zu fragen                         */
/* ------------------------------------------------------------------ */

/* Beim Umbau darf nicht der Metadatenspeicher die Quelle sein: Der ist
   beim Start womöglich noch beim Einlesen, und was er dann nicht kennt,
   sähe aus wie eine Notiz ohne Schlüssel. Der Umbau hielte sie für
   nichts und ginge weiter - einmal, unwiederbringlich.

   Deshalb wird hier der Kopf der Datei selbst gelesen. Nur einfache
   Zeilen `name: wert`; eine Liste über mehrere Zeilen ergibt null, der
   Name ist aber bekannt. Mehr braucht der Umbau nicht. */
function frontmatterOf(head) {
  const found = {};
  const lines = String(head == null ? '' : head).split('\n');

  for (const line of lines) {
    if (line === '---') continue;
    /* Eingerückte Zeilen gehören zum Wert darüber. */
    if (/^\s/.test(line)) continue;

    const at = line.indexOf(':');
    if (at <= 0) continue;

    const name = line.slice(0, at).trim();
    if (!name || /\s/.test(name)) continue;

    const raw = line.slice(at + 1).trim();
    found[name] = raw === '' ? null : raw.replace(/^["']|["']$/g, '');
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* Ein Paket der ersten Fassung aufteilen                             */
/* ------------------------------------------------------------------ */

/* Bisher lag alles in einer Datei: Kopf, Text und Wörterbuch. Künftig
   liegt der Text daneben, und das Wörterbuch wird in das der Person
   eingearbeitet und verschwindet aus dem Paket.

   Hier wird nur geteilt - nichts geht verloren, nichts kommt hinzu,
   außer der Fassungsnummer. Was im Kopf stand und weder Text noch
   Wörterbuch ist, bleibt im Kopf, in seiner Reihenfolge. Auch Felder,
   die diese App nicht kennt: Ein Paket geht durch viele Hände.

   `split` sagt, ob es überhaupt etwas zu teilen gab. Ein Paket, das
   schon geteilt ist, wird nicht noch einmal angefasst. */
function splitPackage(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  const split = Array.isArray(data.paragraphs);
  const head = {};
  for (const [name, value] of Object.entries(data)) {
    if (name === 'paragraphs' || name === 'dictionary') continue;
    head[name] = value;
  }
  if (split) head.schemaVersion = 2;

  return {
    split: split,
    head: head,
    text: { paragraphs: split ? data.paragraphs : [] },
    dictionary: data.dictionary && typeof data.dictionary === 'object' && !Array.isArray(data.dictionary)
      ? data.dictionary
      : {}
  };
}

module.exports = {
  sameText, takeSection, withMyNotes, cleanWordNote, cleanFlashcard,
  pendingSteps, frontmatterOf, splitPackage
};
