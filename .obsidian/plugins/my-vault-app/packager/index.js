"use strict";

/*
 * Der Packager - macht aus beliebigen Texten Lernpakete.
 *
 * Der Weg eines Textes:
 *
 *   text.md   Das Original, unverändert. Wird kopiert, nie abgetippt.
 *   work.md   Die Werkbank: Sätze, Wörter, Glossen - reines Sprachwissen.
 *   words/    Der Wortvorrat der Sprache. Wächst mit jedem Text.
 *             → package.json  wird daraus gerechnet, nie von Hand geschrieben.
 *
 * Und dann durch die Vordertür: Ein fertiges Paket geht denselben Weg in
 * die Bibliothek wie ein Paket von einem Fremden - durch den Import und
 * damit durch die Prüfung. Es gibt keine Abkürzung, und das ist Absicht:
 * Was hier nicht durchkommt, käme beim Empfänger auch nicht durch.
 */

const { ItemView, Modal, Notice, Platform, Setting, TFile, TFolder, normalizePath, requestUrl } = require('obsidian');
const { parseWork, splitNote, buildPackage, nameFor } = require('./build.js');
const { keyFor } = require('../core/package.js');
const store = require('./dictionary.js');
const { sanitizeFileName, yamlValue, KNOWN_LANGUAGES } = require('../core/library.js');
const ai = require('./ai.js');
const audio = require('./audio.js');

const VIEW_TYPE = 'trisent-packager-view';
const RIBBON_ICON = 'package-plus';

const WORK_FILE = 'work.md';
const TEXT_FILE = 'text.md';
const PACKAGE_FILE = 'package.json';
const WORDS_DIR = 'words';
const DICTIONARY_FILE = 'dictionary.json';

/* Die Nummer des Bauplans, nach dem heute Beschreibungen entstehen.
   Später steht sie im Bauplan selbst (meta/schema.md); bis dahin hier.
   Alte Beschreibungen aus der Zeit davor zählen als 0 und werden so von
   jeder neueren Fassung abgelöst. */
const RECIPE_SCHEMA = 1;
const AUDIO_DIR = 'audio';
/* Die Zeitmarken je Satz. Bleiben in der Werkstatt - im Paket stehen
   sie fertig ausgerechnet an den Sätzen, nicht als Rohdaten daneben. */
const TIMING_DIR = 'timing';
const RULES_FILE = 'rules.md';
/* Der Bauplan für Wortbeschreibungen: was je Wortart darin stehen muss.
   Liegt als Notiz beim Sprachordner - abgeholt aus dem Repo, sobald eine
   Sprache zum ersten Mal verpackt wird, und danach die der Person. */
const RECIPE_FILE = 'word-notes.md';
/* Das Repo als Quelle vorbereiteter Regelwerke. Geholt wird von "main",
   nicht von einem Release: Was wir dort einarbeiten, steht damit sofort
   jedem Packager zur Verfügung, ohne dass jemand das Plugin erneuert. */
const SCHEMA_URL =
  'https://raw.githubusercontent.com/ralfw-vibe-coding-obsidian/Trisent/main/schemas/';
/* Die Vorlage, aus der die Hausregeln einer neuen Sprache entstehen.
   Sie liegt als Notiz da, damit die Person sie ändern kann. */
const TEMPLATE_FILE = 'rules-template.md';

/* Wie viele Absätze gleichzeitig aufbereitet werden.

   Nebeneinander statt nacheinander ändert an der Qualität nichts: Jeder
   Absatz bekommt denselben Aufruf mit demselben Wortvorrat, denselben
   Hausregeln und derselben Nachprüfung. Was sich ändert, ist allein die
   Wartezeit.

   Warum nicht alle auf einmal: Jeder Aufruf ist ein eigenes Programm mit
   eigenem Speicher, und der Dienst dahinter nimmt nicht beliebig viele
   Anfragen gleichzeitig an. Bei zwanzig Absätzen gleichzeitig kämen die
   ersten Absagen zurück, statt dass es schneller würde. Acht ist die
   Grenze, an der die Wartezeit noch spürbar sinkt und nichts kippt. */
const AT_ONCE = 8;

/* Wie lange nach einer Absage gewartet wird, bevor es noch einmal
   versucht wird. */
const RETRY_MS = 4000;

/* Was der Packager sich merkt. Liegt in data.json unter "packager".

   Von Haus aus ist er AUS. Die meisten, die Trisent benutzen, lesen nur -
   für sie wäre die Werkstatt ein zweites Symbol in der Leiste, das sie
   nie brauchen. Wer Texte herstellt, schaltet sie einmal ein.

   "sent" hält fest, welche Fassung eines Pakets schon abgeliefert wurde -
   je Paketkennung. Der Packager schaut dafür nicht in die Bibliothek der
   Person; er merkt es sich an seinen eigenen Sachen. */
const DEFAULTS = {
  enabled: false,
  sent: {},
  claudePath: 'claude',
  /* Fingerabdruck der abgelegten Regelwerke, je Pfad - damit das
     Auffrischen eine Notiz in Ruhe lässt, die die Person geändert hat. */
  schemas: {},
  /* Die Sprache der Person: in ihr stehen Glossen, Übersetzungen und
     Grammatiknotizen. Sie steckte früher fest im Programm - damit konnte
     nur lernen, wer Deutsch spricht. */
  myLanguage: 'de',
  /* Der Zugangsschlüssel des Sprachdienstes. Bleibt hier und wandert nie
     in ein Paket - ein Paket geht an Fremde. */
  speechKey: '',
  /* Stimmen, unter denen beim Vertonen gewählt wird: Sprache, Name, Id. */
  voices: []
};

/* Hausregeln für eine Sprache, die es noch nicht gab.

   Bewusst unvollständig: Was hier steht, gilt für jede Sprache. Alles
   Sprachtypische - wie Verschmelzungen, Elisionen und Eigennamen
   behandelt werden - entscheidet sich am ersten Text, und dann gehört
   es hier hinein. Ohne diese Datei entscheidet jeder Lauf neu, und der
   Lernstand zerfällt still in zwei Hälften. */
/* Die Vorlage für die Hausregeln einer Sprache, die es noch nicht gab.

   Sie liegt als Notiz in der Werkstatt, damit die Person bestimmen kann,
   womit eine neue Sprache anfängt. Fehlt sie, wird sie aus dem Text hier
   wiederhergestellt - verloren gehen kann sie also nicht.

   Drei Platzhalter werden beim Abschreiben ersetzt:
   {{LANGUAGE}}, {{language}} und {{yourLanguage}}. */
function templateBody() {
  return [
    '# House rules: {{LANGUAGE}}',
    '',
    'Decisions that hold for **every** text in this language. They keep the',
    'knowledge keys together: only if the same word form always gets the same',
    'base form and part of speech does a word learned once still count in the',
    'next text.',
    '',
    'Glosses and translations are written in **{{yourLanguage}}**.',
    '',
    'This list grows. Whatever had to be decided while preparing a text and is',
    'not written here yet belongs here - otherwise it is decided again next',
    'time, and perhaps differently.',
    '',
    '## Base forms',
    '',
    '1. Verbs carry their base form, not the form from the sentence. Where a',
    '   language has no infinitive, pick one form and keep to it.',
    '2. Names: base form as written, the gloss is the name itself.',
    '3. Plural shares the key with the singular; the gloss shows the plural.',
    '4. The base form of a determiner, pronoun or preposition is that word',
    '   itself - never the word next to it. "la mesa" gives "la" the base form',
    '   of its own article series, not "mesa".',
    '',
    '## Glossing',
    '',
    '5. Articles and determiners follow the gender of the **foreign** language,',
    '   not of your own. That is on purpose - this layer shows how the foreign',
    '   language is built.',
    '6. Grammar hidden inside a word ending must become visible in the gloss.',
    '7. If a single word of your language does not exist, hyphenate: never two',
    '   words with a space.',
    '',
    '## Phrases',
    '',
    '8. Take in polite formulas, grammatical constructions and fixed terms -',
    '   not ordinary word sequences. When in doubt, leave it out.',
    '9. The base form of a phrase is the **citation form**, not the form from',
    '   the sentence: lower case, straight apostrophe.',
    '',
    '## What belongs in a grammar note',
    '',
    "A word's note should not come out better or worse by accident, depending",
    'on which text the word first appeared in. One to three sentences, and the',
    'same frame per part of speech. To start with:',
    '',
    '| Part of speech | What belongs in it |',
    '|---|---|',
    '| NOUN | Gender, plural when irregular, fixed combinations |',
    '| VERB | Regular or irregular, the forms that matter, what follows it |',
    '| ADJ | Forms that differ, position when unusual |',
    '| DET, PRON | The series of forms, position in the sentence |',
    '| ADP | What follows, contractions |',
    '| PROPN | Pronunciation only |',
    '| PHRASE | What it literally says, and when it is used |',
    '',
    'Always mention **what the word is confused with**, when there is such a',
    'partner.',
    '',
    'Do not write: the gloss again, examples without a point, textbook prose,',
    'etymology.',
    '',
    'This table fits every language only roughly. Sharpen it as soon as you see',
    'what really matters in this one.',
    ''
  ].join('\n');
}

/* Aus der Vorlage die Regeln einer bestimmten Sprache machen. */
function fillTemplate(body, code, into) {
  return [
    '---',
    'type: packager-rules',
    'language: ' + code,
    '---',
    '',
    String(body)
      .replace(/\{\{LANGUAGE\}\}/g, code.toUpperCase())
      .replace(/\{\{language\}\}/g, code)
      .replace(/\{\{yourLanguage\}\}/g, into || 'German')
      .replace(/^\s+/, '')
  ].join('\n');
}

/* Ein kurzer Fingerabdruck eines Textes. Reicht, um zu erkennen, ob
   jemand eine Notiz angefasst hat - mehr soll er nicht. */
function fingerprint(text) {
  let a = 0x811c9dc5;
  const clean = String(text).replace(/\s+/g, ' ').trim();
  for (let i = 0; i < clean.length; i++) {
    a = Math.imul(a ^ clean.charCodeAt(i), 16777619) >>> 0;
  }
  return a.toString(16) + ':' + clean.length;
}

/* Regelwerk und Bauplan sind kein Lesestoff, liegen aber im selben
   Ordner. Am Namen allein ist das nicht zu erkennen - das Auffrischen
   legt eine zweite Fassung mit anderem Namen daneben -, im Kopf der
   Notiz schon. */
function isSchemaNote(file, raw) {
  const name = String(file.name).toLowerCase();
  if (name === RULES_FILE || name === RECIPE_FILE) return true;
  const type = splitNote(raw).front.type;
  return typeof type === 'string' && type.indexOf('packager-') === 0;
}

/* Aus einem Ordnernamen eine Kennung machen: klein, ohne Sonderzeichen. */
function slug(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'text';
}

/* Zwei Pakete sind dasselbe, wenn sie sich nur in der Fassungsnummer
   unterscheiden. */
function same(one, other) {
  const strip = (data) => {
    const copy = Object.assign({}, data);
    delete copy.version;
    return JSON.stringify(copy);
  };
  return strip(one) === strip(other);
}

/* Woran ein Bericht und ein laufender Vorgang hängen. Eine lose Notiz
   hat noch keinen eigenen Ordner, also dient sie selbst als Kennung -
   sonst teilten sich zwei Notizen derselben Sprache einen Platz.

   Wichtig: Diese Kennung darf sich WÄHREND eines Laufs nicht ändern.
   Die Notiz wird ja gleich zu Beginn in ihren Ordner einsortiert - würde
   sie danach anders heißen, fände die Ansicht den laufenden Vorgang nicht
   mehr, zeichnete den Knopf wieder anklickbar, und ein zweiter Klick
   startete einen zweiten Lauf neben dem ersten. */
function keyOf(text) {
  return text.loose ? text.loose.path : text.folder.path;
}

/* Die vier Schritte eines Textes, und wann welcher an der Reihe ist.

   Alle vier stehen immer da; wer nicht dran ist, ist abgeblendet und sagt
   beim Darauffahren, warum. So sieht man auf einen Blick, wo ein Text
   steht - statt es aus wechselnden Knöpfen zu erschließen. */
function stepsFor(text, can) {
  const packaged = text.version > 0;
  const stale = packaged && text.workAt > text.packageAt;
  const silent = Math.max(0, text.sentences - text.spoken);

  return [
    {
      name: 'Integrate',
      run: 'integrate',
      on: !!text.loose,
      why: text.loose ? 'Give this note a folder of its own.' : 'Already part of the library folder.'
    },
    {
      name: 'Package',
      run: 'make',
      on: !text.loose && (!packaged || stale || text.done < text.total),
      why: text.loose ? 'Integrate it first.'
        : !can.prepare ? 'Claude was not found - see the settings.'
        : stale ? 'The workbench changed after the last build.'
        : packaged ? 'Nothing has changed since the last build.'
        : 'Turn the text into a package.'
    },
    {
      name: 'Record',
      run: 'speak',
      on: !text.loose && packaged && !stale && silent > 0 && can.voices,
      why: !packaged ? 'Make the package first.'
        : !can.voices ? 'No voice for this language in the settings.'
        : stale ? 'Build the package again first.'
        : silent === 0 ? 'Every sentence already has sound.'
        : silent + ' of ' + text.sentences + ' sentences have no sound yet.'
    },
    {
      name: 'Deploy',
      run: 'send',
      on: !text.loose && packaged && !stale && text.sent < text.version,
      why: !packaged ? 'Make the package first.'
        : stale ? 'Build the package again first.'
        : text.sent >= text.version ? 'Your library already has this version.'
        : 'Send it to your library.'
    }
  ];
}

/* Woran man mit einem Text ist - in einem Satz, nicht in Kästchen. */
function stateOf(text) {
  if (text.loose) return 'Dropped in. Integrate it to get started.';

  const sound = text.sentences > 0 && text.spoken >= text.sentences
    ? ' With sound.'
    : text.spoken > 0 ? ' Sound for ' + text.spoken + ' of ' + text.sentences + ' sentences.' : '';

  if (!text.version) return 'Not packaged yet.';
  if (text.workAt > text.packageAt) {
    return 'The workbench changed after the last build — package it again.' + sound;
  }
  if (!text.sent) return 'Packaged, not in your library yet.' + sound;
  if (text.sent < text.version) {
    return 'Version ' + text.version + ' here, version ' + text.sent +
           ' in your library.' + sound;
  }
  return 'In your library, version ' + text.version + '.' + sound;
}

/* Wörter eines Textes. Grob gezählt - es geht um die Größenordnung,
   nicht um Genauigkeit: Wie lang ist dieser Text, verglichen mit dem
   daneben. */
function countWords(text) {
  const matches = String(text).match(/[^\s]+/g);
  if (!matches) return 0;
  return matches.filter((piece) => /[\p{L}\p{N}]/u.test(piece)).length;
}

/* Absätze eines Rohtextes: getrennt durch Leerzeilen, so wie man sie
   beim Lesen sieht. */
function paragraphsOf(text) {
  return String(text)
    .split(/\r?\n\s*\r?\n/)
    .map((piece) => piece.trim())
    .filter((piece) => piece !== '');
}

/* ------------------------------------------------------------------ */
/* Ein neuer Text                                                      */
/* ------------------------------------------------------------------ */

/* Titel, Sprache, Text einsetzen - und los. Der Text wird eingefügt und
   nicht abgetippt; damit kommen typografische Apostrophe und geschützte
   Leerzeichen unversehrt an, und genau darauf beruht später jede
   Wortposition. */
class NewTextModal extends Modal {
  constructor(app, packager, onReady) {
    super(app);
    this.packager = packager;
    this.onReady = onReady;
    this.title = '';
    this.code = '';
    this.body = '';
  }

  onOpen() {
    const { contentEl } = this;
    /* Bewusst NICHT trisent-view: Das ist das Gerüst einer ganzen Seite -
       feste Leiste, eigener Rollbereich, begrenzte Spaltenbreite. In
       einem Dialog schnürt es alles zusammen. Hier steht der Stil für
       sich. */
    this.modalEl.addClass('trisent-modal');
    contentEl.addClass('trisent-newtext');

    contentEl.createEl('h2', { text: 'New text' });

    const titleInput = this.field(contentEl, 'Title', 'input',
      'In the foreign language, the way you want to see it in your library.');
    titleInput.placeholder = 'Un dimanche à Paris';
    titleInput.addEventListener('input', () => { this.title = titleInput.value.trim(); });

    const select = this.field(contentEl, 'Language', 'select', '');
    for (const choice of this.packager.languageChoices()) {
      select.createEl('option', { value: choice.code, text: choice.label });
    }
    this.code = select.value || '';
    select.addEventListener('change', () => { this.code = select.value; });

    const area = this.field(contentEl, 'Text', 'textarea',
      'Paste it in - a blank line between paragraphs.');
    area.addEventListener('input', () => { this.body = area.value; });

    const actions = contentEl.createDiv({ cls: 'trisent-newtext-actions' });
    actions.createEl('button', { text: 'Cancel' })
      .addEventListener('click', () => this.close());
    const start = actions.createEl('button', { cls: 'mod-cta', text: 'Add text' });
    start.addEventListener('click', () => this.submit(start));

    window.setTimeout(() => titleInput.focus(), 0);
  }

  /* Beschriftung, Hinweis, Feld - untereinander, volle Breite. */
  field(parent, label, kind, hint) {
    const wrap = parent.createDiv({ cls: 'trisent-newtext-field' });
    wrap.createEl('label', { text: label });
    if (hint) wrap.createDiv({ cls: 'trisent-newtext-hint', text: hint });
    return wrap.createEl(kind, kind === 'input' ? { type: 'text' } : {});
  }

  async submit(button) {
    if (!this.title) { new Notice('The text needs a title.', 5000); return; }
    if (!this.body.trim()) { new Notice('There is no text yet.', 5000); return; }
    if (!this.code) { new Notice('Pick a language.', 5000); return; }

    button.disabled = true;
    button.setText('Adding…');
    try {
      const folder = await this.packager.addText(this.code, this.title, this.body);
      this.close();
      this.onReady(folder.path);
    } catch (error) {
      console.error('Trisent packager', error);
      button.disabled = false;
      button.setText('Add text');
      new Notice(String(error.message || error), 10000);
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

/* Welche Stimme soll diesen Text sprechen?

   Dieselbe Form wie der Dialog für einen neuen Text: Beschriftung oben,
   Feld über die volle Breite, Knöpfe unten rechts. */
class VoiceModal extends Modal {
  constructor(app, voices, onPick) {
    super(app);
    this.voices = voices;
    this.onPick = onPick;
  }

  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass('trisent-modal');
    contentEl.addClass('trisent-newtext');

    contentEl.createEl('h2', { text: 'Add audio' });

    const wrap = contentEl.createDiv({ cls: 'trisent-newtext-field' });
    wrap.createEl('label', { text: 'Voice' });
    wrap.createDiv({
      cls: 'trisent-newtext-hint',
      text: 'Every sentence will be spoken by this voice.'
    });

    const select = wrap.createEl('select');
    for (const voice of this.voices) {
      select.createEl('option', {
        value: voice.id,
        text: voice.language.toUpperCase() + ' · ' + (voice.name || voice.id)
      });
    }

    const actions = contentEl.createDiv({ cls: 'trisent-newtext-actions' });
    actions.createEl('button', { text: 'Cancel' })
      .addEventListener('click', () => this.close());
    const start = actions.createEl('button', { cls: 'mod-cta', text: 'Speak' });
    start.addEventListener('click', () => {
      const voice = this.voices.find((one) => one.id === select.value) || this.voices[0];
      this.close();
      this.onPick(voice);
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

/* ------------------------------------------------------------------ */
/* Die Ansicht                                                         */
/* ------------------------------------------------------------------ */

class PackagerView extends ItemView {
  constructor(leaf, packager) {
    super(leaf);
    this.packager = packager;
    /* Berichte der letzten Bauvorgänge, nach Ordnerpfad. */
    this.reports = new Map();
    /* Was in der Werkstatt liegt. Wird gelesen, bevor gezeichnet wird -
       die Fassung eines Pakets steht in einer Datei, und Lesen dauert. */
    this.model = [];
    /* Texte, an denen gerade gearbeitet wird, mit ihrem Zwischenstand.
       Ohne das entstünde der Knopf beim nächsten Neuzeichnen wieder
       anklickbar - und ein zweiter Lauf hängte alles ein zweites Mal an. */
    this.running = new Map();
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Packager'; }
  getIcon() { return RIBBON_ICON; }

  async onOpen() { await this.refresh(); }

  async refresh() {
    try {
      this.model = await this.packager.survey();
    } catch (error) {
      console.error('Trisent packager', error);
      this.model = [];
    }
    this.render();
  }

  /* Ein Fehler beim Aufbau darf keine weiße Fläche hinterlassen - dann
     stünde die Person vor einer Ansicht, über die sie nichts sagen kann. */
  render() {
    const root = this.contentEl;
    /* Wo die Person gerade liest, bleibt erhalten. Sonst springt die
       Ansicht bei jedem Zwischenstand an den Anfang zurück. */
    const at = this.scrollEl ? this.scrollEl.scrollTop : 0;

    root.empty();
    root.addClass('trisent-view');

    this.scrollEl = root.createDiv({ cls: 'trisent-scroll' });
    const page = this.scrollEl.createDiv({ cls: 'trisent-page' });
    try {
      this.renderBody(page);
    } catch (error) {
      console.error('Trisent packager', error);
      page.createDiv({ cls: 'trisent-problem', text: String(error.message || error) });
    }

    if (at > 0) this.scrollEl.scrollTop = at;
  }

  renderBody(page) {
    const head = page.createDiv({ cls: 'trisent-pack-head' });
    head.createEl('h1', { text: 'Packager' });
    const add = head.createEl('button', { cls: 'mod-cta', text: 'New text' });
    add.addEventListener('click', () => this.newText());

    const languages = this.model;
    if (languages.length === 0) {
      page.createEl('p', {
        cls: 'trisent-lead',
        text: 'Nothing here yet. A text belongs in ' +
              this.packager.rootPath + '/<LANGUAGE>/<name>/, as text.md and work.md.'
      });
      return;
    }

    page.createEl('p', {
      cls: 'trisent-lead',
      text: 'Texts become packages here. A finished package goes to the library through the import, the same way a package from someone else would.'
    });

    for (const language of languages) this.renderLanguage(page, language);
  }

  renderLanguage(page, language) {
    const section = page.createDiv({ cls: 'trisent-pack-language' });

    const head = section.createDiv({ cls: 'trisent-pack-language-head' });
    head.createSpan({ cls: 'trisent-pack-code', text: language.code.toUpperCase() });
    head.createSpan({
      cls: 'trisent-pack-count',
      text: language.words + (language.words === 1 ? ' word' : ' words') +
            (language.rules ? ' · house rules' : ' · no house rules yet')
    });

    if (language.texts.length === 0) {
      section.createDiv({ cls: 'trisent-pack-empty', text: 'No texts yet.' });
      return;
    }

    for (const text of language.texts) this.renderText(section, language, text);
  }

  renderText(section, language, text) {
    const row = section.createDiv({ cls: 'trisent-pack-text' });

    const title = row.createDiv({ cls: 'trisent-pack-title' });
    title.createSpan({ cls: 'trisent-pack-name', text: text.title || text.folder.name });
    if (text.words > 0) {
      title.createSpan({ cls: 'trisent-pack-size', text: '(' + text.words + ' words)' });
    }
    /* Der Zustand in einem Satz. Vorher standen hier zwei Kästchen und
       eine wechselnde Knopfbeschriftung - drei Teile, aus denen man sich
       selbst zusammenreimen musste, woran man ist. */
    row.createDiv({ cls: 'trisent-pack-state', text: stateOf(text) });

    const actions = row.createDiv({ cls: 'trisent-pack-actions' });
    const busy = this.running.get(keyOf(text));
    const can = {
      prepare: this.packager.canPrepare(),
      voices: this.packager.voicesFor(text.code).length > 0
    };

    for (const step of stepsFor(text, can)) {
      const button = actions.createEl('button', {
        cls: step.on && !busy ? 'mod-cta' : '',
        text: busy && busy.step === step.run ? busy.label : step.name
      });
      button.title = step.why;

      if (busy || !step.on) {
        button.disabled = true;
        continue;
      }
      button.addEventListener('click', () => this[step.run](text));
    }

    const report = this.reports.get(keyOf(text));
    if (report) this.renderReport(row, report);
  }

  renderReport(row, report) {
    const box = row.createDiv({ cls: 'trisent-pack-report' });

    if (report.kind === 'ok') {
      box.createDiv({ cls: 'trisent-pack-good', text: report.headline });
      box.createDiv({ cls: 'trisent-pack-detail', text: report.detail });
      return;
    }

    box.createDiv({ cls: 'trisent-pack-bad', text: report.headline });
    const list = box.createEl('ul', { cls: 'trisent-pack-list' });
    for (const line of report.lines) list.createEl('li', { text: line });
    if (report.more > 0) {
      box.createDiv({ cls: 'trisent-pack-detail', text: 'and ' + report.more + ' more.' });
    }
  }

  /* Neuer Text: Dialog auf, Text ablegen, Übersicht auffrischen. Das
     Paketieren stößt die Person selbst an - dann sieht sie auch, an
     welchem Text gearbeitet wird. */
  newText() {
    new NewTextModal(this.app, this.packager, async () => {
      await this.refresh();
    }).open();
  }

  /* Alle vier Schritte laufen gleich ab: sperren, arbeiten, berichten,
     auffrischen. Was sie unterscheidet, steckt in "work".

     Ein langer Text braucht einige Minuten - solange steht auf dem Knopf,
     woran gerade gearbeitet wird. */
  async run(text, name, first, work) {
    const path = keyOf(text);
    if (this.running.has(path)) return;

    this.running.set(path, { step: name, label: first });
    this.reports.delete(path);
    this.render();

    const step = (label) => {
      this.running.set(path, { step: name, label: label });
      this.render();
    };

    try {
      this.reports.set(path, await work(step));
    } catch (error) {
      console.error('Trisent packager', error);
      const spent = error.credits
        ? ' Before that, ' + error.written + ' sentences were recorded for ' + error.credits + ' credits.'
        : '';
      this.reports.set(path, {
        kind: 'bad', headline: 'It stopped here.',
        lines: [String(error.message || error) + spent], more: 0
      });
    }

    /* Nach dem Einsortieren heißt der Text anders. Der Bericht wird
       deshalb auch unter dem neuen Namen abgelegt - sonst verschwände er
       mit der nächsten Auffrischung. */
    if (text.filed && text.folder && text.folder.path !== path) {
      this.reports.set(text.folder.path, this.reports.get(path));
    }

    this.running.delete(path);
    await this.refresh();
  }

  integrate(text) {
    return this.run(text, 'integrate', 'Filing it away…', async () => {
      await this.packager.fileAway(text);
      return { kind: 'ok', headline: 'Filed away. Package it next.', detail: '' };
    });
  }

  make(text) {
    return this.run(text, 'make', 'Starting…', (step) => this.packager.makePackage(text, step));
  }

  /* Vertonen: Stimme wählen, sprechen lassen, neu bauen - der Ton gehört
     ins Paket, also muss es danach neu entstehen. */
  speak(text) {
    new VoiceModal(this.app, this.packager.voicesFor(text.code), (voice) =>
      this.run(text, 'speak', 'Recording audio…', (step) =>
        this.packager.speak(text, voice, step)
      )
    ).open();
  }

  send(text) {
    return this.run(text, 'send', 'Sending…', async () => {
      const said = await this.packager.send(text);
      return { kind: 'ok', headline: said, detail: '' };
    });
  }
}

/* ------------------------------------------------------------------ */
/* Der Packager                                                        */
/* ------------------------------------------------------------------ */

class Packager {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;

    /* Der Packager ist Werkstatt, nicht Lesesaal. Wer nur liest, soll
       ihn gar nicht erst sehen - und auf dem Handy kann er ohnehin nicht
       arbeiten, weil er dort kein Programm starten kann. */
    if (!this.visible()) return;

    plugin.registerView(VIEW_TYPE, (leaf) => new PackagerView(leaf, this));
    plugin.addRibbonIcon(RIBBON_ICON, 'Trisent: Packager', () => this.open());
    plugin.addCommand({
      id: 'open-packager',
      /* Obsidian stellt den Namen der App voran: "Trisent: Packager" -
         genauso wie "Trisent: Reading" und "Trisent: Translation". */
      name: 'Packager',
      callback: () => this.open()
    });

    /* Legt die Person eine Notiz in einen Sprachordner, während die
       Werkstatt offen ist, soll sie dort auftauchen - ohne dass erst
       jemand die Ansicht schließt und wieder öffnet. */
    const changed = () => this.scheduleRefresh();
    plugin.registerEvent(this.app.vault.on('create', changed));
    plugin.registerEvent(this.app.vault.on('delete', changed));
    plugin.registerEvent(this.app.vault.on('rename', changed));
  }

  /* Beim Aufbereiten entstehen laufend Dateien. Währenddessen wird nicht
     nachgelesen: Die Ansicht zeigt ohnehin den Fortschritt, und ein
     Neuaufbau mittendrin würde ihn nur zerreißen. */
  scheduleRefresh() {
    window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
        const view = leaf.view;
        if (!view || typeof view.refresh !== 'function') continue;
        if (view.running && view.running.size > 0) continue;
        view.refresh();
      }
    }, 500);
  }

  /* Auf dem Handy immer aus - unabhängig vom Schalter. Der steht in den
     Einstellungen und wandert damit über die Geräte hinweg mit; ihn dort
     umzulegen, würde sonst auch den Rechner treffen. */
  visible() {
    if (Platform.isMobile) return false;
    return this.settings.enabled !== false;
  }

  get settings() { return this.plugin.settings.packager; }
  saveSettings() { return this.plugin.saveSettings(); }

  /* Der eigene Bereich. In den des Readers wird nie geschrieben. */
  get rootPath() {
    const base = (this.plugin.settings.libraryFolder || '').trim();
    return normalizePath((base ? base + '/' : '') + 'packager');
  }

  folder(path) {
    const found = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return found instanceof TFolder ? found : null;
  }

  file(path) {
    const found = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return found instanceof TFile ? found : null;
  }

  /* ---------------------------------------------------------------- */
  /* Was in der Werkstatt liegt                                        */
  /* ---------------------------------------------------------------- */

  /* Ein Sprachordner ist ein Ordner, dessen Name ein Sprachkürzel ist.
     Darin: rules.md, words/ und je ein Ordner pro Text. */
  async survey() {
    const root = this.folder(this.rootPath);
    if (!root) return [];

    /* Damit die Vorlage auffindbar ist, ohne dass man erst einen Text
       anlegen muss. */
    if (!this.file(this.rootPath + '/' + TEMPLATE_FILE)) await this.ensureTemplate();

    const result = [];
    for (const child of root.children) {
      if (!(child instanceof TFolder)) continue;
      if (!/^[a-z]{2,3}$/i.test(child.name)) continue;

      result.push({
        code: child.name.toLowerCase(),
        folder: child,
        rules: !!this.file(child.path + '/' + RULES_FILE),
        words: await this.wordCount(child),
        texts: await this.textsOf(child)
      });
    }
    return result.sort((a, b) => a.code.localeCompare(b.code));
  }

  /* Ein Ordner mit einer work.md darin ist ein Text in Arbeit. */
  async textsOf(languageFolder) {
    const result = [];

    /* Eine Notiz, die einfach im Sprachordner liegt, ist ein Text, der
       noch hereinwill. Man kann ihn also auch in Obsidian schreiben und
       hierher schieben, statt ihn in den Dialog einzufügen. */
    for (const child of languageFolder.children) {
      if (!(child instanceof TFile) || child.extension !== 'md') continue;

      const raw = await this.app.vault.cachedRead(child);
      if (isSchemaNote(child, raw)) continue;
      result.push({
        folder: languageFolder,
        loose: child,
        work: null,
        text: null,
        package: null,
        title: child.basename,
        version: 0,
        sent: 0,
        sentences: 0,
        spoken: 0,
        workAt: 0,
        packageAt: 0,
        done: 0,
        total: paragraphsOf(raw).length,
        words: countWords(raw),
        code: languageFolder.name.toLowerCase()
      });
    }

    for (const child of languageFolder.children) {
      if (!(child instanceof TFolder)) continue;
      let work = this.file(child.path + '/' + WORK_FILE);
      if (!work) {
        /* Ein Ordner mit einem Text, aber ohne Werkbank: dort fängt die
           Aufbereitung an. Die Werkbank legen wir beim ersten Absatz an. */
        if (!this.file(child.path + '/' + TEXT_FILE)) continue;
        work = null;
      }

      const built = this.file(child.path + '/' + PACKAGE_FILE);
      const head = built ? await this.headOf(built) : null;
      const front = work ? this.app.metadataCache.getFileCache(work)?.frontmatter : null;
      const source = this.file(child.path + '/' + TEXT_FILE);
      const raw = source ? await this.app.vault.cachedRead(source) : '';

      /* Wie viele Sätze schon eine Tonspur haben. Der Name einer Tondatei
         hängt am Wortlaut des Satzes - ändert sich der Satz, verliert er
         seinen Ton, und das fällt genau hier auf. */
      let sentences = 0;
      let spoken = 0;
      if (work) {
        const sounds = this.audioFiles(child);
        for (const paragraph of parseWork(await this.app.vault.cachedRead(work)).paragraphs) {
          for (const sentence of paragraph.sentences) {
            sentences += 1;
            if (sounds.has(nameFor(sentence.source))) spoken += 1;
          }
        }
      }

      result.push({
        folder: child,
        work: work,
        text: source,
        package: built,
        title: (front && front.title) || child.name,
        version: head ? head.version : 0,
        sent: head ? this.sentVersion(head.id, child.path) : 0,
        done: work ? parseWork(await this.app.vault.cachedRead(work)).paragraphs.length : 0,
        sentences: sentences,
        spoken: spoken,
        /* Woran man erkennt, dass das Paket veraltet ist: Die Werkbank
           wurde nach dem Bauen angefasst. */
        workAt: work ? work.stat.mtime : 0,
        packageAt: built ? built.stat.mtime : 0,
        total: source ? paragraphsOf(raw).length : 0,
        words: countWords(raw),
        code: languageFolder.name.toLowerCase()
      });
    }
    return result;
  }

  /* Kennung und Fassung stehen im gebauten Paket selbst. */
  async headOf(file) {
    try {
      const data = JSON.parse(await this.app.vault.cachedRead(file));
      return {
        id: String(data.id || ''),
        version: Number.isFinite(data.version) ? data.version : 0
      };
    } catch (error) {
      return { id: '', version: 0 };
    }
  }

  /* Welche Fassung dieses Pakets der Packager schon abgeliefert hat.
     Seine eigene Erinnerung - drüben in der Bibliothek schaut er nicht
     nach.

     Gemerkt wird an der Kennung des Pakets, nicht am Ordnerpfad: Wer
     einen Text umbenennt oder einsortiert, hat ihn deshalb nicht neu
     abzuliefern. Alte Einträge stehen noch unter dem Pfad - die gelten
     weiter, bis das Paket das nächste Mal hinübergeht. */
  sentVersion(id, folderPath) {
    const book = this.settings.sent || {};
    return book[id] || book[folderPath] || 0;
  }

  /* ---------------------------------------------------------------- */
  /* Einen Text aufnehmen                                              */
  /* ---------------------------------------------------------------- */

  /* Sprachen zur Auswahl: was in der Werkstatt schon liegt, davor - der
     Rest als Angebot, damit auch in einer leeren Vault angefangen werden
     kann. */
  languageChoices() {
    const here = new Set();
    const root = this.folder(this.rootPath);
    if (root) {
      for (const child of root.children) {
        if (child instanceof TFolder && /^[a-z]{2,3}$/i.test(child.name)) {
          here.add(child.name.toLowerCase());
        }
      }
    }

    const known = new Map(KNOWN_LANGUAGES.map((entry) => [entry.code, entry]));
    const choices = [];
    for (const code of Array.from(here).sort()) {
      const entry = known.get(code);
      choices.push({ code: code, label: entry ? entry.flag + ' ' + entry.name : code.toUpperCase() });
    }
    for (const entry of KNOWN_LANGUAGES) {
      if (here.has(entry.code)) continue;
      choices.push({ code: entry.code, label: entry.flag + ' ' + entry.name + ' (new)' });
    }
    return choices;
  }

  /* Aus einer losen Notiz einen Textordner machen. Der Inhalt wird nicht
     angefasst - nur verschoben und umbenannt. */
  async fileAway(text) {
    const note = text.loose;
    const base = this.languagePath(text.code);
    await this.ensureRules(text.code);

    const folder = await this.ensureFolder(
      this.freeFolderPath(base, sanitizeFileName(note.basename))
    );
    await this.app.fileManager.renameFile(note, folder.path + '/' + TEXT_FILE);

    /* Die Notiz selbst weiterverwenden, nicht neu nachschlagen: Obsidians
       Verzeichnis kennt den neuen Pfad womöglich noch nicht, und dann
       stünde hier nichts - die Aufbereitung bliebe wortlos stehen.

       "loose" bleibt absichtlich stehen: Daran hängt die Kennung dieses
       Laufs. Dass die Notiz schon einsortiert ist, merkt sich "filed". */
    text.filed = true;
    text.folder = folder;
    text.text = note;
  }

  /* Der Bauplan für die Wortbeschreibungen dieser Sprache.

     Drei Stufen mit Rückfall: die Notiz in der Werkstatt, wenn es sie
     gibt - sonst die Fassung aus dem Repo, die dann als Notiz abgelegt
     wird - sonst der eingebaute Grundbauplan. So gibt es immer einen,
     auch ohne Netz, und wer eine Sprache besser kennt als das Repo,
     ändert einfach die Notiz. */
  async ensureRecipe(code) {
    return this.ensureSchema(code, 'word-notes');
  }

  /* Ein vorbereitetes Regelwerk aus dem Repo holen und als Notiz ablegen.

     Drei Stufen: die Notiz in der Werkstatt, wenn es sie gibt - sonst
     die Fassung aus dem Repo für diese Sprache - sonst die allgemeine
     Fassung von dort - sonst die eingebaute. So gibt es immer eine, auch
     ohne Netz, und wer eine Sprache besser kennt als das Repo, ändert
     einfach die Notiz. */
  async ensureSchema(code, kind) {
    const file = kind === 'rules' ? RULES_FILE : RECIPE_FILE;
    const path = this.languagePath(code) + '/' + file;

    const here = this.file(path);
    if (here) {
      const { body } = splitNote(await this.app.vault.read(here));
      if (body.trim()) return body;
    }

    const fetched = await this.fetchSchema(code, kind);
    const body = fetched || this.builtIn(kind, code);

    await this.ensureFolder(this.languagePath(code));
    await this.put(path, this.schemaNote(code, kind, body, !!fetched));
    this.rememberSchema(path, body);
    return body;
  }

  /* Erst die Sprache, dann die allgemeine Fassung. */
  async fetchSchema(code, kind) {
    for (const name of [String(code).toLowerCase(), 'default']) {
      try {
        const answer = await requestUrl({ url: SCHEMA_URL + kind + '/' + name + '.md', throw: false });
        if (answer.status === 200 && String(answer.text).trim()) return answer.text;
      } catch (error) {
        /* Kein Netz - dann eben die eingebaute Fassung. */
        return '';
      }
    }
    return '';
  }

  /* Was beim Ablegen dringestanden hat. Daran erkennt das Auffrischen
     später, ob die Person die Notiz seither angefasst hat - und hält
     dann die Finger davon. */
  rememberSchema(path, body) {
    if (!this.settings.schemas) this.settings.schemas = {};
    this.settings.schemas[path] = fingerprint(body);
    return this.saveSettings();
  }

  /* Zentral dazugelernte Regeln nachholen.

     Was die Person geändert hat, wird NICHT überschrieben - die neue
     Fassung landet dann als eigene Notiz daneben, und sie entscheidet
     selbst, was sie übernimmt. */
  async refreshSchemas(step) {
    const root = this.folder(this.rootPath);
    if (!root) return { updated: [], kept: [], missing: [] };

    const updated = [];
    const kept = [];
    const missing = [];

    for (const child of root.children) {
      if (!(child instanceof TFolder)) continue;
      if (!/^[a-z]{2,3}$/i.test(child.name)) continue;

      const code = child.name.toLowerCase();
      for (const kind of ['rules', 'word-notes']) {
        if (step) step('Fetching ' + code.toUpperCase() + ' ' + kind + '…');

        const fetched = await this.fetchSchema(code, kind);
        if (!fetched) { missing.push(code.toUpperCase() + ' ' + kind); continue; }

        const file = kind === 'rules' ? RULES_FILE : RECIPE_FILE;
        const path = child.path + '/' + file;
        const note = this.file(path);
        const fresh = this.schemaNote(code, kind, fetched, true);

        if (!note) {
          await this.put(path, fresh);
          await this.rememberSchema(path, fetched);
          updated.push(code.toUpperCase() + ' ' + kind);
          continue;
        }

        const { body } = splitNote(await this.app.vault.read(note));
        const known = (this.settings.schemas || {})[path];
        const touched = !known || known !== fingerprint(body);

        if (touched) {
          await this.put(child.path + '/' + file.replace(/\.md$/, '') + ' (from the repo).md', fresh);
          kept.push(code.toUpperCase() + ' ' + kind);
        } else {
          await this.put(path, fresh);
          await this.rememberSchema(path, fetched);
          updated.push(code.toUpperCase() + ' ' + kind);
        }
      }
    }
    return { updated: updated, kept: kept, missing: missing };
  }

  builtIn(kind, code) {
    return kind === 'rules' ? templateBody() : ai.DEFAULT_RECIPE;
  }

  schemaNote(code, kind, body, fromRepo) {
    const what = kind === 'rules'
      ? 'Wie aus einer Wortform ein Wissensschlüssel wird.'
      : 'Was in der Beschreibung eines Wortes steht, je Wortart.';

    return [
      '---',
      'type: packager-' + kind,
      'language: ' + String(code).toLowerCase(),
      '---',
      '',
      '<!-- ' + what,
      '     ' + (fromRepo ? 'Aus dem Trisent-Repo geholt.' : 'Eingebaute Fassung.'),
      '     Ändere hier, was dir fehlt - diese Notiz gilt, nicht das Repo. -->',
      '',
      fillTemplate(body, code, this.myLanguageName())
        .replace(/^---[\s\S]*?---\n+/, '')
        .trim(),
      ''
    ].join('\n');
  }

  /* Hausregeln, falls die Sprache von Hand angelegt wurde. Ohne sie
     entscheidet jeder Lauf neu - und genau das sollen sie verhindern. */
  async ensureRules(code) {
    if (this.file(this.languagePath(code) + '/' + RULES_FILE)) return;
    await this.ensureSchema(code, 'rules');
  }

  /* Legt Sprachordner, Wortvorrat, Hausregeln und den Textordner an und
     schreibt den Text unverändert hinein. */
  async addText(code, title, body) {
    await this.ensureFolder(this.rootPath);
    const here = this.languagePath(code);
    await this.ensureFolder(here);

    await this.ensureRules(code);

    const folder = await this.ensureFolder(
      this.freeFolderPath(here, sanitizeFileName(title))
    );

    /* Genau das, was eingefügt wurde - nur die Zeilenenden vereinheitlicht
       und der Rand beschnitten. Sonst bleibt jedes Zeichen, wie es ist. */
    const clean = String(body).replace(/\r\n?/g, '\n').trim() + '\n';
    await this.put(folder.path + '/' + TEXT_FILE, clean);

    return folder;
  }

  /* Die Vorlage bereitstellen und zurückgeben. Fehlt die Notiz, wird sie
     aus dem eingebauten Text wiederhergestellt - so kann die Person sie
     ändern, ohne sie verlieren zu können. */
  async ensureTemplate() {
    await this.ensureFolder(this.rootPath);
    const path = this.rootPath + '/' + TEMPLATE_FILE;

    const existing = this.file(path);
    if (existing) {
      const { body } = splitNote(await this.app.vault.read(existing));
      if (body.trim()) return body;
    }

    const fresh = [
      '---',
      'type: packager-rules-template',
      '---',
      '',
      '<!-- Womit eine neue Sprache anfängt. Ändere hier, was jede künftige',
      '     Sprache mitbekommen soll - vorhandene Sprachen bleiben, wie sie sind.',
      '',
      '     {{LANGUAGE}}, {{language}} und {{yourLanguage}} werden beim',
      '     Abschreiben ersetzt. Löschst du diese Notiz, entsteht sie neu. -->',
      '',
      templateBody()
    ].join('\n');

    await this.put(path, fresh);
    return templateBody();
  }

  /* Eine Datei schreiben, gleich ob es sie schon gibt.

     Obsidians Verzeichnis hinkt manchmal hinterher: Eine Datei, die eben
     entstanden oder verschoben wurde, steht dort noch nicht - und dann
     scheitert das Anlegen mit "gibt es schon", obwohl man sie gerade
     nicht finden konnte. Hier wird beides behandelt. */
  async put(path, body) {
    const clean = normalizePath(path);
    const existing = this.file(clean);
    if (existing) {
      await this.app.vault.modify(existing, body);
      return existing;
    }

    try {
      return await this.app.vault.create(clean, body);
    } catch (error) {
      if (!/exist/i.test(String(error.message || error))) throw error;
      const found = this.file(clean);
      if (found) {
        await this.app.vault.modify(found, body);
        return found;
      }
      await this.app.vault.adapter.write(clean, body);
      return this.file(clean);
    }
  }

  /* Dasselbe für Tondateien. */
  async putBinary(path, bytes) {
    const clean = normalizePath(path);
    const existing = this.file(clean);
    if (existing) {
      await this.app.vault.modifyBinary(existing, bytes);
      return;
    }

    try {
      await this.app.vault.createBinary(clean, bytes);
    } catch (error) {
      if (!/exist/i.test(String(error.message || error))) throw error;
      await this.app.vault.adapter.writeBinary(clean, bytes);
    }
  }

  async ensureFolder(path) {
    const clean = normalizePath(path);
    const existing = this.folder(clean);
    if (existing) return existing;

    const parts = clean.split('/');
    let current = '';
    for (const part of parts) {
      current = current ? current + '/' + part : part;
      if (this.app.vault.getAbstractFileByPath(current)) continue;

      try {
        await this.app.vault.createFolder(current);
      } catch (error) {
        /* Auf Mac und Windows ist dem Dateisystem die Groß- und
           Kleinschreibung egal, Obsidians Verzeichnis nicht. Dann gibt es
           den Ordner schon, nur anders geschrieben - das ist kein Fehler,
           es geht einfach dort weiter. */
        if (!/exist/i.test(String(error.message || error))) throw error;
      }
    }
    return this.folder(clean);
  }

  /* Ein freier Ordnername neben den vorhandenen - und zwar unabhängig von
     Groß- und Kleinschreibung, aus demselben Grund. */
  freeFolderPath(parent, name) {
    const taken = new Set();
    const folder = this.folder(parent);
    if (folder) {
      for (const child of folder.children) taken.add(child.name.toLowerCase());
    }

    if (!taken.has(name.toLowerCase())) return parent + '/' + name;
    for (let n = 2; n < 1000; n++) {
      if (!taken.has((name + ' ' + n).toLowerCase())) return parent + '/' + name + ' ' + n;
    }
    return parent + '/' + name + ' ' + Date.now();
  }

  /* ---------------------------------------------------------------- */
  /* Aufbereiten                                                       */
  /* ---------------------------------------------------------------- */

  canPrepare() {
    return ai.available() && !!this.basePath();
  }

  basePath() {
    const adapter = this.app.vault.adapter;
    return adapter && adapter.getBasePath ? adapter.getBasePath() : null;
  }

  /* Der ganze Weg an einem Stück: aufbereiten, fehlende Wörter
     beschreiben, bauen. Was dazwischen passiert, meldet "step" nach
     außen - es steht auf dem Knopf und ist gleich wieder weg. */
  async makePackage(text, step) {
    if (text.loose && !text.filed) {
      throw new Error('This note has not been integrated yet.');
    }

    let done = text.done;

    if (text.total > done) {
      if (!this.canPrepare()) {
        throw new Error('The text is not prepared yet, and Claude was not found. Check the settings.');
      }
      await this.ensureRules(text.code);
      const paragraphs = paragraphsOf(await this.app.vault.read(text.text));
      const open = paragraphs.slice(done);
      const blocks = await this.prepareAll(text, open, step);

      /* Geschrieben wird nur die lückenlose Reihe von vorn. Ein Absatz,
         der nicht durchkam, beendet sie - beim nächsten Klick geht es
         genau dort weiter, statt von vorn. */
      for (const block of blocks.done) {
        await this.appendToWork(text, block, done === 0);
        done += 1;
      }
      if (blocks.error) {
        text.work = this.file(text.folder.path + '/' + WORK_FILE);
        text.done = done;
        throw blocks.error;
      }

      /* Was dabei entschieden wurde, in die Hausregeln - sonst ist es
         nach dem Lauf vergessen und der nächste Text entscheidet neu. */
      if (blocks.notes.length > 0) {
        step('Writing down what was decided…');
        await this.learn(text, blocks.notes);
      }
      /* Die Werkbank gibt es jetzt - und der weitere Weg liest aus ihr. */
      text.work = this.file(text.folder.path + '/' + WORK_FILE);
      text.done = done;
    }

    if (text.total === 0) {
      return {
        kind: 'bad',
        headline: 'There is no text to work with.',
        lines: ['The note seems to be empty.'],
        more: 0
      };
    }

    step('Building…');
    let result = await this.build(text);

    /* Fehlende Wortnotizen sind kein Fehler, sondern der nächste Schritt.
       Also gehen wir ihn gleich mit. */
    if (result.kind === 'missing' && this.canPrepare()) {
      step('Looking up words…');
      const written = await this.writeWords(text, result.entries, step);
      if (written === 0) {
        return {
          kind: 'bad',
          headline: 'No word notes could be written.',
          lines: result.entries.slice(0, 10).map((e) => e.key),
          more: Math.max(0, result.entries.length - 10)
        };
      }
      step('Building…');
      result = await this.build(text);
    }

    if (result.kind === 'missing') {
      return {
        kind: 'bad',
        headline: result.entries.length === 1
          ? 'One word still has no note: the entry that came back did not fit.'
          : result.entries.length + ' words still have no note.',
        lines: result.entries.slice(0, 10).map((e) => e.key),
        more: Math.max(0, result.entries.length - 10)
      };
    }
    return result;
  }

  /* Laufen viele Aufrufe nebeneinander, kommt gelegentlich einer gar
     nicht durch - der Dienst war gerade voll. Das ist keine Aussage über
     den Absatz, also einmal kurz warten und noch einmal fragen. */
  async ask(call) {
    try {
      return await call();
    } catch (error) {
      await new Promise((done) => window.setTimeout(done, RETRY_MS));
      return call();
    }
  }

  /* Mehrere Absätze nebeneinander. Fällt einer durch, hören die anderen
     auf - was hinter der Lücke läge, ließe sich ohnehin nicht anhängen. */
  async prepareAll(text, paragraphs, step) {
    const blocks = new Array(paragraphs.length).fill(null);
    const notes = [];
    let next = 0;
    let finished = 0;
    let error = null;

    const worker = async () => {
      for (;;) {
        const at = next;
        next += 1;
        if (at >= paragraphs.length || error) return;

        try {
          const answer = await this.prepareParagraph(text, paragraphs[at]);
          blocks[at] = answer.block;
          if (answer.notes) notes.push(answer.notes.trim());
        } catch (problem) {
          if (!error) error = problem;
          return;
        }
        finished += 1;
        step('Preparing… ' + Math.round((finished / paragraphs.length) * 100) + '%');
      }
    };

    const workers = [];
    for (let n = 0; n < Math.min(AT_ONCE, paragraphs.length); n++) workers.push(worker());
    await Promise.all(workers);

    const inOrder = [];
    for (const block of blocks) {
      if (!block) break;
      inOrder.push(block);
    }
    return { done: inOrder, error: error, notes: notes };
  }

  /* Einen Absatz aufbereiten lassen und nachrechnen. */
  async prepareParagraph(text, paragraph) {
    const into = this.myLanguageName();
    const here = this.languagePath(text.code);
    const languageFolder = this.basePath() + '/' + here;
    const rules = await this.readIfThere(here + '/' + RULES_FILE);
    const example = await this.exampleFor(text);

    /* Zwei Anläufe: Beim zweiten bekommt Claude die Fundliste des Prüfers
       mit. Das ist der ganze Sinn eines strengen Prüfers - er kann sagen,
       was nicht stimmt, statt nur nein. */
    let answer = null;
    let problems = [];
    /* Drei Anläufe. Der zweite und dritte bekommen die Fundliste des
       Prüfers mit - beim Übergehen eines Satzes steht darin jetzt der
       übergangene Text selbst, und damit lässt sich etwas anfangen. */
    for (let attempt = 1; attempt <= 3; attempt++) {
      answer = await this.ask(() => ai.prepare({
        into: into,
        command: this.settings.claudePath || 'claude',
        temp: ai.tempDir(),
        folder: languageFolder,
        rules: rules,
        example: example,
        paragraph: attempt === 1
          ? paragraph
          : paragraph + '\n\nYour previous attempt had these problems:\n- ' +
            problems.slice(0, 10).join('\n- ') +
            '\n\nEvery sentence of the paragraph must appear, in order, copied exactly.'
      }));

      problems = this.checkBlock(answer.block, paragraph, text.code);
      if (problems.length === 0) break;
    }

    if (problems.length > 0) {
      throw new Error(
        'One paragraph did not come back clean, three times in a row: ' +
        problems.slice(0, 3).join(' / ')
      );
    }
    return answer;
  }

  /* Neue Hausregeln an die Regeldatei anhängen - in einen eigenen
     Abschnitt, datiert und mit dem Text, aus dem sie stammen. Oben
     umgeschrieben wird nichts: Was die Person dort einmal festgelegt hat,
     gehört ihr. */
  async learn(text, notes) {
    const file = this.file(this.languagePath(text.code) + '/' + RULES_FILE);
    if (!file) return;

    const rules = await this.app.vault.read(file);

    let learned = [];
    try {
      learned = await ai.learnRules({
        into: this.myLanguageName(),
        command: this.settings.claudePath || 'claude',
        temp: ai.tempDir(),
        rules: rules,
        notes: notes
      });
    } catch (error) {
      /* Regeln zu lernen ist eine Zugabe. Klappt es nicht, ist der Text
         trotzdem fertig. */
      console.error('Trisent packager', error);
      return;
    }

    /* Was sinngemäß schon dasteht, nicht doppelt aufschreiben. */
    const known = rules.toLowerCase();
    const fresh = learned.filter((rule) => {
      const core = rule.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').split(' ')
        .filter((word) => word.length > 4).slice(0, 4);
      return core.length === 0 || !core.every((word) => known.indexOf(word) >= 0);
    });
    if (fresh.length === 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const heading = '## Dazugelernt';
    const lines = fresh.map(
      (rule) => '- ' + today + ', „' + (text.title || text.folder.name) + '": ' + rule
    );

    let body = rules.replace(/\s+$/, '');
    if (body.indexOf(heading) < 0) {
      body += '\n\n' + heading + '\n\n' +
        'Beim Aufbereiten entstanden. Sieh sie durch und arbeite ein, was bleiben\n' +
        'soll - oben, in deinen eigenen Worten. Was hier steht, gilt trotzdem schon.\n';
    }
    await this.app.vault.modify(file, body + '\n' + lines.join('\n') + '\n');
  }

  /* ---------------------------------------------------------------- */
  /* Wortnotizen                                                       */
  /* ---------------------------------------------------------------- */

  /* In Häppchen, nicht alles auf einmal: Eine Antwort über dreißig
     Einträge wird lang, und wird sie abgeschnitten, ist alles weg. */
  async writeWords(text, entries, step) {
    const here = this.languagePath(text.code);
    const languageFolder = this.basePath() + '/' + here;
    const rules = await this.readIfThere(here + '/' + RULES_FILE);
    const recipe = await this.ensureRecipe(text.code);
    const size = 8;
    const batches = [];
    for (let at = 0; at < entries.length; at += size) batches.push(entries.slice(at, at + size));

    /* Auch hier nebeneinander - und geschrieben wird erst danach, damit
       sich zwei Läufe nicht um denselben Dateinamen streiten. */
    let finished = 0;
    const answers = [];
    for (let from = 0; from < batches.length; from += AT_ONCE) {
      const round = await Promise.all(
        batches.slice(from, from + AT_ONCE).map(async (batch) => {
          const result = await this.ask(() => ai.words({
            into: this.myLanguageName(),
            recipe: recipe,
            command: this.settings.claudePath || 'claude',
            temp: ai.tempDir(),
            folder: languageFolder,
            rules: rules,
            entries: batch
          }));
          finished += 1;
          step('Looking up words… ' + Math.round((finished / batches.length) * 100) + '%');
          return result;
        })
      );
      for (const one of round) answers.push(one);
    }

    const byKey = new Map(entries.map((one) => [one.key, one]));
    const dictionary = await this.loadDictionary(text.code);
    let written = 0;

    for (const answer of [].concat.apply([], answers)) {
      const made = this.entryFrom(text.code, answer, byKey.get(answer.key));
      if (!made) continue;
      /* Was schon im Wortvorrat steht, bleibt, wie es ist. Ein Wort wird
         einmal beschrieben, nicht einmal je Text. */
      if (Object.prototype.hasOwnProperty.call(dictionary, made.key)) continue;
      dictionary[made.key] = made.entry;
      written += 1;
    }

    if (written > 0) await this.saveDictionary(text.code, dictionary);
    return written;
  }

  /* Aufgenommen wird nur, was zum Schlüssel passt. Ein Eintrag unter dem
     falschen Schlüssel wäre schlimmer als gar keiner: Er sieht richtig aus
     und trägt den Lernstand ins Leere.

     Weicht aber nur die vorgeschlagene Grundform ab, wird die Antwort
     nicht weggeworfen: Es gilt die Grundform aus dem Text, denn aus ihr
     ist der Schlüssel entstanden. Sonst fehlte das Wort weiterhin, der
     nächste Anlauf bekäme dieselbe Antwort, und die Person käme aus der
     Schleife nicht heraus. (Spanisch: im Text steht "la", vorgeschlagen
     wird "el" - beides vertretbar, aber der Schlüssel hat Vorrang.) */
  entryFrom(code, answer, asked) {
    const parts = String(answer.key).split(':');
    if (parts.length < 3) return null;

    const partOfSpeech = parts[2].toUpperCase();
    let lemma = answer.lemma || parts[1];

    if (keyFor(code, lemma, partOfSpeech) !== answer.key) {
      const fromText = asked && asked.lemma;
      if (!fromText || keyFor(code, fromText, partOfSpeech) !== answer.key) return null;
      lemma = fromText;
    }
    if (!answer.gloss) return null;

    return {
      key: answer.key,
      entry: store.entry({
        lemma: lemma,
        partOfSpeech: partOfSpeech,
        gloss: answer.gloss,
        forms: answer.forms,
        grammar: answer.grammar,
        entrySchema: RECIPE_SCHEMA
      })
    };
  }

  /* Die Antwort durch denselben Rechner schicken, der später das Paket
     baut. Was hier stimmt, stimmt auch dort. */
  checkBlock(block, paragraph, code) {
    const head = '---\nlanguage: ' + code + '\nid: check\ntitle: check\n---\n\n';
    const result = buildPackage(parseWork(head + block), paragraph, new Map(), 1);
    return result.problems;
  }

  /* Ein fertiger Absatz derselben Sprache als Vorbild - der trägt Format,
     Ton und Konventionen auf einmal, und deine Korrekturen wandern damit
     von selbst in die nächsten Texte. */
  async exampleFor(text) {
    const folder = this.folder(this.languagePath(text.code));
    if (!folder) return '';

    for (const child of folder.children) {
      if (!(child instanceof TFolder)) continue;
      const work = this.file(child.path + '/' + WORK_FILE);
      if (!work) continue;

      const { body } = splitNote(await this.app.vault.cachedRead(work));
      const first = body.split(/\r?\n-{3,}\r?\n/)[0].trim();
      if (first) return first;
    }
    return '';
  }

  async readIfThere(path) {
    const file = this.file(path);
    return file ? this.app.vault.cachedRead(file) : '';
  }

  /* Anhängen, nicht neu schreiben - was schon dasteht, hat die Person
     vielleicht von Hand verbessert. */
  async appendToWork(text, block, first) {
    void first;
    if (!text.work) {
      const head = [
        '---',
        'type: packager-work',
        'language: ' + text.code,
        'id: ' + text.code + '-' + slug(text.folder.name),
        'title: ' + text.folder.name,
        'level: A1',
        '---',
        '',
        block,
        ''
      ].join('\n');
      /* Ab jetzt gibt es sie - sonst versuchte der nächste Absatz, sie
         ein zweites Mal anzulegen. */
      text.work = await this.put(text.folder.path + '/' + WORK_FILE, head);
      return;
    }

    const current = await this.app.vault.read(text.work);

    /* Sicherheitsnetz gegen doppeltes Anhängen: Enthält die Werkbank schon
       so viele Absätze wie der Rohtext, ist hier nichts mehr zu tun. Ein
       zweiter Lauf hat den Text sonst still verdoppelt, und das fällt erst
       beim Bauen auf - mit einer langen, ratlosen Fehlerliste. */
    if (text.total > 0 && parseWork(current).paragraphs.length >= text.total) return;

    const joined = current.replace(/\s+$/, '') + '\n\n---\n\n' + block + '\n';
    await this.app.vault.modify(text.work, joined);
  }

  /* ---------------------------------------------------------------- */
  /* Ton                                                               */
  /* ---------------------------------------------------------------- */

  /* Der Name der eigenen Sprache, wie ihn Claude versteht. */
  myLanguageName() {
    const code = this.settings.myLanguage || 'de';
    const found = KNOWN_LANGUAGES.find((one) => one.code === code);
    return found ? found.name : 'German';
  }

  /* Der Ordner einer Sprache - so, wie er wirklich heißt.

     Aus dem Kürzel einen Pfad zu bauen ging schief: Heißt der Ordner "es"
     und wir suchen "ES", findet Obsidian nichts, legt neu an, und das
     Dateisystem sagt "gibt es schon". Deshalb wird immer erst gesucht. */
  languagePath(code) {
    const wanted = String(code).toLowerCase();
    const root = this.folder(this.rootPath);
    if (root) {
      for (const child of root.children) {
        if (child instanceof TFolder && child.name.toLowerCase() === wanted) return child.path;
      }
    }
    return this.rootPath + '/' + wanted.toUpperCase();
  }

  voicesFor(code) {
    if (!this.settings.speechKey) return [];
    return (this.settings.voices || []).filter(
      (voice) => String(voice.language || '').toLowerCase() === String(code).toLowerCase() && voice.id
    );
  }

  /* Was an Ton schon im Textordner liegt: je Datei ihre Zeitmarken,
     oder null, wenn sie vor deren Einführung entstanden ist. */
  audioFiles(folder) {
    const found = new Map();
    const sounds = this.childFolder(folder, AUDIO_DIR);
    if (!sounds) return found;

    const marks = this.childFolder(folder, TIMING_DIR);
    const known = new Set();
    if (marks) {
      for (const child of marks.children) {
        if (child instanceof TFile) known.add(child.basename);
      }
    }

    for (const child of sounds.children) {
      if (!(child instanceof TFile)) continue;
      found.set(AUDIO_DIR + '/' + child.name, known.has(child.basename) ? child.basename : null);
    }
    return found;
  }

  /* Die Zeitmarken selbst - erst beim Bauen gebraucht, deshalb einzeln
     nachgeladen statt bei jeder Übersicht. */
  async audioWithTimings(folder) {
    const found = this.audioFiles(folder);
    const marks = this.childFolder(folder, TIMING_DIR);
    if (!marks) return found;

    for (const [file, base] of found) {
      if (!base) continue;
      const note = this.file(marks.path + '/' + base + '.json');
      if (!note) { found.set(file, null); continue; }
      try {
        found.set(file, JSON.parse(await this.app.vault.cachedRead(note)));
      } catch (error) {
        found.set(file, null);
      }
    }
    return found;
  }

  childFolder(folder, name) {
    const child = folder.children.find((one) => one instanceof TFolder && one.name === name);
    return child || null;
  }

  /* Jeden Satz sprechen lassen, der noch keine Datei hat, und danach das
     Paket neu bauen - der Ton gehört hinein. */
  async speak(text, voice, step) {
    if (!text.work) throw new Error('There is nothing to speak yet.');

    const work = parseWork(await this.app.vault.read(text.work));
    const sentences = audio.sentencesOf(work);
    if (sentences.length === 0) throw new Error('There are no sentences yet.');

    const folder = await this.ensureFolder(text.folder.path + '/' + AUDIO_DIR);
    const marks = await this.ensureFolder(text.folder.path + '/' + TIMING_DIR);
    const have = this.audioFiles(text.folder);

    step('Recording audio…');
    const result = await audio.generate({
      key: this.settings.speechKey,
      voice: voice.id,
      sentences: sentences,
      have: have,
      step: step,
      write: async (name, bytes, timing) => {
        const base = name.slice((AUDIO_DIR + '/').length).replace(/\.mp3$/, '');
        await this.putBinary(folder.path + '/' + base + '.mp3', bytes);
        if (timing) await this.put(marks.path + '/' + base + '.json', JSON.stringify(timing));
      }
    });

    step('Building…');
    const built = await this.build(text);

    const spoken = result.written + (result.skipped || 0);
    const detail = spoken + ' of ' + sentences.length + ' sentences have sound' +
      (result.skipped ? ' (' + result.skipped + ' were already there)' : '') + '. ' +
      (result.credits ? result.credits + ' credits used.' : 'Nothing new to record.');

    if (built.kind === 'ok') {
      return { kind: 'ok', headline: voice.name + ' spoke "' + (text.title || text.folder.name) + '".', detail: detail };
    }
    return built;

  }

  /* ---------------------------------------------------------------- */
  /* Bauen                                                             */
  /* ---------------------------------------------------------------- */

  async build(text) {
    const work = parseWork(await this.app.vault.read(text.work));
    const original = text.text ? await this.app.vault.read(text.text) : null;

    const language = String((work.head || {}).language || '').toLowerCase();
    const words = await this.wordsOf(language);

    /* Die Fassung steigt nur, wenn sich wirklich etwas geändert hat.
       Stur hochzählen hieße: Deine Bibliothek meldet eine neue Fassung,
       obwohl Wort für Wort dasselbe drinsteht. */
    let previous = null;
    if (text.package) {
      try {
        previous = JSON.parse(await this.app.vault.read(text.package));
      } catch (error) {
        /* Kaputte alte Fassung - dann fangen wir eben bei 1 an. */
      }
    }
    const held = previous && Number.isFinite(previous.version) ? previous.version : 0;

    const result = buildPackage(
      work, original, words, held || 1,
      await this.audioWithTimings(text.folder),
      this.settings.myLanguage || 'de'
    );

    if (result.missing.length > 0) {
      return {
        kind: 'missing',
        entries: result.missing.map((key) => result.about.get(key) || { key: key, lemma: key.split(':')[1], partOfSpeech: key.split(':')[2], forms: [], glosses: [], sentence: '' })
      };
    }

    if (result.problems.length > 0) {
      return {
        kind: 'bad',
        headline: 'The package did not pass the checks. Nothing was written.',
        lines: result.problems.slice(0, 12),
        more: Math.max(0, result.problems.length - 12)
      };
    }

    /* Unverändert? Dann bleibt alles, wie es ist - auch die Nummer. */
    if (previous && same(previous, result.data)) {
      return {
        kind: 'ok',
        headline: '"' + result.data.title + '" is up to date, version ' + held + '.',
        detail: 'Nothing has changed since the last build.'
      };
    }

    const version = held + 1;
    result.data.version = version;

    /* Erst wenn alles stimmt, wird geschrieben. Ein halbes Paket ist
       schlimmer als keins. */
    await this.put(
      text.folder.path + '/' + PACKAGE_FILE,
      JSON.stringify(result.data, null, 2) + '\n'
    );

    const stats = result.stats;
    return {
      kind: 'ok',
      headline: 'Built version ' + version + ' of "' + result.data.title + '".',
      detail: stats.paragraphs + ' paragraphs · ' + stats.sentences + ' sentences · ' +
              stats.units + ' words · ' + stats.phrases + ' phrases · ' +
              stats.keys + ' different entries in the dictionary.'
    };
  }

  /* ---------------------------------------------------------------- */
  /* Der Wortvorrat                                                    */
  /* ---------------------------------------------------------------- */

  dictionaryPath(code) {
    return this.languagePath(code) + '/' + DICTIONARY_FILE;
  }

  /* Der Wortvorrat einer Sprache: eine Datei, ein Eintrag je Schlüssel,
     gültig über alle Texte hinweg.

     Gibt es ihn noch nicht, entsteht er aus den alten Wortnotizen - eine
     Notiz je Wort war dasselbe Wörterbuch, nur auf zweihundert Dateien
     verteilt. Die Notizen bleiben dabei liegen; weggeworfen wird nichts,
     bevor die Person gesehen hat, dass die eine Datei stimmt. */
  async loadDictionary(code) {
    const file = this.file(this.dictionaryPath(code));
    if (file) return store.parse(await this.app.vault.read(file)).dictionary;

    const gathered = await this.gatherFromNotes(code);
    await this.saveDictionary(code, gathered);
    return gathered;
  }

  async gatherFromNotes(code) {
    const dictionary = {};
    const folder = this.folder(this.languagePath(code) + '/' + WORDS_DIR);
    if (!folder) return dictionary;

    for (const child of folder.children) {
      if (!(child instanceof TFile) || child.extension !== 'md') continue;
      const made = store.fromNote(await this.app.vault.cachedRead(child), code);
      /* Zwei Notizen unter demselben Schlüssel: Die erste gilt. Das kann
         vorkommen, wenn eine Notiz von Hand kopiert wurde. */
      if (made && !dictionary[made.key]) dictionary[made.key] = made.entry;
    }
    return dictionary;
  }

  saveDictionary(code, dictionary) {
    return this.put(this.dictionaryPath(code), store.serialize(dictionary));
  }

  /* Wie viele Wörter eine Sprache kennt.

     Hier findet auch der Umzug statt: Liegt noch kein Wortvorrat da, aber
     ein Ordner voller alter Wortnotizen, entsteht er jetzt. Einmalige
     Aufräumarbeit - danach ist die Datei da, und dieser Zweig läuft nie
     wieder. Die Notizen bleiben liegen. */
  async wordCount(folder) {
    const code = folder.name.toLowerCase();
    const file = this.file(folder.path + '/' + DICTIONARY_FILE);
    if (file) {
      return Object.keys(store.parse(await this.app.vault.cachedRead(file)).dictionary).length;
    }

    const words = this.folder(folder.path + '/' + WORDS_DIR);
    if (!words || !words.children.some((one) => one instanceof TFile)) return 0;

    return Object.keys(await this.loadDictionary(code)).length;
  }

  /* Was der Bau braucht: Schlüssel auf Eintrag, mit sicheren Feldern. */
  async wordsOf(code) {
    const map = new Map();
    const dictionary = await this.loadDictionary(code);

    for (const key of Object.keys(dictionary)) {
      const one = dictionary[key];
      map.set(key, {
        key: key,
        lemma: one.lemma,
        partOfSpeech: one.partOfSpeech,
        gloss: one.gloss,
        forms: Array.isArray(one.forms) ? one.forms : [],
        grammar: one.grammar || '',
        entrySchema: one.entrySchema || 0
      });
    }
    return map;
  }

  /* ---------------------------------------------------------------- */
  /* Durch die Vordertür                                               */
  /* ---------------------------------------------------------------- */

  /* Übergeben wird über denselben Import, den auch eine ZIP-Datei von
     außen nimmt. Der Packager schreibt nicht in die Bibliothek. */
  async send(text) {
    if (!text.package) throw new Error('There is no built package yet.');

    const contents = new Map();
    for (const file of this.filesUnder(text.folder)) {
      const relative = file.path.slice(text.folder.path.length + 1);
      if (relative === WORK_FILE || relative === TEXT_FILE) continue;
      /* Die Rohdaten der Zeitmarken bleiben in der Werkstatt - im Paket
         stehen sie fertig an den Sätzen. */
      if (relative.startsWith(TIMING_DIR + '/')) continue;
      const bytes = await this.app.vault.readBinary(file);
      contents.set(relative, new Uint8Array(bytes));
    }

    /* Die Vordertür. Sie heißt nach ihrem Zweck, nicht nach einem
       Werkzeug - hinter ihr liegt dieselbe Prüfung wie bei einem Paket
       von einem Fremden. */
    const result = await this.plugin.learning.importFiles(contents, text.folder.name);

    if (!this.settings.sent) this.settings.sent = {};
    const head = await this.headOf(text.package);
    this.settings.sent[head.id || text.folder.path] = result.version;
    if (head.id) delete this.settings.sent[text.folder.path];
    await this.saveSettings();

    return (result.updated ? 'Updated "' : 'Added "') + result.title + '" in ' +
           result.language.name + ' — version ' + result.version + '.';
  }

  filesUnder(folder) {
    const found = [];
    const walk = (current) => {
      for (const child of current.children) {
        if (child instanceof TFolder) walk(child);
        else if (child instanceof TFile) found.push(child);
      }
    };
    walk(folder);
    return found;
  }

  /* ---------------------------------------------------------------- */

  async open() {
    const workspace = this.app.workspace;
    const already = workspace.getLeavesOfType(VIEW_TYPE);
    if (already.length > 0) { workspace.revealLeaf(already[0]); return; }

    const leaf = workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }

  addSettings(containerEl) {
    new Setting(containerEl)
      .setName('Packager')
      .setDesc(
        'The workshop that turns your own texts into packages. Most people only read, ' +
        'and reading needs none of this. It runs Claude Code on this computer, so it ' +
        'needs the desktop app and is always off on phones and tablets. ' +
        'Takes effect after a reload.'
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.enabled !== false)
          .onChange(async (value) => {
            this.settings.enabled = value;
            await this.saveSettings();
            new Notice('Reload Obsidian to ' + (value ? 'show' : 'hide') + ' the packager.', 8000);
          })
      );

    if (!this.visible()) return;

    let field = null;
    new Setting(containerEl)
      .setName('Claude command')
      .setDesc('The packager asks Claude to gloss a paragraph. If "claude" is not found, give the full path.')
      .addText((text) => {
        field = text;
        text
          .setPlaceholder('claude')
          .setValue(this.settings.claudePath || '')
          .onChange(async (value) => {
            this.settings.claudePath = value.trim();
            await this.saveSettings();
          });
      })
      .addButton((button) =>
        button.setButtonText('Test').onClick(async () => {
          button.setButtonText('Searching…');
          const result = await ai.check(this.settings.claudePath || 'claude');
          button.setButtonText('Test');

          /* Gefunden, aber anderswo: gleich eintragen. */
          if (result.path) {
            this.settings.claudePath = result.path;
            await this.saveSettings();
            field.setValue(result.path);
          }
          new Notice(result.text, 12000);
        })
      );

    new Setting(containerEl)
      .setName('Your language')
      .setDesc('Glosses, translations and grammar notes are written in this language. Change it before you make your first package.')
      .addDropdown((drop) => {
        for (const language of KNOWN_LANGUAGES) {
          drop.addOption(language.code, language.flag + ' ' + language.name);
        }
        drop.setValue(this.settings.myLanguage || 'de');
        drop.onChange(async (value) => {
          this.settings.myLanguage = value;
          await this.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Rules and recipes')
      .setDesc(
        'How a word form becomes a key, and what a word description contains - prepared per ' +
        'language in the Trisent repository. Fetching brings central improvements to this vault. ' +
        'A file you have changed yourself is never overwritten; the new version is put beside it.'
      )
      .addButton((button) =>
        button.setButtonText('Fetch').onClick(async () => {
          button.setButtonText('Fetching…');
          try {
            const result = await this.refreshSchemas();
            const said = [];
            if (result.updated.length) said.push('Updated: ' + result.updated.join(', ') + '.');
            if (result.kept.length) {
              said.push('Left alone because you changed them: ' + result.kept.join(', ') +
                ' - the new version is beside them.');
            }
            if (!said.length) said.push('Nothing to fetch. Add a language first.');
            new Notice(said.join(' '), 15000);
          } catch (error) {
            console.error('Trisent packager', error);
            new Notice(String(error.message || error), 10000);
          }
          button.setButtonText('Fetch');
        })
      );

    this.addVoiceSettings(containerEl);
  }

  /* Ton. Der Schlüssel bleibt hier; die Stimmen sind eine Liste, weil man
     denselben Text mal männlich und mal weiblich sprechen lassen will -
     und weil nur die Person weiß, welche Stimme zu welcher Sprache passt. */
  addVoiceSettings(containerEl) {
    containerEl.createEl('h4', { text: 'Voices' });

    new Setting(containerEl)
      .setName('ElevenLabs key')
      .setDesc('Needed to turn sentences into sound. It stays on this computer and never travels inside a package.')
      .addText((text) => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('sk-…')
          .setValue(this.settings.speechKey || '')
          .onChange(async (value) => {
            this.settings.speechKey = value.trim();
            await this.saveSettings();
          });
      });

    const list = containerEl.createDiv();
    const draw = () => {
      list.empty();
      const voices = this.settings.voices || [];

      if (voices.length === 0) {
        list.createDiv({
          cls: 'setting-item-description',
          text: 'No voices yet. Add one for each language and speaker you want to use.'
        });
      }

      voices.forEach((voice, at) => {
        const row = new Setting(list);
        row.addText((text) =>
          text.setPlaceholder('fr').setValue(voice.language || '').onChange(async (value) => {
            voice.language = value.trim().toLowerCase();
            await this.saveSettings();
          })
        );
        row.addText((text) =>
          text.setPlaceholder('Charlotte').setValue(voice.name || '').onChange(async (value) => {
            voice.name = value.trim();
            await this.saveSettings();
          })
        );
        row.addText((text) =>
          text.setPlaceholder('voice id').setValue(voice.id || '').onChange(async (value) => {
            voice.id = value.trim();
            await this.saveSettings();
          })
        );
        row.addExtraButton((button) =>
          button.setIcon('trash-2').setTooltip('Remove').onClick(async () => {
            voices.splice(at, 1);
            await this.saveSettings();
            draw();
          })
        );
      });

      new Setting(list).addButton((button) =>
        button.setButtonText('Add voice').onClick(async () => {
          if (!this.settings.voices) this.settings.voices = [];
          this.settings.voices.push({ language: '', name: '', id: '' });
          await this.saveSettings();
          draw();
        })
      );
    };
    draw();
  }
}

module.exports = { Packager, DEFAULTS, VIEW_TYPE, RIBBON_ICON };
