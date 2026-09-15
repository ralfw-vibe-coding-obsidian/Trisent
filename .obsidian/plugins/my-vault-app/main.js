'use strict';

/*
 * Trisent - ein adaptiver interlinearer Sprachreader.
 *
 * Diese Datei wird direkt von Obsidian geladen - es gibt keinen Build-Schritt.
 * Nach jeder Änderung in Obsidian neu laden.
 *
 * Die Domänensprache ist Englisch: alles, was in den Daten und im Code einen
 * Namen trägt, heißt englisch. Die Kommentare sind deutsch.
 */

const {
  Plugin,
  ItemView,
  PluginSettingTab,
  Setting,
  Notice,
  TFile,
  TFolder,
  normalizePath,
  setIcon
} = require('obsidian');

const VIEW_TYPE = 'trisent-view';
const CARD_VIEW_TYPE = 'trisent-card-view';
const RIBBON_ICON = 'languages';

/* Woran die App ihre eigene Struktur erkennt. Ein Ordner ist eine Sprache,
   wenn eine language.md darin liegt - nicht durch Raten am Namen. */
const LANGUAGE_NOTE = 'language.md';
const PACKAGE_FILE = 'package.json';
const DICTIONARY_DIR = 'dictionary';
const PACKAGES_DIR = 'packages';

/* Die vier Wissensstände. Reihenfolge ist zugleich die Klick-Reihenfolge. */
const WORD_STATUS = ['unknown', 'learning', 'familiar', 'known'];

const DEFAULT_SETTINGS = {
  libraryFolder: 'Trisent',
  hideLibraryFolder: true,
  lastLanguage: null,
  /* Zuletzt gelesener Text - dafür die Weiterlesen-Karte auf der Übersicht. */
  lastPackage: null,
  /* Farbliche Kennzeichnung der Wörter. Vorgabe: an. */
  colors: true,
  /* Paketpfad -> { sentence, offset }: der oberste angeschnittene Satz
     und wie weit er schon nach oben geschoben war. Das ist keine
     Lerndatei, sondern Zustand der Oberfläche - deshalb hier und nicht
     als Notiz in der Vault. */
  reading: {},
  /* Welche der drei Ebenen im Reader sichtbar sind. Überlebt das Neuladen. */
  levels: { source: true, gloss: true, fluent: true }
};

/* Die drei Darstellungsebenen. Die Kurzzeichen stehen auf den Schaltern. */
const LEVELS = [
  { id: 'source', short: 'F', label: 'Original' },
  { id: 'gloss', short: 'G', label: 'Word by word' },
  { id: 'fluent', short: 'T', label: 'Translation' }
];

/* Gilt als lesbar ohne Hilfe. "learning" zählt bewusst nicht mit. */
const FLUENT_STATUS = ['familiar', 'known'];

/* Angebot beim Anlegen einer Sprache. Lucide hat keine Flaggen, deshalb Emoji.
   Bei Sprachen ohne eindeutiges Land ist die Flagge immer etwas willkürlich. */
const KNOWN_LANGUAGES = [
  { code: 'bg', name: 'Bulgarian', flag: '🇧🇬' },
  { code: 'cs', name: 'Czech', flag: '🇨🇿' },
  { code: 'da', name: 'Danish', flag: '🇩🇰' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'el', name: 'Greek', flag: '🇬🇷' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fi', name: 'Finnish', flag: '🇫🇮' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'he', name: 'Hebrew', flag: '🇮🇱' },
  { code: 'hu', name: 'Hungarian', flag: '🇭🇺' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'no', name: 'Norwegian', flag: '🇳🇴' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ro', name: 'Romanian', flag: '🇷🇴' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'sr', name: 'Serbian', flag: '🇷🇸' },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' }
];

/* ------------------------------------------------------------------ */
/* ZIP lesen - ohne Fremdbibliothek                                    */
/* ------------------------------------------------------------------ */

/* Ein ZIP besteht aus den gepackten Dateien und einem Verzeichnis ganz
   am Ende. Wir lesen das Verzeichnis, weil nur dort verlässlich steht,
   was alles drin ist.

   Zum Entpacken nimmt der Browser seine eigene Maschinerie
   (DecompressionStream) - deshalb braucht es hier keine Bibliothek. */

function findEndOfCentralDirectory(view) {
  /* Das Schlussverzeichnis steht am Ende, kann aber einen Kommentar
     hinter sich haben - also rückwärts danach suchen. */
  const limit = Math.max(0, view.byteLength - 66000);
  for (let at = view.byteLength - 22; at >= limit; at--) {
    if (view.getUint32(at, true) === 0x06054b50) return at;
  }
  return -1;
}

async function inflate(bytes, method) {
  if (method === 0) return bytes; /* unkomprimiert abgelegt */
  if (method !== 8) throw new Error('Unsupported compression method ' + method + ' in the ZIP file.');

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

/* Liefert Pfad -> Inhalt für alle Dateien im Archiv. */
async function readZip(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  const end = findEndOfCentralDirectory(view);
  if (end < 0) throw new Error('This does not look like a ZIP file.');

  const count = view.getUint16(end + 10, true);
  const directoryAt = view.getUint32(end + 16, true);
  if (count === 0xffff || directoryAt === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported. Please use a smaller archive.');
  }

  const decoder = new TextDecoder('utf-8');
  const files = new Map();
  let at = directoryAt;

  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) {
      throw new Error('The ZIP directory is damaged.');
    }

    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));

    at += 46 + nameLength + extraLength + commentLength;

    /* Ordnereinträge und die Beifänge von macOS überspringen. */
    if (name.endsWith('/')) continue;
    if (name.startsWith('__MACOSX/') || name.split('/').pop().startsWith('._')) continue;
    if (name.split('/').pop() === '.DS_Store') continue;

    if (view.getUint32(localAt, true) !== 0x04034b50) {
      throw new Error('The ZIP entry "' + name + '" is damaged.');
    }
    /* Die Längen im lokalen Kopf können von denen im Verzeichnis
       abweichen - hier gelten die lokalen. */
    const localNameLength = view.getUint16(localAt + 26, true);
    const localExtraLength = view.getUint16(localAt + 28, true);
    const dataAt = localAt + 30 + localNameLength + localExtraLength;

    files.set(name, await inflate(bytes.subarray(dataAt, dataAt + compressedSize), method));
  }

  return files;
}

/* ------------------------------------------------------------------ */
/* Paketprüfung                                                        */
/* ------------------------------------------------------------------ */

/* Die Prüfregeln aus konzept/paketformat.md. Ein Paket, das hier
   durchfällt, kommt nicht in die Vault - lieber eine klare Fehlermeldung
   als ein Text, der später an einer Stelle kaputt ist. */
function validatePackage(data, fileNames) {
  const problems = [];
  const say = (text) => { if (problems.length < 40) problems.push(text); };

  if (!data || typeof data !== 'object') return ['The package file is not an object.'];
  if (data.schemaVersion !== 1) say('schemaVersion must be 1.');
  for (const field of ['id', 'title', 'language', 'glossLanguage', 'fluentLanguage']) {
    if (!data[field]) say('Missing "' + field + '" in the package header.');
  }
  if (!Array.isArray(data.paragraphs) || data.paragraphs.length === 0) {
    say('The package has no paragraphs.');
    return problems;
  }
  if (!data.dictionary || typeof data.dictionary !== 'object') {
    say('The package has no dictionary.');
    return problems;
  }

  const paragraphIds = new Set();
  const sentenceIds = new Set();
  const usedKeys = new Set();
  const keyByLexeme = new Map();

  for (const paragraph of data.paragraphs) {
    if (!paragraph.id) say('A paragraph has no id.');
    else if (paragraphIds.has(paragraph.id)) say('Duplicate paragraph id "' + paragraph.id + '".');
    paragraphIds.add(paragraph.id);

    for (const sentence of paragraph.sentences || []) {
      const at = 'Sentence "' + (sentence.id || '?') + '"';

      if (!sentence.id) say('A sentence has no id.');
      else if (sentenceIds.has(sentence.id)) say('Duplicate sentence id "' + sentence.id + '".');
      sentenceIds.add(sentence.id);

      if (typeof sentence.source !== 'string' || !sentence.source) say(at + ': no source text.');
      if (!sentence.fluent) say(at + ': no fluent translation.');

      const source = sentence.source || '';
      const units = Array.isArray(sentence.units) ? sentence.units : [];
      const starts = new Set();
      const ends = new Set();
      let previousEnd = 0;

      for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        if (source.slice(unit.start, unit.end) !== unit.surface) {
          say(at + ', word ' + (i + 1) + ': "' + unit.surface + '" is not at that position in the source.');
        }
        if (unit.start < previousEnd) say(at + ', word ' + (i + 1) + ': words overlap or are out of order.');
        previousEnd = unit.end;
        starts.add(unit.start);
        ends.add(unit.end);

        for (const field of ['gloss', 'lemma', 'partOfSpeech', 'key']) {
          if (!unit[field]) say(at + ', word ' + (i + 1) + ' ("' + unit.surface + '"): "' + field + '" is missing.');
        }
        if (unit.key) {
          usedKeys.add(unit.key);
          const lexeme = String(unit.lemma).toLowerCase() + '|' + unit.partOfSpeech;
          const known = keyByLexeme.get(lexeme);
          if (known && known !== unit.key) {
            say('"' + unit.lemma + '" (' + unit.partOfSpeech + ') uses two different keys: "' + known + '" and "' + unit.key + '".');
          } else keyByLexeme.set(lexeme, unit.key);
        }
      }

      let previousPhraseEnd = 0;
      for (const phrase of sentence.phrases || []) {
        const label = '"' + (phrase.surface || '?') + '"';
        if (source.slice(phrase.start, phrase.end) !== phrase.surface) {
          say(at + ', phrase ' + label + ': not at that position in the source.');
        }
        if (!starts.has(phrase.start) || !ends.has(phrase.end)) {
          say(at + ', phrase ' + label + ': does not start and end on word boundaries.');
        }
        const inside = units.filter((u) => u.start >= phrase.start && u.end <= phrase.end);
        if (inside.length < 2) say(at + ', phrase ' + label + ': covers fewer than two words.');
        if (phrase.start < previousPhraseEnd) say(at + ', phrase ' + label + ': phrases overlap.');
        previousPhraseEnd = phrase.end;
        for (const field of ['gloss', 'lemma', 'key']) {
          if (!phrase[field]) say(at + ', phrase ' + label + ': "' + field + '" is missing.');
        }
        if (phrase.key) usedKeys.add(phrase.key);
      }

      if (sentence.audio && sentence.audio.file && !fileNames.has(sentence.audio.file)) {
        say(at + ': the audio file "' + sentence.audio.file + '" is not in the package.');
      }
    }
  }

  for (const key of usedKeys) {
    if (!data.dictionary[key]) say('No dictionary entry for "' + key + '".');
  }
  for (const key of Object.keys(data.dictionary)) {
    if (!usedKeys.has(key)) say('The dictionary entry "' + key + '" is never used.');
  }

  return problems;
}

/* Wortart-Tags sind fürs Datenformat gedacht, nicht fürs Lesen. */
const POS_LABELS = {
  NOUN: 'noun', PROPN: 'name', VERB: 'verb', AUX: 'auxiliary', ADJ: 'adjective',
  ADV: 'adverb', PRON: 'pronoun', DET: 'determiner', ADP: 'preposition',
  NUM: 'number', CCONJ: 'conjunction', SCONJ: 'conjunction', PART: 'particle',
  INTJ: 'interjection', PHRASE: 'phrase'
};

function readablePos(tag) {
  return POS_LABELS[tag] || String(tag).toLowerCase();
}

/* In Dateinamen verbotene Zeichen. Grundformen enthalten sie normaler-
   weise nicht, aber verlassen wollen wir uns darauf nicht. */
function sanitizeFileName(name) {
  const clean = String(name).replace(/[\\/:*?"<>|#^\[\]]/g, '-').trim();
  return clean || 'word';
}

/* Werte, die Doppelpunkte oder Anführungszeichen enthalten können,
   müssen im Frontmatter in Anführungszeichen stehen. */
function yamlValue(value) {
  const text = String(value);
  if (/^[\wÀ-ſА-я][\wÀ-ſА-я .'\u2019-]*$/.test(text)) return text;
  return '"' + text.replace(/"/g, '\\"') + '"';
}

/* ------------------------------------------------------------------ */
/* Die Bibliothek - alles, was die App über ihre Ordner weiß           */
/* ------------------------------------------------------------------ */

class Library {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.packageCache = new Map();
    /* Gerade erst angelegte Wortnotizen. Obsidians Index braucht einen
       Moment, bis er sie kennt - bis dahin würde ein zweiter Klick auf
       dasselbe Wort eine zweite Notiz anlegen. */
    this.freshWords = new Map();
    /* Je Wort eine Schreibreihenfolge. Vier schnelle Klicks zum Durch-
       schalten dürfen sich nicht gegenseitig überholen. */
    this.writeQueue = new Map();
  }

  /* Der Wurzelordner laut Einstellungen. Leer bedeutet Vault-Wurzel. */
  get rootPath() {
    const raw = (this.plugin.settings.libraryFolder || '').trim();
    return raw ? normalizePath(raw) : '';
  }

  rootFolder() {
    if (!this.rootPath) return this.app.vault.getRoot();
    const folder = this.app.vault.getAbstractFileByPath(this.rootPath);
    return folder instanceof TFolder ? folder : null;
  }

  /* Alle Sprachen: Unterordner der Wurzel, die eine language.md enthalten. */
  languages() {
    const root = this.rootFolder();
    if (!root) return [];

    const result = [];
    for (const child of root.children) {
      if (!(child instanceof TFolder)) continue;
      const language = this.readLanguage(child);
      if (language) result.push(language);
    }
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }

  readLanguage(folder) {
    const note = folder.children.find(
      (child) => child instanceof TFile && child.name === LANGUAGE_NOTE
    );
    if (!note) return null;

    const fm = this.app.metadataCache.getFileCache(note)?.frontmatter || {};
    if (fm.type !== 'language') return null;

    return {
      code: String(fm.code || folder.name).toLowerCase(),
      name: fm.name || folder.name,
      flag: fm.flag || '',
      folder: folder,
      path: folder.path
    };
  }

  languageByCode(code) {
    if (!code) return null;
    const wanted = String(code).toLowerCase();
    return this.languages().find((language) => language.code === wanted) || null;
  }

  /* Lernpakete einer Sprache: jeder Ordner unterhalb von packages/, in dem
     eine package.json liegt. Beliebig tief - so kann die Person nach Thema
     oder Niveau sortieren, ohne dass die App etwas davon wissen muss. */
  packagesOf(language) {
    const start = this.childFolder(language.folder, PACKAGES_DIR);
    if (!start) return [];

    const found = [];
    const walk = (folder) => {
      const hasPackage = folder.children.some(
        (child) => child instanceof TFile && child.name === PACKAGE_FILE
      );
      if (hasPackage) {
        found.push(folder);
        return; /* Ein Paket enthält keine weiteren Pakete. */
      }
      for (const child of folder.children) {
        if (child instanceof TFolder) walk(child);
      }
    };
    walk(start);

    found.sort((a, b) => a.name.localeCompare(b.name));
    return found;
  }

  /* Alle Wortnotizen einer Sprache. */
  wordsOf(language) {
    const folder = this.childFolder(language.folder, DICTIONARY_DIR);
    if (!folder) return [];
    return folder.children.filter(
      (child) => child instanceof TFile && child.extension === 'md'
    );
  }

  /* Zahlen für den Sprachknopf. "known" ist die Zahl, die nur wächst. */
  statsOf(language) {
    const words = this.wordsOf(language);
    const counts = { unknown: 0, learning: 0, familiar: 0, known: 0 };

    for (const file of words) {
      const status = this.app.metadataCache.getFileCache(file)?.frontmatter?.status;
      if (WORD_STATUS.includes(status)) counts[status] += 1;
    }

    return {
      packages: this.packagesOf(language).length,
      words: words.length,
      counts: counts
    };
  }

  /* ---------------------------------------------------------------- */
  /* Pakete lesen                                                      */
  /* ---------------------------------------------------------------- */

  /* Die Paketdatei eines Paketordners. Gelesenes wird zwischengespeichert
     und nur neu geladen, wenn sich die Datei geändert hat. */
  async loadPackage(folder) {
    const file = folder.children.find(
      (child) => child instanceof TFile && child.name === PACKAGE_FILE
    );
    if (!file) return null;

    const cached = this.packageCache.get(file.path);
    if (cached && cached.mtime === file.stat.mtime) return cached.value;

    let value;
    try {
      const raw = await this.app.vault.cachedRead(file);
      value = { ok: true, folder: folder, data: JSON.parse(raw) };
    } catch (error) {
      /* Ein kaputtes Paket muss sichtbar sein, nicht stillschweigend fehlen. */
      value = { ok: false, folder: folder, error: String(error.message || error) };
    }

    this.packageCache.set(file.path, { mtime: file.stat.mtime, value: value });
    return value;
  }

  async loadPackages(language) {
    const folders = this.packagesOf(language);
    const loaded = [];
    for (const folder of folders) {
      const entry = await this.loadPackage(folder);
      if (entry) loaded.push(entry);
    }
    loaded.sort((a, b) => this.titleOf(a).localeCompare(this.titleOf(b)));
    return loaded;
  }

  titleOf(entry) {
    return entry.ok ? entry.data.title || entry.folder.name : entry.folder.name;
  }

  /* Schlüssel -> Wortnotiz. Grundlage für alles, was den Stand betrifft. */
  wordFiles(language) {
    const map = new Map();
    for (const file of this.wordsOf(language)) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (fm?.key) map.set(fm.key, file);
    }
    return map;
  }

  /* Schlüssel -> Lernstand. */
  wordStatusMap(language) {
    const map = new Map();
    for (const file of this.wordsOf(language)) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (fm?.key && WORD_STATUS.includes(fm.status)) map.set(fm.key, fm.status);
    }
    return map;
  }

  /* Der Lernstand eines Wortes oder einer Wendung.

     Die Notiz entsteht beim ersten Antippen aus den Angaben des Pakets.
     Gibt es sie schon, wird nur der Stand geändert - Grammatik, eigene
     Notizen und alles, was die Person selbst hineingeschrieben hat,
     bleibt unangetastet. */
  setWordStatus(language, key, status, entry) {
    const id = language.code + '|' + key;
    const previous = this.writeQueue.get(id) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => this.writeWordStatus(language, key, status, entry));
    this.writeQueue.set(id, next);
    return next;
  }

  async writeWordStatus(language, key, status, entry) {
    const existing = this.wordFileFor(language, key);
    const today = new Date().toISOString().slice(0, 10);

    if (existing) {
      await this.app.fileManager.processFrontMatter(existing, (fm) => {
        fm.status = status;
        fm.updatedAt = today;
      });
      return existing;
    }

    const folder =
      this.childFolder(language.folder, DICTIONARY_DIR) ||
      (await this.ensureFolder(language.path + '/' + DICTIONARY_DIR));

    const lemma = (entry && entry.lemma) || key.split(':')[1] || key;
    const partOfSpeech = (entry && entry.partOfSpeech) || key.split(':')[2] || '';
    const path = this.freeWordPath(folder, lemma, partOfSpeech);

    const lines = ['---'];
    lines.push('type: word');
    lines.push('language: ' + language.code);
    lines.push('lemma: ' + yamlValue(lemma));
    if (partOfSpeech) lines.push('partOfSpeech: ' + partOfSpeech);
    lines.push('key: ' + yamlValue(key));
    if (entry && entry.gloss) lines.push('gloss: ' + yamlValue(entry.gloss));
    if (entry && Array.isArray(entry.forms) && entry.forms.length > 0) {
      lines.push('forms: [' + entry.forms.map(yamlValue).join(', ') + ']');
    }
    lines.push('status: ' + status);
    lines.push('updatedAt: ' + today);
    lines.push('---');
    lines.push('');
    if (entry && entry.grammar) {
      lines.push('## Grammar');
      lines.push('');
      lines.push(entry.grammar);
      lines.push('');
    }
    lines.push('## My notes');
    lines.push('');

    const file = await this.app.vault.create(path, lines.join('\n'));
    this.freshWords.set(language.code + '|' + key, file);
    return file;
  }

  /* Die Notiz zu einem Schlüssel - erst unter den gerade angelegten,
     dann im Index von Obsidian. */
  wordFileFor(language, key) {
    const fresh = this.freshWords.get(language.code + '|' + key);
    if (fresh && this.app.vault.getAbstractFileByPath(fresh.path)) return fresh;
    return this.wordFiles(language).get(key) || null;
  }

  /* Dateiname ist die Grundform. Ist der Name schon von einem anderen
     Wort belegt - gleich geschrieben, andere Wortart -, kommt die Wortart
     dazu. */
  freeWordPath(folder, lemma, partOfSpeech) {
    const base = sanitizeFileName(lemma);
    let candidate = folder.path + '/' + base + '.md';
    if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;

    if (partOfSpeech) {
      candidate = folder.path + '/' + base + ' (' + partOfSpeech + ').md';
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
    }

    for (let n = 2; n < 100; n++) {
      candidate = folder.path + '/' + base + ' ' + n + '.md';
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
    }
    throw new Error('No free file name for "' + lemma + '".');
  }

  /* Kennzahlen eines Pakets, gemessen am eigenen Wissensstand.

     Der Anteil wird über alle Wortvorkommen gezählt, nicht über verschiedene
     Wörter: häufige Wörter wiegen dadurch schwerer, und genau das entspricht
     dem Gefühl beim Lesen. */
  packageStats(data, statusMap) {
    let sentences = 0;
    let tokens = 0;
    const counts = { unknown: 0, learning: 0, familiar: 0, known: 0 };
    const keys = new Set();
    const fresh = new Set();
    const phrases = new Set();

    for (const paragraph of data.paragraphs || []) {
      for (const sentence of paragraph.sentences || []) {
        sentences += 1;
        for (const unit of sentence.units || []) {
          tokens += 1;
          keys.add(unit.key);
          const status = statusMap.get(unit.key) || 'unknown';
          if (counts[status] !== undefined) counts[status] += 1;
          if (status === 'unknown') fresh.add(unit.key);
        }
        for (const phrase of sentence.phrases || []) phrases.add(phrase.key);
      }
    }

    const readable = counts.known + counts.familiar;
    return {
      sentences: sentences,
      tokens: tokens,
      counts: counts,
      distinct: keys.size,
      fresh: fresh.size,
      phrases: phrases.size,
      coverage: tokens > 0 ? readable / tokens : 0
    };
  }

  childFolder(folder, name) {
    const child = folder.children.find(
      (entry) => entry instanceof TFolder && entry.name === name
    );
    return child || null;
  }

  /* ---------------------------------------------------------------- */
  /* Import                                                            */
  /* ---------------------------------------------------------------- */

  /* Ein Paket aus einer ZIP-Datei in die Vault holen.

     Geprüft wird VOR dem Schreiben. Ein Paket, das durchfällt, hinterlässt
     keine Spur - lieber gar nicht importiert als halb. */
  async importZip(arrayBuffer, fileName) {
    const files = await readZip(arrayBuffer);

    /* Die Paketdatei kann direkt im Archiv liegen oder in einem Ordner
       darin. Die am wenigsten tief liegende gewinnt. */
    let packagePath = null;
    for (const name of files.keys()) {
      if (!name.endsWith(PACKAGE_FILE)) continue;
      const isRoot = name === PACKAGE_FILE || name.endsWith('/' + PACKAGE_FILE);
      if (!isRoot) continue;
      if (packagePath === null || name.split('/').length < packagePath.split('/').length) {
        packagePath = name;
      }
    }
    if (packagePath === null) {
      throw new Error('There is no ' + PACKAGE_FILE + ' in "' + fileName + '".');
    }

    const prefix = packagePath.slice(0, packagePath.length - PACKAGE_FILE.length);

    /* Alles aus dem Paketordner, mit Pfaden relativ zu ihm. */
    const contents = new Map();
    for (const [name, bytes] of files) {
      if (!name.startsWith(prefix)) continue;
      contents.set(name.slice(prefix.length), bytes);
    }

    let data;
    try {
      data = JSON.parse(new TextDecoder('utf-8').decode(contents.get(PACKAGE_FILE)));
    } catch (error) {
      throw new Error('The package file is not valid JSON: ' + String(error.message || error));
    }

    const problems = validatePackage(data, new Set(contents.keys()));
    if (problems.length > 0) {
      const error = new Error('The package did not pass the checks.');
      error.problems = problems;
      throw error;
    }

    /* Die Sprache steht im Paket. Fehlt sie in der Bibliothek, legen wir
       sie an - solange wir wissen, wie sie heißt. */
    let language = this.languageByCode(data.language);
    let addedLanguage = false;
    if (!language) {
      const known = KNOWN_LANGUAGES.find((entry) => entry.code === data.language);
      if (!known) {
        throw new Error(
          'This package is in "' + data.language + '", which is not a language Trisent knows. Add it by hand first.'
        );
      }
      language = await this.createLanguage(known.code, known.name, known.flag);
      addedLanguage = true;
    }

    /* Dasselbe Paket in neuer Fassung? Dann dorthin, wo es schon liegt. */
    const existing = await this.folderForPackageId(language, data.id);
    const target = existing || (await this.newPackageFolder(language, data.title));

    await this.writePackageFiles(target, contents);

    return {
      title: data.title,
      language: language,
      folder: target,
      updated: !!existing,
      addedLanguage: addedLanguage,
      version: data.version
    };
  }

  async folderForPackageId(language, id) {
    for (const folder of this.packagesOf(language)) {
      const entry = await this.loadPackage(folder);
      if (entry && entry.ok && entry.data.id === id) return folder;
    }
    return null;
  }

  async newPackageFolder(language, title) {
    const base = this.pathFor(language.folder.name, PACKAGES_DIR);
    await this.ensureFolder(base);

    const name = sanitizeFileName(title);
    let path = base + '/' + name;
    for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) {
      path = base + '/' + name + ' ' + n;
    }
    return this.ensureFolder(path);
  }

  async writePackageFiles(folder, contents) {
    const written = new Set();

    for (const [relative, bytes] of contents) {
      const path = folder.path + '/' + relative;
      written.add(path);

      const parent = relative.split('/').slice(0, -1).join('/');
      if (parent) await this.ensureFolder(folder.path + '/' + parent);

      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof TFile) await this.app.vault.modifyBinary(existing, buffer);
      else await this.app.vault.createBinary(path, buffer);
    }

    /* Tonspuren, die es in der neuen Fassung nicht mehr gibt, wegräumen.
       Nur unterhalb von audio/ - alles andere im Ordner könnte von der
       Person stammen und wird nicht angefasst. */
    const audio = this.childFolder(folder, 'audio');
    if (audio) {
      for (const child of audio.children.slice()) {
        if (child instanceof TFile && !written.has(child.path)) {
          await this.app.vault.trash(child, false);
        }
      }
    }

    this.packageCache.clear();
  }

  /* ---------------------------------------------------------------- */
  /* Anlegen                                                           */
  /* ---------------------------------------------------------------- */

  /* Legt einen Ordner samt fehlender Elternordner an. */
  async ensureFolder(path) {
    const clean = normalizePath(path);
    if (!clean || clean === '/') return this.app.vault.getRoot();

    const existing = this.app.vault.getAbstractFileByPath(clean);
    if (existing instanceof TFolder) return existing;

    const parts = clean.split('/');
    let current = '';
    for (const part of parts) {
      current = current ? current + '/' + part : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
    return this.app.vault.getAbstractFileByPath(clean);
  }

  pathFor(...parts) {
    const all = this.rootPath ? [this.rootPath, ...parts] : parts;
    return normalizePath(all.filter(Boolean).join('/'));
  }

  /* Legt eine Sprache an: Ordner, Notiz, dictionary/, packages/. */
  async createLanguage(code, name, flag) {
    const folderName = code.toUpperCase();
    const base = this.pathFor(folderName);

    if (this.app.vault.getAbstractFileByPath(base)) {
      throw new Error('A folder named "' + folderName + '" already exists.');
    }

    await this.ensureFolder(base);
    await this.ensureFolder(base + '/' + DICTIONARY_DIR);
    await this.ensureFolder(base + '/' + PACKAGES_DIR);

    const front = [
      '---',
      'type: language',
      'code: ' + code.toLowerCase(),
      'name: ' + name,
      'flag: ' + (flag || ''),
      '---',
      '',
      'Learning notes for ' + name + ' go here.',
      ''
    ].join('\n');

    await this.app.vault.create(base + '/' + LANGUAGE_NOTE, front);

    /* Die Sprache selbst zusammensetzen statt neu einzulesen - Obsidians
       Index kennt die eben angelegte Notiz noch nicht. */
    return {
      code: code.toLowerCase(),
      name: name,
      flag: flag || '',
      folder: this.app.vault.getAbstractFileByPath(base),
      path: base
    };
  }
}

/* ------------------------------------------------------------------ */
/* Die Ansicht                                                         */
/* ------------------------------------------------------------------ */

class TrisentView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.library = plugin.library;
    this.screen = 'languages';
    this.languageCode = null;
    this.packagePath = null;
    this.addingLanguage = false;
    this.importReport = null;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return 'Trisent';
  }

  getIcon() {
    return RIBBON_ICON;
  }

  async onOpen() {
    /* Beim Öffnen dort landen, wo die Person zuletzt war. */
    const last = this.plugin.settings.lastLanguage;
    if (last && this.library.languageByCode(last)) {
      this.screen = 'packages';
      this.languageCode = last;
    }
    this.render();
  }

  async onClose() {
    /* nichts aufzuräumen */
  }

  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('trisent-view');

    /* Die Leiste steht NEBEN dem scrollenden Bereich, nicht darin. Damit
       kann sie gar nicht mitrollen - das ist verlässlicher, als sie im
       Text festzukleben. */
    this.barEl = root.createDiv({ cls: 'trisent-topbar is-hidden' });
    this.barInner = this.barEl.createDiv({ cls: 'trisent-page' });

    this.scrollEl = root.createDiv({ cls: 'trisent-scroll' });
    this.scrollEl.addEventListener('scroll', () => this.rememberReadingPosition());
    const page = this.scrollEl.createDiv({ cls: 'trisent-page' });

    if (!this.library.rootFolder()) {
      this.renderEmptyLibrary(page);
      return;
    }

    if (this.screen === 'packages' || this.screen === 'text') {
      const language = this.library.languageByCode(this.languageCode);
      if (language && this.screen === 'text' && this.packagePath) {
        this.renderText(page, language);
        return;
      }
      if (language) {
        this.renderPackages(page, language);
        return;
      }
      this.screen = 'languages';
    }

    this.renderLanguages(page);
  }

  /* Die Leiste ist nur auf den Bildschirmen da, die einen Weg zurück
     brauchen. */
  useBar() {
    this.barEl.removeClass('is-hidden');
    this.barInner.empty();
    return this.barInner;
  }

  /* ---------------------------------------------------------------- */
  /* Bildschirm: noch gar nichts da                                    */
  /* ---------------------------------------------------------------- */

  renderEmptyLibrary(page) {
    const head = page.createDiv({ cls: 'trisent-dashboard-head' });
    head.createEl('h1', { text: 'Trisent' });
    this.renderImportButton(head);
    this.attachDropTarget();

    if (this.importReport) this.renderImportReport(page);
    page.createEl('p', {
      cls: 'trisent-lead',
      text:
        'Your library lives in a folder called "' +
        (this.plugin.settings.libraryFolder || 'the vault root') +
        '". It does not exist yet.'
    });
    this.renderAddLanguage(page);
  }

  /* ---------------------------------------------------------------- */
  /* Bildschirm: Sprachauswahl                                         */
  /* ---------------------------------------------------------------- */

  renderLanguages(page) {
    const head = page.createDiv({ cls: 'trisent-dashboard-head' });
    head.createEl('h1', { text: 'Trisent' });
    this.renderImportButton(head);
    this.attachDropTarget();

    if (this.importReport) this.renderImportReport(page);

    this.renderResume(page);

    const languages = this.library.languages();

    if (languages.length === 0) {
      page.createEl('p', {
        cls: 'trisent-lead',
        text: 'No languages yet. Add the first one.'
      });
    } else {
      page.createDiv({ cls: 'trisent-section-label', text: 'Your languages' });
      const grid = page.createDiv({ cls: 'trisent-language-grid' });
      for (const language of languages) {
        this.renderLanguageCard(grid, language);
      }
      this.renderLegend(page);
    }

    this.renderAddLanguage(page);
  }

  /* Erklärt die Farben des Spektrums - einmal, unter den Kacheln. */
  renderLegend(page) {
    const legend = page.createDiv({ cls: 'trisent-legend' });
    const labels = {
      known: 'known', familiar: 'familiar', learning: 'learning', unknown: 'unknown'
    };
    for (const status of ['known', 'familiar', 'learning', 'unknown']) {
      const item = legend.createSpan({ cls: 'trisent-legend-item' });
      item.createSpan({ cls: 'trisent-legend-dot is-' + status });
      item.createSpan({ text: labels[status] });
    }
  }

  /* Die Frage beim Öffnen ist nie "welche Sprachen habe ich", sondern
     "wo war ich?". Deshalb steht sie oben. */
  renderResume(page) {
    const last = this.plugin.settings.lastPackage;
    if (!last || !last.path) return;

    const folder = this.app.vault.getAbstractFileByPath(last.path);
    if (!(folder instanceof TFolder)) return;

    const language = this.library.languageByCode(last.language);
    if (!language) return;

    const slot = page.createDiv();

    this.library.loadPackage(folder).then((entry) => {
      if (!entry || !entry.ok || !this.contentEl.contains(slot)) return;

      const stats = this.library.packageStats(entry.data, this.library.wordStatusMap(language));
      const mark = this.readingMark(entry, stats.sentences);

      const card = slot.createDiv({ cls: 'trisent-resume' });
      const main = card.createDiv({ cls: 'trisent-resume-main' });
      main.createDiv({ cls: 'trisent-resume-label', text: 'Continue reading' });
      main.createDiv({ cls: 'trisent-resume-title', text: entry.data.title || folder.name });

      const meta = [language.name];
      if (mark) meta.push('sentence ' + mark + ' of ' + stats.sentences);
      meta.push(Math.round(stats.coverage * 100) + '\u202f% without help');
      main.createDiv({ cls: 'trisent-resume-meta', text: meta.join(' · ') });

      const go = card.createEl('button', { cls: 'trisent-cta', text: 'Continue' });
      go.addEventListener('click', () => {
        this.languageCode = language.code;
        this.plugin.settings.lastLanguage = language.code;
        this.openText(folder.path);
      });
    });
  }

  renderLanguageCard(grid, language) {
    const stats = this.library.statsOf(language);
    const card = grid.createEl('button', { cls: 'trisent-tile' });

    const top = card.createDiv({ cls: 'trisent-tile-top' });
    top.createSpan({ cls: 'trisent-flag', text: language.flag || '🏳️' });
    top.createSpan({ cls: 'trisent-tile-name', text: language.name });

    const big = card.createDiv({ cls: 'trisent-big' });
    big.createSpan({ cls: 'trisent-big-num', text: String(stats.counts.known) });
    big.createSpan({ cls: 'trisent-big-unit', text: 'words known' });

    this.renderSpectrum(card, stats.counts, stats.words);

    const foot = card.createDiv({ cls: 'trisent-tile-foot' });
    foot.createSpan({ text: stats.packages + (stats.packages === 1 ? ' text' : ' texts') });
    foot.createSpan({
      text: stats.words > 0 ? stats.words + ' words touched' : 'not started yet'
    });

    card.addEventListener('click', () => this.openLanguage(language.code));
  }

  /* Ein Balken aus allen vier Ständen. Sagt mehr als ein Prozentwert:
     zwei Texte mit derselben Zahl lesen sich völlig verschieden, je
     nachdem ob der Rest neu oder halb gekonnt ist. */
  renderSpectrum(parent, counts, total) {
    const bar = parent.createDiv({ cls: 'trisent-spectrum' });
    if (!total) {
      bar.createDiv({ cls: 'trisent-sp is-unknown' }).style.width = '100%';
      return bar;
    }
    for (const status of ['known', 'familiar', 'learning', 'unknown']) {
      const share = (counts[status] || 0) / total;
      if (share <= 0) continue;
      bar.createDiv({ cls: 'trisent-sp is-' + status }).style.width = (share * 100).toFixed(2) + '%';
    }
    return bar;
  }

  /* ---------------------------------------------------------------- */
  /* Sprache anlegen                                                   */
  /* ---------------------------------------------------------------- */

  renderAddLanguage(page) {
    const area = page.createDiv({ cls: 'trisent-add' });

    if (!this.addingLanguage) {
      const button = area.createEl('button', { cls: 'trisent-add-button' });
      setIcon(button.createSpan({ cls: 'trisent-add-icon' }), 'plus');
      button.createSpan({ text: 'Add language' });
      button.addEventListener('click', () => {
        this.addingLanguage = true;
        this.render();
      });
      return;
    }

    const form = area.createDiv({ cls: 'trisent-form' });
    const existing = new Set(this.library.languages().map((l) => l.code));
    const available = KNOWN_LANGUAGES.filter((l) => !existing.has(l.code));

    const select = form.createEl('select', { cls: 'dropdown trisent-select' });
    for (const language of available) {
      select.createEl('option', {
        text: language.flag + '  ' + language.name,
        value: language.code
      });
    }
    select.createEl('option', { text: '…  Other', value: '' });

    /* Freitext für Sprachen, die nicht in der Liste stehen. */
    const custom = form.createDiv({ cls: 'trisent-custom' });
    custom.hidden = true;
    const codeInput = custom.createEl('input', {
      attr: { type: 'text', placeholder: 'Code (e.g. bg)', maxlength: '8' },
      cls: 'trisent-input trisent-input-code'
    });
    const nameInput = custom.createEl('input', {
      attr: { type: 'text', placeholder: 'Name' },
      cls: 'trisent-input'
    });
    const flagInput = custom.createEl('input', {
      attr: { type: 'text', placeholder: 'Flag', maxlength: '8' },
      cls: 'trisent-input trisent-input-flag'
    });

    select.addEventListener('change', () => {
      custom.hidden = select.value !== '';
    });

    const buttons = form.createDiv({ cls: 'trisent-form-buttons' });
    const create = buttons.createEl('button', { cls: 'mod-cta', text: 'Create' });
    const cancel = buttons.createEl('button', { text: 'Cancel' });

    cancel.addEventListener('click', () => {
      this.addingLanguage = false;
      this.render();
    });

    create.addEventListener('click', async () => {
      let code;
      let name;
      let flag;

      if (select.value) {
        const picked = KNOWN_LANGUAGES.find((l) => l.code === select.value);
        code = picked.code;
        name = picked.name;
        flag = picked.flag;
      } else {
        code = codeInput.value.trim().toLowerCase();
        name = nameInput.value.trim();
        flag = flagInput.value.trim();
        if (!/^[a-z]{2,8}$/.test(code)) {
          new Notice('Please enter a short language code, letters only.');
          return;
        }
        if (!name) {
          new Notice('Please enter a name for the language.');
          return;
        }
      }

      try {
        await this.library.createLanguage(code, name, flag);
      } catch (error) {
        new Notice(String(error.message || error));
        return;
      }

      this.addingLanguage = false;
      this.plugin.applyFolderVisibility();
      this.openLanguage(code);
    });

    window.setTimeout(() => select.focus(), 0);
  }

  /* ---------------------------------------------------------------- */
  /* Bildschirm: Pakete einer Sprache                                  */
  /* ---------------------------------------------------------------- */

  renderPackages(page, language) {
    const bar = this.useBar();
    this.renderHeader(bar, language.flag + ' ' + language.name, () => {
      this.screen = 'languages';
      this.render();
    }, 'Languages');

    this.renderImportButton(bar.querySelector('.trisent-header'));
    this.attachDropTarget();

    if (this.importReport) this.renderImportReport(page);

    const list = page.createDiv({ cls: 'trisent-package-list' });
    list.createDiv({ cls: 'trisent-loading', text: '…' });

    /* Die Paketdateien werden von der Platte gelesen, also asynchron.
       Erst der Rahmen, dann die Inhalte. */
    this.library.loadPackages(language).then((entries) => {
      if (!this.contentEl.contains(list)) return; /* inzwischen weitergeblättert */
      list.empty();

      if (entries.length === 0) {
        const empty = list.createDiv({ cls: 'trisent-empty' });
        empty.createEl('p', { cls: 'trisent-lead', text: 'No texts in this language yet.' });
        empty.createEl('p', {
          cls: 'trisent-muted',
          text: 'Importing packages comes next. Until then, this shelf is empty.'
        });
        return;
      }

      const statusMap = this.library.wordStatusMap(language);
      for (const entry of entries) {
        this.renderPackageRow(list, entry, statusMap);
      }
    });
  }

  renderPackageRow(list, entry, statusMap) {
    if (!entry.ok) {
      const broken = list.createDiv({ cls: 'trisent-text-row is-broken' });
      broken.createDiv({ cls: 'trisent-t-title', text: entry.folder.name });
      broken.createDiv({ cls: 'trisent-t-error', text: 'Cannot read this package: ' + entry.error });
      return;
    }

    const data = entry.data;
    const stats = this.library.packageStats(data, statusMap);
    const mark = this.readingMark(entry, stats.sentences);

    const row = list.createEl('button', {
      cls: 'trisent-text-row' + (mark ? ' is-current' : '')
    });

    const left = row.createDiv({ cls: 'trisent-t-left' });
    left.createDiv({ cls: 'trisent-t-title', text: data.title || entry.folder.name });
    if (data.titleTranslation) {
      left.createDiv({ cls: 'trisent-t-sub', text: data.titleTranslation });
    }

    const chips = left.createDiv({ cls: 'trisent-chips' });
    if (data.level) chips.createSpan({ cls: 'trisent-chip is-level', text: data.level });
    for (const topic of Array.isArray(data.topics) ? data.topics : []) {
      chips.createSpan({ cls: 'trisent-chip', text: topic });
    }

    const right = row.createDiv({ cls: 'trisent-t-right' });
    right.createDiv({
      cls: 'trisent-t-pct',
      text: Math.round(stats.coverage * 100) + '\u202f%'
    });
    this.renderSpectrum(right, stats.counts, stats.tokens);

    const note = right.createDiv({ cls: 'trisent-t-note' });
    const parts = [stats.sentences + ' sentences', stats.tokens + ' words'];
    if (stats.phrases > 0) parts.push(stats.phrases + ' phrases');
    note.createDiv({ text: parts.join(' · ') });
    note.createDiv({
      text: stats.fresh + (stats.fresh === 1 ? ' word still new' : ' words still new')
    });
    if (mark) {
      const resume = note.createDiv({ cls: 'trisent-t-mark' });
      setIcon(resume.createSpan(), 'bookmark');
      resume.createSpan({ text: 'at sentence ' + mark });
    }

    row.addEventListener('click', () => this.openText(entry.folder.path));
  }

  openText(path) {
    this.screen = 'text';
    this.packagePath = path;
    this.plugin.settings.lastPackage = { path: path, language: this.languageCode };
    this.plugin.saveSettings();
    this.render();
  }

  /* ---------------------------------------------------------------- */
  /* Import                                                            */
  /* ---------------------------------------------------------------- */

  /* Der Import gehört keiner Sprache - die steht im Paket. Deshalb
     derselbe Knopf auf der Übersicht wie in der Textliste. */
  renderImportButton(parent) {
    const button = parent.createEl('button', {
      cls: 'trisent-import-button',
      attr: { title: 'Import a package from a ZIP file' }
    });
    setIcon(button.createSpan(), 'download');
    button.createSpan({ text: 'Import' });
    button.addEventListener('click', () => this.pickPackages());
    return button;
  }

  /* Eine ZIP-Datei darf auch einfach fallen gelassen werden. */
  attachDropTarget() {
    this.scrollEl.addEventListener('dragover', (event) => {
      event.preventDefault();
      this.scrollEl.addClass('is-dropping');
    });
    this.scrollEl.addEventListener('dragleave', () => this.scrollEl.removeClass('is-dropping'));
    this.scrollEl.addEventListener('drop', (event) => {
      event.preventDefault();
      this.scrollEl.removeClass('is-dropping');
      const files = event.dataTransfer && event.dataTransfer.files;
      if (files && files.length > 0) this.importFiles(Array.from(files));
    });
  }

  pickPackages() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip';
    input.multiple = true;
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      if (files.length > 0) this.importFiles(files);
    });
    input.click();
  }

  async importFiles(files) {
    this.importReport = { busy: true, done: [], failed: [] };
    this.render();

    for (const file of files) {
      try {
        const result = await this.library.importZip(await file.arrayBuffer(), file.name);
        this.importReport.done.push(result);
      } catch (error) {
        this.importReport.failed.push({
          name: file.name,
          message: String(error.message || error),
          problems: error.problems || []
        });
      }
    }

    this.importReport.busy = false;
    this.plugin.applyFolderVisibility();

    /* Steht man in einer Textliste und das Paket gehört in eine andere
       Sprache, geht es dorthin weiter. Auf der Übersicht bleibt man, wo
       man ist - dort sieht man die neuen Zahlen ja an den Kacheln. */
    if (this.screen === 'packages') {
      const elsewhere = this.importReport.done.find((r) => r.language.code !== this.languageCode);
      if (elsewhere) this.languageCode = elsewhere.language.code;
    }

    this.render();
  }

  renderImportReport(page) {
    const report = this.importReport;
    const box = page.createDiv({ cls: 'trisent-report' });

    if (report.busy) {
      box.createDiv({ cls: 'trisent-report-line', text: 'Reading…' });
      return;
    }

    for (const result of report.done) {
      const line = box.createDiv({ cls: 'trisent-report-line is-good' });
      setIcon(line.createSpan({ cls: 'trisent-report-icon' }), 'check');
      line.createSpan({
        text:
          (result.updated ? 'Updated ' : 'Added ') + '"' + result.title + '"' +
          ' in ' + result.language.name +
          (result.addedLanguage ? ' — which was added to your library' : '')
      });
    }

    for (const failure of report.failed) {
      const item = box.createDiv({ cls: 'trisent-report-fail' });
      const line = item.createDiv({ cls: 'trisent-report-line is-bad' });
      setIcon(line.createSpan({ cls: 'trisent-report-icon' }), 'x');
      line.createSpan({ text: failure.name + ' — ' + failure.message });

      if (failure.problems.length > 0) {
        const list = item.createEl('ul', { cls: 'trisent-report-problems' });
        for (const problem of failure.problems.slice(0, 12)) {
          list.createEl('li', { text: problem });
        }
        if (failure.problems.length > 12) {
          list.createEl('li', {
            cls: 'trisent-report-more',
            text: 'and ' + (failure.problems.length - 12) + ' more'
          });
        }
      }
    }

    const close = box.createEl('button', { cls: 'trisent-report-close', text: 'Dismiss' });
    close.addEventListener('click', () => {
      this.importReport = null;
      this.render();
    });
  }

  /* Der wievielte Satz ist die gemerkte Leseposition? */
  readingMark(entry, total) {
    const stored = this.plugin.settings.reading[entry.folder.path];
    const id = typeof stored === 'string' ? stored : stored && stored.sentence;
    if (!id) return null;

    let index = 0;
    for (const paragraph of entry.data.paragraphs || []) {
      for (const sentence of paragraph.sentences || []) {
        index += 1;
        if (sentence.id === id) return index > 1 && index < total ? index : null;
      }
    }
    return null;
  }

  /* ---------------------------------------------------------------- */
  /* Bildschirm: der Text                                              */
  /* ---------------------------------------------------------------- */

  renderText(page, language) {
    const folder = this.app.vault.getAbstractFileByPath(this.packagePath);
    if (!(folder instanceof TFolder)) {
      this.screen = 'packages';
      this.render();
      return;
    }

    const body = page.createDiv();
    body.createDiv({ cls: 'trisent-loading', text: '…' });

    this.library.loadPackage(folder).then((entry) => {
      if (!this.contentEl.contains(body)) return;
      page.empty();
      try {
        this.buildText(page, language, folder, entry);
      } catch (error) {
        /* Lieber eine Meldung als eine leere Seite - dann weiß man
           wenigstens, dass etwas kaputt ist und was. */
        console.error('Trisent: could not build the reader', error);
        page.createEl('p', {
          cls: 'trisent-muted',
          text: 'Something went wrong while drawing this text: ' + String(error.message || error)
        });
      }
    });
  }

  buildText(page, language, folder, entry) {
    {
      if (!entry || !entry.ok) {
        this.renderHeader(this.useBar(), folder.name, () => this.backToPackages(), language.name);
        page.createEl('p', {
          cls: 'trisent-muted',
          text: 'Cannot read this package: ' + (entry ? entry.error : 'file missing')
        });
        return;
      }

      const data = entry.data;
      this.language = language;
      this.dictionary = data.dictionary || {};
      this.packageData = data;
      this.statusMap = this.library.wordStatusMap(language);
      /* Register aller gezeichneten Vorkommen je Schlüssel. Damit kann ein
         Klick alle Stellen sofort umfärben, ohne den Text neu zu zeichnen -
         die Leseposition bleibt, wo sie ist. */
      this.occurrences = new Map();

      /* Kopf und Schalter stehen in der festen Leiste - ohne sie wäre der
         Weg zurück weg, sobald man ein Stück gelesen hat. */
      const bar = this.useBar();
      this.renderHeader(bar, data.title || folder.name, () => this.backToPackages(), language.name);
      /* Satz-IDs in Lesereihenfolge - daraus wird der Fortschritt. */
      this.sentenceIds = [];
      for (const paragraph of data.paragraphs || []) {
        for (const sentence of paragraph.sentences || []) this.sentenceIds.push(sentence.id);
      }

      this.renderLevelSwitches(bar);
      this.updateProgress();

      const text = page.createDiv({
        cls:
          'trisent-text' +
          (this.plugin.settings.levels.gloss !== false ? ' is-gloss' : '') +
          (this.plugin.settings.colors !== false ? ' is-colored' : '')
      });
      for (const paragraph of data.paragraphs || []) {
        const block = text.createDiv({ cls: 'trisent-paragraph' });
        if (paragraph.speaker) {
          block.createDiv({ cls: 'trisent-speaker', text: paragraph.speaker });
        }
        for (const sentence of paragraph.sentences || []) {
          /* Ein Satz, der sich nicht zeichnen lässt, darf nur sich selbst
             kaputtmachen. Darunter muss weitergelesen werden können. */
          try {
            this.renderSentence(block, sentence);
          } catch (error) {
            this.renderBrokenSentence(block, sentence, error);
          }
        }
      }

      this.restoreReadingPosition(text);

      page.createDiv({
        cls: 'trisent-footnote',
        text: 'Tap a word to set what you know about it. Long press — or right click — opens its card.'
      });
    }
  }

  /* Die drei Ebenen, die Farben und der Lesefortschritt - alles in der
     Kopfzeile, rechts neben dem Titel. */
  renderLevelSwitches(container) {
    const header = container.querySelector('.trisent-header') || container;
    const switches = header.createDiv({ cls: 'trisent-switches' });

    for (const level of LEVELS) {
      const on = this.plugin.settings.levels[level.id] !== false;
      const button = switches.createEl('button', {
        cls: 'trisent-switch' + (on ? ' is-on' : ''),
        attr: { 'aria-label': level.label, title: level.label }
      });
      button.createSpan({ text: level.short });
      button.addEventListener('click', async () => {
        this.plugin.settings.levels[level.id] = !on;
        await this.plugin.saveSettings();
        this.render();
      });
    }

    const colors = this.plugin.settings.colors !== false;
    const paint = switches.createEl('button', {
      cls: 'trisent-switch trisent-switch-icon' + (colors ? ' is-on' : ''),
      attr: { 'aria-label': 'Word colours', title: 'Word colours' }
    });
    setIcon(paint, 'palette');
    paint.addEventListener('click', async () => {
      this.plugin.settings.colors = !colors;
      await this.plugin.saveSettings();
      this.render();
    });

    /* Wie weit im Text man ist. Wandert beim Scrollen mit. */
    const progress = header.createDiv({ cls: 'trisent-progress' });
    this.progressBar = progress.createDiv({ cls: 'trisent-track' }).createDiv({ cls: 'trisent-track-fill' });
    this.progressText = progress.createSpan({ cls: 'trisent-progress-text' });
  }

  /* Ein Satz: F und G in ausgerichteten Spalten, T darunter,
     Wendungen als Klammer unter den Glossen. */
  renderSentence(block, sentence) {
    const levels = this.plugin.settings.levels;
    const wrap = block.createDiv({ cls: 'trisent-sentence' });
    wrap.dataset.sentence = sentence.id || '';

    if (levels.source !== false || levels.gloss !== false) {
      const line = wrap.createDiv({ cls: 'trisent-line' });
      for (const group of this.groupsOf(sentence)) {
        const groupEl = line.createDiv({ cls: 'trisent-group' });
        for (const column of group) {
          this.renderColumn(groupEl, column, levels);
        }
      }
    }

    if (levels.fluent !== false) {
      wrap.createDiv({ cls: 'trisent-t', text: sentence.fluent || '' });
    }
  }

  renderBrokenSentence(block, sentence, error) {
    console.error('Trisent: sentence "' + (sentence && sentence.id) + '" could not be drawn', error);

    const wrap = block.createDiv({ cls: 'trisent-sentence trisent-sentence-broken' });
    wrap.dataset.sentence = (sentence && sentence.id) || '';
    /* Wenigstens den Originalsatz zeigen - lesen geht dann immer noch. */
    wrap.createDiv({ cls: 'trisent-f', text: (sentence && sentence.source) || '' });
    wrap.createDiv({
      cls: 'trisent-sentence-broken-note',
      text: 'This sentence could not be drawn: ' + String(error.message || error)
    });
  }

  renderColumn(groupEl, column, levels) {
    const stack = groupEl.createDiv({
      cls:
        'trisent-column' +
        (column.tight ? ' is-tight' : column.spaced ? ' is-spaced' : '') +
        (column.unit ? '' : ' is-punctuation')
    });

    let wordEl = null;
    let glossEl = null;

    if (levels.source !== false) {
      const f = stack.createDiv({ cls: 'trisent-f' });
      if (column.unit) {
        /* Nur Wörter sind anklickbar - Satzzeichen nicht. Die Farbe sitzt
           auf dem Wort selbst, nicht auf der Spalte, damit sie den
           Wortabstand nicht mit einfärbt. */
        wordEl = f.createSpan({ cls: 'trisent-word', text: column.f });
        this.attachTouch(wordEl, column.unit.key, column.unit);
      } else {
        f.setText(column.f);
      }
    }

    if (levels.gloss !== false) {
      /* Auch leere Glossen bekommen ihre Zeile, damit die Grundlinie
         ruhig bleibt und beim Ausblenden nichts springt. */
      glossEl = stack.createDiv({ cls: 'trisent-g' + (column.g ? '' : ' is-empty') });
      glossEl.dataset.gloss = column.g || '';
    }

    if (column.unit) {
      this.registerOccurrence(column.unit.key, { word: wordEl, gloss: glossEl });
    }

    /* Die Klammer entsteht aus den aneinandergrenzenden Oberkanten aller
       beteiligten Spalten - so läuft sie über Gruppengrenzen und über
       einen Zeilenumbruch hinweg durch. */
    if (column.phrase) {
      const bracket = stack.createDiv({
        cls:
          'trisent-p' +
          (column.phrase.first ? ' is-first' : '') +
          (column.phrase.last ? ' is-last' : '')
      });
      let label = null;
      if (column.phrase.first && levels.gloss !== false) {
        label = bracket.createSpan({ cls: 'trisent-p-label' });
        label.dataset.gloss = column.phrase.gloss;
      }
      this.attachTouch(bracket, column.phrase.key, null);
      this.registerOccurrence(column.phrase.key, { bracket: bracket, label: label });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Leseposition                                                      */
  /* ---------------------------------------------------------------- */

  /* Dorthin zurück, wo zuletzt gelesen wurde.

     Gemerkt wird der oberste angeschnittene Satz UND wie weit er nach oben
     geschoben war. Ohne diesen Versatz landet man beim Wiederöffnen immer
     am Anfang dieses Satzes - also mal ein paar Zeilen weiter oben, mal
     kaum daneben, je nachdem wie weit er angeschnitten war.

     Der Anker ist absichtlich der Satz und nicht die Scroll-Höhe: Sobald
     ein Wort auf "known" steht, fällt seine Glosse weg, der Text wird
     kürzer, und jede gemerkte Höhe zeigt woandershin. */
  /* Wie weit im Text man steht. */
  updateProgress() {
    if (!this.progressText || !this.sentenceIds || this.sentenceIds.length === 0) return;

    const stored = this.readingPosition();
    const at = stored && stored.sentence ? this.sentenceIds.indexOf(stored.sentence) : -1;
    const index = at < 0 ? 1 : at + 1;
    const total = this.sentenceIds.length;

    this.progressBar.style.width = Math.round((index / total) * 100) + '%';
    this.progressText.setText(index + ' / ' + total);
  }

  readingPosition() {
    const stored = this.plugin.settings.reading[this.packagePath];
    if (!stored) return null;
    /* Früher stand hier nur die Satz-ID. */
    if (typeof stored === 'string') return { sentence: stored, offset: 0 };
    return stored;
  }

  restoreReadingPosition(textEl) {
    const stored = this.readingPosition();
    if (!stored || !stored.sentence) return;

    const target = textEl.querySelector(
      '.trisent-sentence[data-sentence="' + stored.sentence + '"]'
    );
    if (!target) return;

    /* Erst nach dem Zeichnen, sonst stehen die Maße noch nicht fest. */
    this.restoring = true;
    window.setTimeout(() => {
      const box = this.scrollEl.getBoundingClientRect();
      const top = target.getBoundingClientRect().top - box.top + this.scrollEl.scrollTop;
      this.scrollEl.scrollTop = Math.max(0, top + (stored.offset || 0));
      window.setTimeout(() => { this.restoring = false; }, 150);
    }, 0);
  }

  /* Der oberste noch sichtbare Satz ist die Leseposition. */
  rememberReadingPosition() {
    if (this.screen !== 'text' || this.restoring || !this.packagePath) return;
    if (!this.scrollEl) return;

    const edge = this.scrollEl.getBoundingClientRect().top;
    let current = null;
    let offset = 0;
    for (const element of this.scrollEl.querySelectorAll('.trisent-sentence')) {
      const rect = element.getBoundingClientRect();
      if (rect.bottom > edge + 1) {
        current = element;
        offset = Math.round(edge - rect.top);
        break;
      }
    }
    if (!current || !current.dataset.sentence) return;

    const stored = this.readingPosition();
    if (stored && stored.sentence === current.dataset.sentence && stored.offset === offset) return;

    this.plugin.settings.reading[this.packagePath] = {
      sentence: current.dataset.sentence,
      offset: offset
    };
    this.updateProgress();
    this.plugin.saveSettingsSoon();
  }

  /* Kurz antippen schaltet den Stand weiter - das macht man hundertmal
     pro Text. Lange drücken oder rechts klicken öffnet die Wortkarte -
     das macht man zehnmal. */
  attachTouch(element, key, unit) {
    let timer = null;
    let opened = false;

    const cancel = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };

    element.addEventListener('pointerdown', () => {
      opened = false;
      cancel();
      timer = window.setTimeout(() => {
        opened = true;
        this.openCard(key, unit);
      }, 450);
    });
    element.addEventListener('pointerup', cancel);
    element.addEventListener('pointerleave', cancel);
    element.addEventListener('pointercancel', cancel);

    element.addEventListener('click', (event) => {
      event.preventDefault();
      cancel();
      /* Nach einem langen Druck kommt trotzdem noch ein Klick - der darf
         den Stand nicht zusätzlich weiterschalten. */
      if (opened) {
        opened = false;
        return;
      }
      this.cycle(key, this.dictionary[key]);
    });

    element.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      cancel();
      opened = true;
      this.openCard(key, unit);
    });
  }

  /* Trägt alles zusammen, was über ein Wort im aktuellen Text bekannt ist. */
  openCard(key, unit) {
    const entry = this.dictionary[key] || {};
    const card = {
      key: key,
      language: this.language,
      entry: entry,
      lemma: entry.lemma || (unit && unit.lemma) || key.split(':')[1] || key,
      partOfSpeech: entry.partOfSpeech || (unit && unit.partOfSpeech) || key.split(':')[2] || '',
      gloss: entry.gloss || (unit && unit.gloss) || '',
      grammar: entry.grammar || '',
      forms: Array.isArray(entry.forms) ? entry.forms : [],
      surface: unit ? unit.surface : '',
      status: this.statusMap.get(key) || 'unknown',
      phrases: [],
      occurrences: []
    };

    const seenPhrases = new Set();
    for (const paragraph of this.packageData.paragraphs || []) {
      for (const sentence of paragraph.sentences || []) {
        for (const item of sentence.units || []) {
          if (item.key === key) this.pushOccurrence(card, sentence, item);
        }
        for (const phrase of sentence.phrases || []) {
          if (phrase.key === key) this.pushOccurrence(card, sentence, phrase);
          /* Wendungen, in denen dieses Wort steckt. */
          if (seenPhrases.has(phrase.key)) continue;
          const inside = (sentence.units || []).some(
            (item) =>
              item.key === key && item.start >= phrase.start && item.end <= phrase.end
          );
          if (inside) {
            seenPhrases.add(phrase.key);
            const phraseEntry = this.dictionary[phrase.key] || {};
            card.phrases.push({
              key: phrase.key,
              lemma: phraseEntry.lemma || phrase.surface,
              gloss: phraseEntry.gloss || phrase.gloss || ''
            });
          }
        }
      }
    }

    card.file = this.library.wordFileFor(this.language, key);
    this.plugin.showCard(card);
  }

  pushOccurrence(card, sentence, item) {
    const source = sentence.source || '';
    card.occurrences.push({
      before: source.slice(0, item.start),
      hit: source.slice(item.start, item.end),
      after: source.slice(item.end),
      fluent: sentence.fluent || ''
    });
  }

  registerOccurrence(key, parts) {
    if (!this.occurrences.has(key)) this.occurrences.set(key, []);
    this.occurrences.get(key).push(parts);
    this.paint(key, this.statusMap.get(key) || 'unknown', [parts]);
  }

  /* Ein Klick schaltet den Stand eine Stufe weiter - und zwar überall im
     Text auf einmal, nicht nur an der angeklickten Stelle. */
  cycle(key, entry) {
    const current = this.statusMap.get(key) || 'unknown';
    const next = WORD_STATUS[(WORD_STATUS.indexOf(current) + 1) % WORD_STATUS.length];
    this.setStatus(key, next, entry || this.dictionary[key]);
  }

  setStatus(key, status, entry) {
    if (!this.statusMap) return;
    this.statusMap.set(key, status);
    this.paint(key, status, this.occurrences.get(key) || []);

    /* Das Schreiben läuft nebenher; die Anzeige wartet nicht darauf. */
    this.library.setWordStatus(this.language, key, status, entry).catch((error) => {
      new Notice('Could not save this word: ' + String(error.message || error));
    });
  }

  /* Alles, was am Aussehen eines Standes hängt, an einer Stelle. */
  paint(key, status, parts) {
    for (const part of parts) {
      if (part.word) {
        for (const name of WORD_STATUS) part.word.removeClass('is-' + name);
        part.word.addClass('is-' + status);
      }
      if (part.gloss) {
        /* Bei "known" fällt die Glosse weg - das ist der sichtbare Lohn
           des Lernens. Die Zeile behält ihre Höhe. */
        part.gloss.setText(status === 'known' ? '' : part.gloss.dataset.gloss);
      }
      if (part.bracket) {
        for (const name of WORD_STATUS) part.bracket.removeClass('is-' + name);
        part.bracket.addClass('is-' + status);
      }
      if (part.label) {
        part.label.setText(status === 'known' ? '' : part.label.dataset.gloss);
      }
    }
  }

  /* Zerlegt einen Satz in Spalten und fasst sie zu Gruppen zusammen.

     Die Einheiten kennen nur ihre Zeichenpositionen - Satzzeichen und
     Leerzeichen gehören keinem Wort. Jedes Stück wird zu einer eigenen
     Spalte; Satzzeichen bekommen keine Glosse (null statt '').

     Gruppiert wird nach dem Original: Was dort ohne Leerzeichen aneinander-
     hängt, bleibt zusammen - "s'il", "l'hôtel", "quatre-vingts". Sonst
     könnte der Zeilenumbruch mitten durch ein Wort gehen.

     Der Abstand steckt als Innenabstand in den Spalten selbst, nicht als
     Lücke dazwischen. Nur so läuft die Wendungsklammer durch, statt in
     Striche zu zerfallen. */
  groupsOf(sentence) {
    const source = sentence.source || '';
    const units = sentence.units || [];
    const columns = [];
    let spaceBefore = false;

    const push = (f, g, start, end, unit) => {
      columns.push({
        f: f, g: g, start: start, end: end,
        space: spaceBefore, unit: unit || null, phrase: null
      });
      spaceBefore = false;
    };

    const between = (from, to) => {
      let at = from;
      for (const part of source.slice(from, to).match(/\s+|\S+/g) || []) {
        if (/\s/.test(part[0])) spaceBefore = true;
        else push(part, null, at, at + part.length);
        at += part.length;
      }
    };

    let cursor = 0;
    for (const unit of units) {
      between(cursor, unit.start);
      push(unit.surface, unit.gloss || '', unit.start, unit.end, unit);
      cursor = unit.end;
    }
    between(cursor, source.length);

    /* Wendungen über die beteiligten Spalten legen. Satzzeichen innerhalb
       einer Wendung gehören mit dazu, damit die Klammer nicht aufreißt. */
    for (const phrase of sentence.phrases || []) {
      const inside = columns.filter(
        (column) => column.start >= phrase.start && column.end <= phrase.end
      );
      inside.forEach((column, index) => {
        column.phrase = {
          key: phrase.key,
          gloss: phrase.gloss || '',
          first: index === 0,
          last: index === inside.length - 1
        };
      });
    }

    /* Abstand nach rechts: volle Breite, wo im Original ein Leerzeichen
       steht, sonst nur so viel, dass die Glossen sich nicht berühren. */
    columns.forEach((column, index) => {
      const next = columns[index + 1];
      column.spaced = !!next && next.space;
      /* Zusammenhängende Wörter brauchen Luft, damit ihre Glossen sich
         nicht berühren ("wenn" und "es" unter "s'il"). Satzzeichen haben
         keine Glosse - vor ihnen wäre der Abstand nur ein Fehler
         ("Bonjour ," statt "Bonjour,"). */
      column.tight = !!next && !next.space && !!column.unit && !!next.unit;
    });

    const groups = [];
    for (const column of columns) {
      if (column.space || groups.length === 0) groups.push([column]);
      else groups[groups.length - 1].push(column);
    }
    return groups;
  }

  /* Kopfzeile mit Zurück-Knopf - überall gleich aufgebaut. */
  renderHeader(page, title, onBack, backLabel) {
    const header = page.createDiv({ cls: 'trisent-header' });

    const back = header.createEl('button', { cls: 'trisent-back' });
    setIcon(back.createSpan(), 'chevron-left');
    back.createSpan({ text: backLabel });
    back.addEventListener('click', onBack);

    header.createDiv({ cls: 'trisent-header-title', text: title });
  }

  backToPackages() {
    this.screen = 'packages';
    this.packagePath = null;
    this.render();
  }

  openLanguage(code) {
    this.importReport = null;
    this.screen = 'packages';
    this.languageCode = code;
    this.plugin.settings.lastLanguage = code;
    this.plugin.saveSettings();
    this.render();
  }
}

/* ------------------------------------------------------------------ */
/* Die Wortkarte - rechts in der Seitenleiste                          */
/* ------------------------------------------------------------------ */

class WordCardView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.card = null;
  }

  getViewType() {
    return CARD_VIEW_TYPE;
  }

  getDisplayText() {
    return this.card ? this.card.lemma : 'Word';
  }

  getIcon() {
    return 'book-open';
  }

  async onOpen() {
    this.render();
  }

  show(card) {
    this.card = card;
    this.render();
    /* Der Reiter trägt das Wort im Titel. */
    this.leaf.updateHeader?.();
  }

  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('trisent-card-view');

    if (!this.card) {
      root.createDiv({
        cls: 'trisent-card-hint',
        text: 'Long press a word — or right click it — to see it here.'
      });
      return;
    }

    const card = this.card;
    const page = root.createDiv({ cls: 'trisent-card' });

    /* Kopf: die Grundform, nicht die Form aus dem Satz. */
    const head = page.createDiv({ cls: 'trisent-card-head' });
    head.createDiv({ cls: 'trisent-card-lemma', text: card.lemma });
    const tags = head.createDiv({ cls: 'trisent-card-tags' });
    if (card.partOfSpeech) {
      tags.createSpan({ cls: 'trisent-chip', text: readablePos(card.partOfSpeech) });
    }
    if (card.surface && card.surface !== card.lemma) {
      tags.createSpan({ cls: 'trisent-card-form', text: 'in the text: ' + card.surface });
    }

    if (card.gloss) {
      page.createDiv({ cls: 'trisent-card-gloss', text: card.gloss });
    }

    /* Nur der Stand, den das Wort gerade hat. Vier Knöpfe nebeneinander
       sahen aus wie eine Frage, die niemand gestellt hat. Antippen
       schaltet weiter - dieselbe Bewegung wie im Text. */
    const row = page.createDiv({ cls: 'trisent-card-state' });
    const pill = row.createEl('button', { cls: 'trisent-status is-' + card.status });
    pill.createSpan({ cls: 'trisent-status-dot' });
    pill.createSpan({ cls: 'trisent-status-name', text: card.status });
    row.createSpan({ cls: 'trisent-status-hint', text: 'tap to change' });

    pill.addEventListener('click', () => {
      const at = WORD_STATUS.indexOf(card.status);
      const next = WORD_STATUS[(at + 1) % WORD_STATUS.length];
      this.plugin.setStatusEverywhere(card.key, next, card.entry);
      card.status = next;
      this.render();
    });

    if (card.forms && card.forms.length > 0) {
      const section = this.section(page, 'Forms');
      const chips = section.createDiv({ cls: 'trisent-topics' });
      for (const form of card.forms) chips.createSpan({ cls: 'trisent-topic', text: form });
    }

    if (card.grammar) {
      this.section(page, 'Grammar').createDiv({
        cls: 'trisent-card-text',
        text: card.grammar
      });
    }

    /* Wendungen, zu denen dieses Wort gehört. Der Weg zur Klammer, wenn
       die Glossen ausgeblendet sind. */
    if (card.phrases && card.phrases.length > 0) {
      const section = this.section(page, 'Part of');
      for (const phrase of card.phrases) {
        const row = section.createEl('button', { cls: 'trisent-card-phrase' });
        row.createSpan({ cls: 'trisent-card-phrase-surface', text: phrase.lemma });
        row.createSpan({ cls: 'trisent-card-phrase-gloss', text: phrase.gloss || '' });
        row.addEventListener('click', () => this.plugin.openCardFor(phrase.key));
      }
    }

    /* Alle Stellen in diesem Text. Die Form im Satz ist hervorgehoben. */
    if (card.occurrences && card.occurrences.length > 0) {
      const section = this.section(
        page,
        card.occurrences.length + (card.occurrences.length === 1 ? ' place in this text' : ' places in this text')
      );
      for (const occurrence of card.occurrences) {
        const row = section.createDiv({ cls: 'trisent-occurrence' });
        const line = row.createDiv({ cls: 'trisent-occurrence-source' });
        line.createSpan({ text: occurrence.before });
        line.createSpan({ cls: 'trisent-occurrence-hit', text: occurrence.hit });
        line.createSpan({ text: occurrence.after });
        row.createDiv({ cls: 'trisent-occurrence-fluent', text: occurrence.fluent });
      }
    }

    /* Der Weg in die eigene Notiz - dort ist Platz für alles Eigene. */
    const foot = page.createDiv({ cls: 'trisent-card-foot' });
    const open = foot.createEl('button', { cls: 'trisent-card-open' });
    setIcon(open.createSpan(), 'file-text');
    open.createSpan({ text: card.file ? 'Open note' : 'Create note' });
    open.addEventListener('click', () => this.plugin.openWordNote(card));
  }

  section(page, title) {
    const section = page.createDiv({ cls: 'trisent-card-section' });
    section.createDiv({ cls: 'trisent-card-section-title', text: title });
    return section;
  }
}

/* ------------------------------------------------------------------ */
/* Einstellungen                                                       */
/* ------------------------------------------------------------------ */

class TrisentSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Library folder')
      .setDesc('Where languages, dictionaries and text packages are stored.')
      .addText((text) =>
        text
          .setPlaceholder('Trisent')
          .setValue(this.plugin.settings.libraryFolder)
          .onChange(async (value) => {
            this.plugin.settings.libraryFolder = value.trim();
            await this.plugin.saveSettings();
            this.plugin.applyFolderVisibility();
            this.plugin.refreshViews();
          })
      );

    new Setting(containerEl)
      .setName('Hide the library folder')
      .setDesc('Keeps the folder out of the file list. Turn this off to look inside by hand.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.hideLibraryFolder)
          .onChange(async (value) => {
            this.plugin.settings.hideLibraryFolder = value;
            await this.plugin.saveSettings();
            this.plugin.applyFolderVisibility();
          })
      );
  }
}

/* ------------------------------------------------------------------ */
/* Das Plugin                                                          */
/* ------------------------------------------------------------------ */

module.exports = class TrisentPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.library = new Library(this.app, this);

    this.registerView(VIEW_TYPE, (leaf) => new TrisentView(leaf, this));
    this.registerView(CARD_VIEW_TYPE, (leaf) => new WordCardView(leaf, this));

    this.addRibbonIcon(RIBBON_ICON, 'Open Trisent', () => this.activateView());

    this.addCommand({
      id: 'open-view',
      name: 'Open Trisent',
      callback: () => this.activateView()
    });

    this.addSettingTab(new TrisentSettingTab(this.app, this));

    /* Wenn sich in der Vault etwas an der Struktur ändert, die Ansicht
       nachziehen - sonst zeigt sie veraltete Zahlen. */
    const onVaultChange = () => this.scheduleRefresh();
    this.registerEvent(this.app.vault.on('create', onVaultChange));
    this.registerEvent(this.app.vault.on('delete', onVaultChange));
    this.registerEvent(this.app.vault.on('rename', onVaultChange));
    this.registerEvent(this.app.metadataCache.on('changed', onVaultChange));
    this.registerEvent(this.app.metadataCache.on('resolved', onVaultChange));

    this.app.workspace.onLayoutReady(() => this.applyFolderVisibility());
  }

  onunload() {
    this.removeFolderStyle();
  }

  async activateView() {
    const workspace = this.app.workspace;

    const open = workspace.getLeavesOfType(VIEW_TYPE);
    if (open.length > 0) {
      workspace.revealLeaf(open[0]);
      return;
    }

    const leaf = workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }

  /* ---------------------------------------------------------------- */
  /* Die Wortkarte                                                     */
  /* ---------------------------------------------------------------- */

  async showCard(card) {
    const workspace = this.app.workspace;

    let leaf = workspace.getLeavesOfType(CARD_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: CARD_VIEW_TYPE, active: true });
    }

    await workspace.revealLeaf(leaf);
    if (leaf.view instanceof WordCardView) leaf.view.show(card);
  }

  /* Von der Wortkarte aus zu einer Wendung springen, in der das Wort steckt. */
  openCardFor(key) {
    const reader = this.readerView();
    if (reader) reader.openCard(key, null);
  }

  /* Ein Stand, der auf der Karte gesetzt wird, muss sofort auch im Text
     ankommen - und umgekehrt. */
  setStatusEverywhere(key, status, entry) {
    const reader = this.readerView();
    if (reader) {
      reader.setStatus(key, status, entry);
      return;
    }
    new Notice('Open the text to change this word.');
  }

  readerView() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof TrisentView && leaf.view.screen === 'text') return leaf.view;
    }
    return null;
  }

  /* Die Wortnotiz öffnen. Gibt es sie noch nicht, entsteht sie jetzt -
     der Stand bleibt dabei, wie er ist. */
  async openWordNote(card) {
    let file = card.file;
    if (!file) {
      try {
        file = await this.library.setWordStatus(
          card.language, card.key, card.status, card.entry
        );
      } catch (error) {
        new Notice('Could not create the note: ' + String(error.message || error));
        return;
      }
      card.file = file;
    }
    if (file) await this.app.workspace.getLeaf('tab').openFile(file);
  }

  refreshViews() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
      if (!(leaf.view instanceof TrisentView)) return;
      /* Der Text zeichnet sich nicht neu, während man darin liest - jedes
         angetippte Wort schreibt eine Notiz, und das würde sonst bei jedem
         Klick die Leseposition verlieren. Beim Verlassen wird ohnehin neu
         gelesen. */
      if (leaf.view.screen === 'text') return;
      leaf.view.render();
    });
  }

  /* Mehrere Änderungen kurz hintereinander nur einmal neu zeichnen. */
  scheduleRefresh() {
    window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => this.refreshViews(), 200);
  }

  /* ---------------------------------------------------------------- */
  /* Bibliotheksordner in der Dateiliste verstecken                    */
  /* ---------------------------------------------------------------- */

  applyFolderVisibility() {
    this.removeFolderStyle();

    const path = (this.settings.libraryFolder || '').trim();
    if (!this.settings.hideLibraryFolder || !path) return;

    /* Titelzeile und die direkt folgende Kinderliste ausblenden -
       zusammen ist das der ganze Ordner im Datei-Explorer. */
    const selector = '.nav-folder-title[data-path="' + path.replace(/"/g, '\\"') + '"]';
    const style = document.createElement('style');
    style.id = 'trisent-hide-folder';
    style.textContent =
      selector + ' { display: none !important; }\n' +
      selector + ' + .nav-folder-children { display: none !important; }';
    document.head.appendChild(style);
    this.folderStyle = style;
  }

  removeFolderStyle() {
    if (this.folderStyle) {
      this.folderStyle.remove();
      this.folderStyle = null;
    }
    const stale = document.getElementById('trisent-hide-folder');
    if (stale) stale.remove();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /* Beim Scrollen fällt laufend eine neue Leseposition an - geschrieben
     wird erst, wenn es kurz ruhig ist. */
  saveSettingsSoon() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveSettings(), 1000);
  }
};
