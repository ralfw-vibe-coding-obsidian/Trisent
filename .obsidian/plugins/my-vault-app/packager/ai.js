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
function instructions(options) {
  const into = options.into || 'German';
  const parts = [];

  parts.push(
    'You prepare foreign-language texts for an interlinear reading app.',
    'Your only job is to annotate one paragraph, sentence by sentence and',
    'word by word. The reader\'s own language is ' + into + ': every gloss and',
    'every translation you write is in ' + into + '.',
    '',
    'THE THREE LAYERS',
    '',
    '1. The original sentence, unchanged, character for character.',
    '2. A word-for-word gloss in ' + into + ', as FLAT as possible. This is not',
    '   good ' + into + ' - it is a window onto how the foreign language is built:',
    '   verbs in their base form, articles following the gender of the FOREIGN',
    '   language, no reordering, nothing left out, nothing added. One word, one',
    '   gloss. Grammar that hides inside a word ending must become visible in',
    '   the gloss.',
    '3. A natural sentence in ' + into + ' that carries the actual meaning.',
    '',
    'THE FORMAT',
    '',
    '    the original sentence',
    '    : the natural sentence',
    '        word · gloss · base form · PART-OF-SPEECH',
    '        word · gloss · base form · PART-OF-SPEECH',
    '      + phrase · gloss',
    '',
    '- One block per sentence, blocks separated by a blank line.',
    '- The original sentence is not indented, the words are.',
    '- The words stand in READING ORDER.',
    '- Punctuation and spaces get NO line of their own.',
    '- NEVER write numbers or character positions. A program works those out,',
    '  and it counts better than you do.',
    '- The separator is the middle dot · and nothing else.',
    '- Allowed parts of speech, nothing else:',
    '  NOUN PROPN VERB AUX ADJ ADV PRON DET ADP NUM CCONJ SCONJ PART INTJ',
    '- A phrase (+) is a fixed multi-word expression whose meaning does not',
    '  follow from its parts. It spans at least two words and does not replace',
    '  them - the words keep their own lines. When in doubt, leave it out.',
    '- A third field after a phrase is its BASE FORM, and that is the citation',
    '  form: lower case (unless it is a name) and with a straight apostrophe.',
    '  At the start of a sentence that means "je m\'appelle", not',
    '  "Je m\u2019appelle" - this is what ends up in the dictionary.',
    '',
    'THE ORIGINAL IS UNTOUCHABLE',
    '',
    'Copy every sentence character for character. Typographic apostrophes,',
    'non-breaking spaces and quotation marks stay exactly as they are. Do not',
    'retype and do not tidy up - otherwise no word sits where it says it does.',
    'Put back together, your sentences must be exactly the paragraph you were',
    'given.',
    '',
    'LOOK THINGS UP BEFORE YOU DECIDE',
    ''
  );

  if (options.folder) {
    parts.push(
      'In ' + options.folder + '/words/ there is a word store: one note per word',
      'with base form, part of speech and gloss. If a word is already there, use',
      'EXACTLY that base form and that part of speech. The reader\'s learning',
      'state hangs on it across every text; a different base form tears it apart',
      'without anyone noticing. So look it up before you decide.',
      ''
    );
  }

  if (options.rules) {
    parts.push(
      'THE HOUSE RULES FOR THIS LANGUAGE',
      '',
      'They take precedence over your own judgement.',
      '',
      options.rules.trim(),
      ''
    );
  }

  if (options.example) {
    parts.push('WHAT A FINISHED PARAGRAPH LOOKS LIKE', '', options.example.trim(), '');
  }

  parts.push(
    'YOUR ANSWER',
    '',
    'Put the annotated blocks between these two marks:',
    '',
    OPEN,
    '... the blocks ...',
    CLOSE,
    '',
    'After that, outside the marks, in at most five lines: which decisions you',
    'had to make that did NOT come from the word store. Short, for a person who',
    'does not speak the foreign language.'
  );

  return parts.join('\n');
}

/* Die Anweisung für den zweiten Auftrag: Wortnotizen schreiben.

   Sie entstehen erst, nachdem der Text annotiert ist - dann steht fest,
   welche Schlüssel wirklich vorkommen, mit welchen Formen und in welchem
   Satz. Genau das ist der Anhalt. */
function wordInstructions(options) {
  const into = options.into || 'German';
  const parts = [];

  parts.push(
    'You write dictionary entries for a language-learning reader.',
    'One entry per key you are given. Everything you write is in ' + into + '.',
    '',
    'THE FORMAT',
    '',
    '    # <the key, copied unchanged>',
    '    lemma: <the base form, spelled as the foreign language spells it>',
    '    gloss: <the basic meaning in ' + into + ', one to three words,',
    '            alternatives separated by commas>',
    '    forms: <the forms found in the text, separated by commas>',
    '    grammar: <one to three sentences in ' + into + '>',
    '',
    'WHAT MATTERS',
    '',
    '- The key reads language:baseform:PART-OF-SPEECH. Your lemma line MUST',
    '  match it, or the entry is thrown away. Upper and lower case may differ',
    '  (names!), nothing else.',
    '- gloss is the word\'s basic meaning, not the gloss from one particular',
    '  sentence. It may be broader.',
    '- grammar is the description of the word. It is Markdown, and it follows',
    '  the recipe below - the one for that part of speech, not a mixture.',
    '- For a phrase (part of speech PHRASE), the lemma line carries the',
    '  citation form: lower case, straight apostrophe.',
    ''
  );

  /* Der Bauplan ist der eigentliche Auftrag: Er sagt, was eine
     Beschreibung je Wortart enthalten muss. Ohne ihn entsteht mal eine
     Konjugation, mal eine Bemerkung, mal beides - und die Person sieht
     auf jeder Karte etwas anderes. */
  parts.push(
    'THE RECIPE FOR A DESCRIPTION',
    '',
    (options.recipe || '').trim() || 'Two or three labelled lines, then at most two sentences.',
    ''
  );

  if (options.rules) {
    parts.push('THE HOUSE RULES FOR THIS LANGUAGE', '', options.rules.trim(), '');
  }

  parts.push(
    'YOUR ANSWER',
    '',
    'All entries between these two marks, nothing else:',
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

/* Warum der Aufruf nicht durchkam.

   Die CLI schreibt ihren Grund auf die AUSGABE, nicht auf die Fehlerspur -
   wer nur die Fehlerspur liest, bekommt "no message" und sucht bei sich
   selbst. Einmal stand dort "OAuth session expired", einmal ein
   Guthaben-Limit; beides haette man sofort beheben koennen. */
function whyNot(result) {
  const said = (result.err.trim() || result.out.trim() || '').slice(0, 300);

  if (/authenticate|oauth|logged in|login/i.test(said)) {
    return 'Claude is not signed in on this computer. Open a terminal, run "claude", ' +
      'and sign in again - then come back. (' + said.split('\n')[0] + ')';
  }
  if (/credit|quota|usage limit|rate limit/i.test(said)) {
    return 'Claude refused the request: ' + said.split('\n')[0];
  }
  return said ? 'Claude stopped: ' + said : 'Claude stopped without saying why.';
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
    '--append-system-prompt', instructions(options),
    '--allowedTools', 'Read,Glob,Grep'
  ];
  if (options.folder) args.push('--add-dir', options.folder);

  const input =
    'Annotate this paragraph as instructed. Look words up in the word store first.\n\n' +
    options.paragraph + '\n';

  const result = await run(options.command, args, {
    cwd: options.temp,
    input: input,
    timeoutMs: TIMEOUT_MS
  });

  if (result.code === -2) throw new Error('Claude did not answer within five minutes.');
  if (result.code !== 0) {
    throw new Error(whyNot(result));
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
  const into = options.into || 'German';
  const system = [
    'You maintain the house rules for one foreign language in a reading app.',
    '',
    'House rules are decisions that must hold for EVERY text in that language:',
    'which base form a word form gets, which part of speech, how contractions',
    'and elisions are handled, what counts as a phrase, how to gloss. Whether a',
    'word learned once is recognised in the next text hangs on them.',
    '',
    'You are given the rules in force and the decisions that were made while',
    'preparing one text. Name ONLY what',
    '',
    '- holds in general, not just for this one text,',
    '- is NOT yet in the rules in force,',
    '- and could otherwise be decided differently next time.',
    '',
    'At most five. Better none than one too many - a rule book that writes',
    'everything down is one nobody reads.',
    '',
    'One sentence per rule, in the imperative, with an example from the foreign',
    'language. Write them in ' + into + '. No numbering, no preamble.',
    '',
    'Answer with the rules between these marks, one per line:',
    '',
    OPEN,
    '- ...',
    CLOSE,
    '',
    'If there is nothing new, leave the space between the marks empty.'
  ].join('\n');

  const input = [
    'RULES IN FORCE',
    '',
    (options.rules || '(none yet)').trim(),
    '',
    'DECISIONS MADE WHILE PREPARING THIS TEXT',
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
    '--append-system-prompt', wordInstructions(options),
    '--allowedTools', 'Read,Glob,Grep'
  ];
  if (options.folder) args.push('--add-dir', options.folder);

  const lines = ['Write one entry for each of these keys.', ''];
  for (const entry of options.entries) {
    lines.push('## ' + entry.key);
    lines.push('Base form used in the text: ' + entry.lemma);
    lines.push('Part of speech: ' + entry.partOfSpeech);
    if (entry.forms.length) lines.push('Forms in the text: ' + entry.forms.join(', '));
    if (entry.glosses.length) lines.push('Glosses in the text: ' + entry.glosses.join(', '));
    if (entry.sentence) lines.push('Example sentence: ' + entry.sentence);
    lines.push('');
  }

  const result = await run(options.command, args, {
    cwd: options.temp,
    input: lines.join('\n'),
    timeoutMs: TIMEOUT_MS
  });

  if (result.code === -2) throw new Error('Claude did not answer within five minutes.');
  if (result.code !== 0) {
    throw new Error(whyNot(result));
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

/* Der eingebaute Grundbauplan. Er gilt, solange für eine Sprache nichts
   aus dem Repo geholt werden konnte - offline zum Beispiel. Die
   ausführlichen Fassungen je Sprache liegen unter schemas/word-notes/. */
const DEFAULT_RECIPE = [
  '# What a word description contains',
  '',
  'One recipe per part of speech, so that a description does not come out',
  'better or worse by accident.',
  '',
  '## Shape',
  '',
  'Two or three **labelled lines**, then at most two sentences of remark.',
  'Labels in bold, the value on the same line, forms separated by `·`.',
  'Leave a line out when the language does not have that category - never',
  'write "none" or "not applicable".',
  '',
  '## Per part of speech',
  '',
  '**NOUN** - gender with its article; plural; the indefinite article.',
  '**PROPN** - pronunciation only, and only if there is something to say.',
  '**VERB** - the base form; the full present tense, all persons; one past',
  'form as it is actually used; which pattern it follows.',
  '**AUX** - the full present tense.',
  '**ADJ** - every form the language distinguishes; where it stands.',
  '**ADV** - whether it changes; where it stands.',
  '**PRON** - the whole series it belongs to; one example with translation.',
  '**DET** - the whole series; elision or contraction.',
  '**ADP** - one example per meaning, each with its translation.',
  '**NUM** - how it is spoken, binding or sound changes.',
  '**CCONJ**, **SCONJ** - what it joins, and one example.',
  '**PART** - what it does, and one example.',
  '**INTJ** - when it is said, and how formal it is.',
  '**PHRASE** - what it says literally, and when it is used.',
  '',
  '## Always',
  '',
  '- Name what the word is confused with, when there is such a partner.',
  '- Leave out: the meaning again, examples without a point, textbook',
  '  prose, etymology.'
].join('\n');

module.exports = {
  available, check, locate, prepare, words, learnRules, instructions,
  tempDir, MODEL, DEFAULT_RECIPE
};
