"use strict";

/*
 * Die Werkbank als Gedächtnis.
 *
 * Wer einen Absatz im Ausgangstext ändert, soll nicht den ganzen Text neu
 * bezahlen. Also wird jeder Absatz des Textes an seinem Wortlaut in der
 * Werkbank wiedererkannt: Steht er dort schon, bleibt seine Aufbereitung,
 * wie sie ist - samt allem, was die Person dort von Hand korrigiert hat.
 * Neu aufbereitet wird nur, was sich nicht wiederfindet.
 *
 * Wiedererkannt wird am Inhalt, nicht an der Stelle. Deshalb stören weder
 * eingefügte noch verschobene Absätze, und ein Lauf, der mittendrin
 * abbricht, hinterlässt keine Lücke, die später stört: Beim nächsten
 * Mal wird eben nur noch der fehlende Absatz aufbereitet.
 *
 * Nur Rechnungen, kein Obsidian. Geprüft in tests/packager-workbench.test.js.
 */

const { parseWork } = require('./build.js');

/* Kopf und Absatzblöcke einer Werkbank. Ein Block endet an einer Zeile,
   die nur aus Strichen besteht - so trennt die Werkbank ihre Absätze. */
function splitWork(text) {
  const clean = String(text || '').replace(/\r\n/g, '\n');
  const match = clean.match(/^---\n[\s\S]*?\n---\n?/);
  const head = match ? match[0].replace(/\n*$/, '\n') : '';
  const body = match ? clean.slice(match[0].length) : clean;

  const blocks = [];
  let current = [];
  const close = () => {
    const block = current.join('\n').trim();
    if (block) blocks.push(block);
    current = [];
  };

  for (const line of body.split('\n')) {
    if (/^-{3,}$/.test(line.trim())) {
      close();
      continue;
    }
    current.push(line);
  }
  close();

  return { head: head, blocks: blocks };
}

/* Woran ein Absatz wiedererkannt wird: sein Wortlaut, ohne Leerraum.
   Ein anderer Zeilenumbruch ist keine Änderung; ein anderes Wort schon. */
function fingerprintOf(text) {
  return String(text || '').normalize('NFC').replace(/\s+/g, '');
}

/* Der Wortlaut, den ein Block der Werkbank abdeckt. */
function sourceOfBlock(block) {
  return parseWork(block).paragraphs
    .map((paragraph) => paragraph.sentences.map((sentence) => sentence.source).join(' '))
    .join(' ');
}

/* Für jeden Absatz des Textes: der Block, der ihn schon enthält - oder
   null. Jeder Block wird höchstens einmal vergeben; zwei gleichlautende
   Absätze brauchen auch zwei Blöcke. */
function plan(paragraphs, blocks) {
  const free = (blocks || []).map((block) => ({
    block: block,
    key: fingerprintOf(sourceOfBlock(block)),
    used: false
  }));

  return (paragraphs || []).map((paragraph) => {
    const key = fingerprintOf(paragraph);
    const hit = free.find((one) => !one.used && one.key === key);
    if (!hit) return { paragraph: paragraph, block: null };
    hit.used = true;
    return { paragraph: paragraph, block: hit.block };
  });
}

/* Die Werkbank wieder zusammensetzen - in der Reihenfolge des Textes und
   nur mit den Absätzen, für die es einen Block gibt. */
function joinWork(head, blocks) {
  const top = head ? String(head).replace(/\n*$/, '\n\n') : '';
  return top + blocks.join('\n\n---\n\n') + '\n';
}

module.exports = { splitWork, plan, joinWork, fingerprintOf };
