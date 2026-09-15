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

/* Läuft die CLI überhaupt? Der Testknopf in den Einstellungen. */
async function check(command) {
  if (!available()) return { ok: false, text: 'Not on this device - the packager needs the desktop app.' };

  const result = await run(command, ['--version'], { timeoutMs: 20000 });
  if (result.code === 0 && result.out.trim()) {
    return { ok: true, text: 'Found: ' + result.out.trim().split('\n')[0] };
  }
  if (result.code === -2) return { ok: false, text: 'No answer within 20 seconds.' };

  return {
    ok: false,
    text: 'Not found. ' + (result.err.trim() || 'Give the full path, for example /Users/you/.local/bin/claude.')
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

function between(text) {
  const from = text.indexOf(OPEN);
  const to = text.indexOf(CLOSE);
  if (from < 0 || to < 0 || to < from) return '';
  return text.slice(from + OPEN.length, to).replace(/^\r?\n/, '').replace(/\s+$/, '');
}

function after(text) {
  const to = text.indexOf(CLOSE);
  if (to < 0) return '';
  return text.slice(to + CLOSE.length).trim();
}

/* Ein Ort außerhalb der Vault, an dem die CLI laufen kann. */
function tempDir() {
  const os = nodeModule('os');
  return os ? os.tmpdir() : undefined;
}

module.exports = { available, check, prepare, instructions, tempDir, MODEL };
