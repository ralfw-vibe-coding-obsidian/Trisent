"use strict";

/*
 * Die Aufbereitung: einen Absatz von Claude glossieren lassen.
 *
 * Arbeitsteilung wie überall im Packager - die KI liefert Sprachwissen,
 * das Programm prüft es nach. Deshalb bekommt Claude hier bewusst NUR
 * Leserechte: Die Antwort kommt über die Ausgabe zurück, geschrieben
 * wird von uns. Was wir nicht selbst geschrieben haben, steht nicht in
 * der Vault.
 *
 * Aufgerufen wird außerhalb der Vault. Sonst liest die CLI die CLAUDE.md
 * dieses Ordners mit - und die erklärt, wie man diese App entwickelt,
 * nicht wie man glossiert. Zugriff auf den Sprachordner gibt es über
 * --add-dir, damit im Wortvorrat nachgeschlagen werden kann.
 */

const MODEL = 'opus';
const TIMEOUT_MS = 300000;

/* Zwischen diesen Marken steht die Werkbank-Fassung. Alles danach ist
   Begründung für die Person. */
const OPEN = '<<<WERKBANK';
const CLOSE = 'WERKBANK>>>';

/* Obsidians Modullader reicht require() an unsere eigenen Dateien weiter.
   Node-Module gibt es nur über das Fenster - und auf dem Handy gar nicht. */
function nodeModule(name) {
  const req =
    (typeof window !== 'undefined' && window.require) ||
    (typeof globalThis !== 'undefined' && globalThis.require);
  if (!req) return null;
  try {
    return req(name);
  } catch (error) {
    return null;
  }
}

function available() {
  return !!nodeModule('child_process');
}

/* ------------------------------------------------------------------ */
/* Die Anweisung                                                       */
/* ------------------------------------------------------------------ */

/* Was das Format angeht, steht die Anweisung hier im Programm und nicht
   in einer Notiz: Sie muss mit dem Einleser in build.js übereinstimmen.
   Läge sie getrennt, driftete sie irgendwann ab, und niemand merkte es.
   Was Geschmack ist, steht dagegen in rules.md und gehört der Person. */
function instructions(rules, example, languageFolder) {
  const parts = [];

  parts.push(
    'Du bereitest fremdsprachige Texte für einen interlinearen Lese-Reader auf.',
    'Deine einzige Aufgabe ist es, einen Absatz Satz für Satz und Wort für Wort',
    'zu annotieren.',
    '',
    'DIE DREI EBENEN',
    '',
    '1. Der Originalsatz, Zeichen für Zeichen unverändert.',
    '2. Eine möglichst FLACHE deutsche Wort-für-Wort-Glosse. Das ist kein gutes',
    '   Deutsch, sondern ein Fenster auf den Bau der Fremdsprache: Verben in der',
    '   Grundform, Artikel folgen dem Geschlecht der Fremdsprache, keine',
    '   Umstellung, kein Weglassen, kein Ergänzen. Ein Wort, eine Glosse.',
    '3. Ein natürlicher deutscher Satz, der die Bedeutung trägt.',
    '',
    'DAS FORMAT',
    '',
    '    Originalsatz',
    '    : natürlicher deutscher Satz',
    '        Wort · Glosse · Grundform · WORTART',
    '        Wort · Glosse · Grundform · WORTART',
    '      + Wendung · Glosse',
    '',
    '- Ein Block je Satz, Blöcke durch eine Leerzeile getrennt.',
    '- Der Originalsatz steht ohne Einrückung, Wörter eingerückt.',
    '- Die Wörter stehen in LESEREIHENFOLGE.',
    '- Satzzeichen und Leerzeichen bekommen KEINE Zeile.',
    '- Schreibe NIEMALS Zahlen oder Zeichenpositionen. Die rechnet ein',
    '  Programm aus, und es rechnet besser als du zählst.',
    '- Trennzeichen ist ausschließlich das Mittelpunkt-Zeichen ·',
    '- Erlaubte Wortarten, nichts anderes:',
    '  NOUN PROPN VERB AUX ADJ ADV PRON DET ADP NUM CCONJ SCONJ PART INTJ',
    '- Eine Wendung (+) ist eine feste Mehrwortverbindung, deren Bedeutung sich',
    '  nicht aus den Einzelwörtern ergibt. Sie umfasst mindestens zwei Wörter',
    '  und ersetzt sie nicht - die Wörter behalten ihre eigenen Zeilen.',
    '  Im Zweifel weglassen.',
    '- Steht hinter einer Wendung eine dritte Angabe, ist das ihre GRUNDFORM,',
    '  und die ist die Zitierform: klein geschrieben (außer Eigennamen) und mit',
    '  geradem Apostroph. Am Satzanfang heißt es also nicht "Je m\u2019appelle",',
    '  sondern "je m\'appelle" - so steht es später im Wörterbuch.',
    '',
    'DER ORIGINALTEXT IST UNANTASTBAR',
    '',
    'Kopiere jeden Satz Zeichen für Zeichen. Typografische Apostrophe,',
    'geschützte Leerzeichen und Anführungszeichen bleiben, wie sie sind.',
    'Tippe nichts ab und glätte nichts - sonst steht danach kein Wort mehr an',
    'seiner Stelle. Die Sätze müssen zusammengesetzt wieder genau den Absatz',
    'ergeben.',
    '',
    'NACHSCHLAGEN, BEVOR DU ENTSCHEIDEST',
    ''
  );

  if (languageFolder) {
    parts.push(
      'In ' + languageFolder + '/words/ liegt der Wortvorrat: je eine Notiz mit',
      'Grundform, Wortart und Glosse. Kommt ein Wort dort schon vor, benutze',
      'GENAU diese Grundform und diese Wortart. Daran hängt der Lernstand der',
      'Person über alle Texte hinweg; eine abweichende Grundform zerreißt ihn,',
      'ohne dass es jemand merkt. Schlage nach, bevor du entscheidest.',
      ''
    );
  }

  if (rules) {
    parts.push(
      'DIE HAUSREGELN DIESER SPRACHE',
      '',
      'Sie haben Vorrang vor deinem eigenen Urteil.',
      '',
      rules.trim(),
      ''
    );
  }

  if (example) {
    parts.push(
      'SO SIEHT EIN FERTIGER ABSATZ AUS',
      '',
      example.trim(),
      ''
    );
  }

  parts.push(
    'DEINE ANTWORT',
    '',
    'Schreibe die Werkbank-Fassung zwischen diese beiden Marken:',
    '',
    OPEN,
    '... die Blöcke ...',
    CLOSE,
    '',
    'Danach, außerhalb der Marken, in höchstens fünf Zeilen: welche',
    'Entscheidungen du treffen musstest, die NICHT aus dem Wortvorrat kamen.',
    'Kurz, für einen Menschen, der die Fremdsprache nicht kann.'
  );

  return parts.join('\n');
}

/* Die Anweisung für den zweiten Auftrag: Wortnotizen schreiben.

   Sie entstehen erst, nachdem der Text annotiert ist - dann steht fest,
   welche Schlüssel wirklich vorkommen, mit welchen Formen und in welchem
   Satz. Genau das ist der Anhalt. */
function wordInstructions(rules) {
  const parts = [];

  parts.push(
    'Du schreibst Wörterbucheinträge für einen Sprachlern-Reader.',
    'Zu jedem vorgegebenen Schlüssel entsteht genau ein Eintrag.',
    '',
    'DAS FORMAT',
    '',
    '    # <der Schlüssel, unverändert übernommen>',
    '    lemma: <die Grundform, in der Schreibweise der Fremdsprache>',
    '    gloss: <deutsche Grundbedeutung, ein bis drei Wörter, Varianten mit Komma>',
    '    forms: <die Formen aus dem Text, mit Komma getrennt>',
    '    grammar: <ein bis drei Sätze auf Deutsch>',
    '',
    'WORAUF ES ANKOMMT',
    '',
    '- Der Schlüssel hat die Form sprache:grundform:WORTART. Die Grundform in',
    '  deiner lemma-Zeile MUSS dazu passen - sonst wird der Eintrag verworfen.',
    '  Groß- und Kleinschreibung darf abweichen (Eigennamen!), sonst nichts.',
    '- gloss ist die Grundbedeutung des Wortes, nicht die Glosse aus einem',
    '  bestimmten Satz. Sie darf breiter sein.',
    '- grammar ist das, was man beim Lernen wirklich wissen will: Geschlecht,',
    '  unregelmäßige Formen, wovon das Wort begleitet wird, wogegen man es',
    '  verwechselt. Keine Schulbuchprosa, keine Beispiele ohne Nutzen.',
    '- Bei einer Wendung (WORTART ist PHRASE) erklärt grammar, was da wörtlich',
    '  steht und wann man es benutzt. Ihre lemma-Zeile trägt die Zitierform:',
    '  klein geschrieben, gerader Apostroph.',
    ''
  );

  if (rules) {
    parts.push('DIE HAUSREGELN DIESER SPRACHE', '', rules.trim(), '');
  }

  parts.push(
    'DEINE ANTWORT',
    '',
    'Alle Einträge zwischen diesen beiden Marken, nichts sonst:',
    '',
    OPEN,
    '# ...',
    CLOSE
  );

  return parts.join('\n');
}

/* ------------------------------------------------------------------ */
/* Aufruf                                                              */
/* ------------------------------------------------------------------ */

function run(command, args, options) {
  const childProcess = nodeModule('child_process');
  if (!childProcess) {
    return Promise.reject(new Error('This only works on the desktop.'));
  }

  return new Promise((resolve) => {
    let child;
    try {
      child = childProcess.spawn(command, args, options || {});
    } catch (error) {
      resolve({ code: -1, out: '', err: String(error.message || error) });
      return;
    }

    let out = '';
    let err = '';
    let done = false;

    const finish = (code) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      resolve({ code: code, out: out, err: err });
    };

    const timer = window.setTimeout(() => {
      try { child.kill(); } catch (error) { /* schon tot */ }
      finish(-2);
    }, (options && options.timeoutMs) || TIMEOUT_MS);

    /* Der Text geht über die Standardeingabe, nicht als Aufrufwort:
       Optionen wie --allowedTools nehmen mehrere Werte und würden ein
       angehängtes Wort mitverschlucken. */
    if (child.stdin) {
      try {
        if (options && options.input) child.stdin.write(options.input);
        child.stdin.end();
      } catch (error) { /* Prozess schon weg */ }
    }

    child.stdout.on('data', (chunk) => { out += String(chunk); });
    child.stderr.on('data', (chunk) => { err += String(chunk); });
    child.on('error', (error) => { err += String(error.message || error); finish(-1); });
    child.on('close', (code) => finish(code));
  });
}

/* Antwortet das Programm unter diesem Namen? */
async function version(command) {
  if (!command) return '';
  const result = await run(command, ['--version'], { timeoutMs: 20000 });
  if (result.code !== 0) return '';
  const line = result.out.trim().split('\n')[0];
  return /\d+\.\d+/.test(line) ? line : '';
}

/* Wo die CLI liegen könnte.

   Obsidian startet Programme nicht über deine Anmelde-Shell, also fehlt
   dort alles, was in .zshrc oder .profile zum Pfad dazukommt - und genau
   dort liegt die CLI üblicherweise. Deshalb fragen wir am Ende die Shell
   selbst; die weiß es. */
async function locate(preferred) {
  const os = nodeModule('os');
  const home = os ? os.homedir() : '';

  const candidates = [preferred, 'claude'];
  if (home) {
    candidates.push(
      home + '/.local/bin/claude',
      home + '/.claude/local/claude',
      home + '/bin/claude'
    );
  }
  candidates.push('/opt/homebrew/bin/claude', '/usr/local/bin/claude');

  for (const candidate of candidates) {
    if (!candidate) continue;
    const found = await version(candidate);
    if (found) return { path: candidate, version: found };
  }

  /* Die Anmelde-Shell fragen. Auf Windows gibt es sie so nicht. */
  const platform = (nodeModule('process') || {}).platform ||
    (typeof process !== 'undefined' ? process.platform : '');
  if (platform !== 'win32') {
    const shell = ((nodeModule('process') || {}).env || {}).SHELL || '/bin/zsh';
    const asked = await run(shell, ['-lic', 'command -v claude'], { timeoutMs: 20000 });
    const line = asked.out.trim().split('\n').filter((piece) => piece.startsWith('/')).pop();
    if (line) {
      const found = await version(line);
      if (found) return { path: line, version: found };
    }
  }

  return null;
}

/* Der Testknopf. Findet er das Programm woanders, trägt der Aufrufer den
   Fund ein - besser, als die Person suchen zu schicken. */
async function check(command) {
  if (!available()) {
    return { ok: false, text: 'Not on this device - the packager needs the desktop app.' };
  }

  const direct = await version(command);
  if (direct) return { ok: true, text: 'Found: ' + direct };

  const found = await locate(command);
  if (found) {
    return {
      ok: true,
      path: found.path,
      text: 'Found at ' + found.path + ': ' + found.version + '. Filled in for you.'
    };
  }

  return {
    ok: false,
    text: 'Claude was not found. Open a terminal, run "which claude", and paste the path here.'
  };
}

/* Einen Absatz aufbereiten. "folder" ist der absolute Pfad des Sprach-
   ordners in der Werkstatt, "temp" ein Ort außerhalb der Vault. */
async function prepare(options) {
  const args = [
    '-p',
    '--model', MODEL,
    '--append-system-prompt', instructions(options.rules, options.example, options.folder),
    '--allowedTools', 'Read,Glob,Grep'
  ];
  if (options.folder) args.push('--add-dir', options.folder);

  const input =
    'Annotiere diesen Absatz nach den Vorgaben. Schlage vorher im Wortvorrat nach.\n\n' +
    options.paragraph + '\n';

  const result = await run(options.command, args, {
    cwd: options.temp,
    input: input,
    timeoutMs: TIMEOUT_MS
  });

  if (result.code === -2) throw new Error('Claude did not answer within five minutes.');
  if (result.code !== 0) {
    throw new Error('Claude stopped with an error: ' + (result.err.trim() || result.out.trim() || 'no message'));
  }

  const block = between(result.out);
  if (!block) {
    throw new Error('The answer did not contain a workbench block. It began: ' + result.out.trim().slice(0, 200));
  }

  return { block: block, notes: after(result.out) };
}

/* Was beim Aufbereiten entschieden wurde, in Hausregeln fassen.

   Ohne diesen Schritt ist jede Entscheidung nach dem Lauf vergessen, und
   der nächste Text entscheidet vielleicht anders - das ist der leise Weg,
   auf dem die Wissensschlüssel über Monate auseinanderlaufen. */
async function learnRules(options) {
  const system = [
    'Du pflegst die Hausregeln einer Sprache für einen interlinearen Reader.',
    '',
    'Hausregeln sind Entscheidungen, die für ALLE Texte dieser Sprache gelten',
    'müssen: welche Grundform eine Wortform bekommt, welche Wortart, wie',
    'Verschmelzungen und Elisionen behandelt werden, was als Wendung zählt,',
    'wie glossiert wird. Daran hängt, ob ein einmal gelerntes Wort im nächsten',
    'Text wiedererkannt wird.',
    '',
    'Du bekommst die geltenden Regeln und die Entscheidungen, die beim',
    'Aufbereiten eines Textes getroffen wurden. Nenne daraus NUR das, was',
    '',
    '- allgemein gilt, nicht nur für diesen einen Text,',
    '- in den geltenden Regeln noch NICHT steht,',
    '- und beim nächsten Text sonst anders entschieden werden könnte.',
    '',
    'Höchstens fünf. Lieber keine als eine überflüssige - eine Regelsammlung,',
    'die alles aufschreibt, liest am Ende niemand mehr.',
    '',
    'Jede Regel ein Satz, in der Befehlsform, mit einem Beispiel aus der',
    'Fremdsprache. Keine Nummerierung, keine Einleitung.',
    '',
    'Antworte mit den Regeln zwischen diesen Marken, je eine Zeile:',
    '',
    OPEN,
    '- ...',
    CLOSE,
    '',
    'Ist nichts Neues dabei, lass den Bereich zwischen den Marken leer.'
  ].join('\n');

  const input = [
    'GELTENDE HAUSREGELN',
    '',
    (options.rules || '(noch keine)').trim(),
    '',
    'ENTSCHEIDUNGEN BEIM AUFBEREITEN DIESES TEXTES',
    '',
    options.notes.join('\n')
  ].join('\n');

  const args = ['-p', '--model', MODEL, '--append-system-prompt', system];
  const result = await run(options.command, args, {
    cwd: options.temp,
    input: input,
    timeoutMs: TIMEOUT_MS
  });
  if (result.code !== 0) return [];

  return between(result.out)
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
    .filter((line) => line.length > 10);
}

/* Wortnotizen zu einer Handvoll Schlüsseln schreiben lassen. */
async function words(options) {
  const args = [
    '-p',
    '--model', MODEL,
    '--append-system-prompt', wordInstructions(options.rules),
    '--allowedTools', 'Read,Glob,Grep'
  ];
  if (options.folder) args.push('--add-dir', options.folder);

  const lines = ['Schreibe zu diesen Schlüsseln je einen Eintrag.', ''];
  for (const entry of options.entries) {
    lines.push('## ' + entry.key);
    lines.push('Grundform laut Text: ' + entry.lemma);
    lines.push('Wortart: ' + entry.partOfSpeech);
    if (entry.forms.length) lines.push('Formen im Text: ' + entry.forms.join(', '));
    if (entry.glosses.length) lines.push('Glossen im Text: ' + entry.glosses.join(', '));
    if (entry.sentence) lines.push('Beispielsatz: ' + entry.sentence);
    lines.push('');
  }

  const result = await run(options.command, args, {
    cwd: options.temp,
    input: lines.join('\n'),
    timeoutMs: TIMEOUT_MS
  });

  if (result.code === -2) throw new Error('Claude did not answer within five minutes.');
  if (result.code !== 0) {
    throw new Error('Claude stopped with an error: ' + (result.err.trim() || 'no message'));
  }

  const block = between(result.out);
  if (!block) throw new Error('The answer contained no entries.');

  return parseEntries(block);
}

/* Aus dem Antwortblock Einträge machen. Was nicht passt, fällt weg -
   geprüft wird beim Schreiben noch einmal gegen den Schlüssel. */
function parseEntries(block) {
  const entries = [];
  let current = null;
  let field = null;

  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = line.match(/^#+\s*(\S.*)$/);
    if (heading) {
      if (current) entries.push(current);
      current = { key: heading[1].trim(), lemma: '', gloss: '', forms: [], grammar: '' };
      field = null;
      continue;
    }
    if (!current) continue;

    const pair = line.match(/^(lemma|gloss|forms|grammar)\s*:\s*(.*)$/i);
    if (pair) {
      field = pair[1].toLowerCase();
      const value = pair[2].trim();
      if (field === 'forms') current.forms = value.split(',').map((p) => p.trim()).filter(Boolean);
      else current[field] = value;
      continue;
    }
    /* Fortsetzungszeilen gehören zur Grammatiknotiz. */
    if (field === 'grammar' && line) current.grammar += ' ' + line;
  }
  if (current) entries.push(current);
  return entries;
}

/* Die Marken werden gelegentlich verschrieben - einmal kam WORKBANK>>>
   statt WERKBANK>>> zurück. Daran soll ein ganzer Absatz nicht scheitern,
   also wird großzügig gesucht: irgendein Wort in spitzen Klammern. Was
   dabei durchrutscht, fängt die Prüfung ab. */
const OPEN_MARK = /<<<[A-Za-z]*[^\S\n]*\r?\n/;
const CLOSE_MARK = /\r?\n[^\S\n]*[A-Za-z]*>>>/;

function between(text) {
  const open = text.match(OPEN_MARK);
  if (!open) return '';

  const rest = text.slice(open.index + open[0].length);
  const close = rest.match(CLOSE_MARK);
  const block = close ? rest.slice(0, close.index) : rest;

  /* Sicherheitshalber: eine Zeile, die noch wie eine Marke aussieht,
     gehört nicht zum Inhalt. */
  return block
    .split(/\r?\n/)
    .filter((line) => !/^[^\S\n]*[A-Za-z]*>>>[^\S\n]*$/.test(line))
    .join('\n')
    .replace(/^\r?\n/, '')
    .replace(/\s+$/, '');
}

function after(text) {
  const open = text.match(OPEN_MARK);
  if (!open) return '';
  const rest = text.slice(open.index + open[0].length);
  const close = rest.match(CLOSE_MARK);
  if (!close) return '';
  return rest.slice(close.index + close[0].length).trim();
}

/* Ein Ort außerhalb der Vault, an dem die CLI laufen kann. */
function tempDir() {
  const os = nodeModule('os');
  return os ? os.tmpdir() : undefined;
}

module.exports = { available, check, locate, prepare, words, learnRules, instructions, tempDir, MODEL };
