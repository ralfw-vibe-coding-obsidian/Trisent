"use strict";

/*
 * Die Bibliothek - alles, was die App über ihre Ordner weiß.
 *
 * Gemeinsamer Code. Der Reader liest hierüber Pakete und Wortnotizen,
 * der Packager schreibt seine fertigen Pakete hierüber in die Vault.
 * Zweimal dieselbe Logik hieße zweimal dieselben Fehler - deshalb steht
 * sie einmal hier. Änderungen nur im Einvernehmen.
 */

const { TFile, TFolder, normalizePath } = require('obsidian');
const { readZip } = require('./zip.js');
const { PACKAGE_FILE, WORD_STATUS, validatePackage } = require('./package.js');

/* Ein Ordner ist eine Sprache, wenn diese Notiz darin liegt - nicht
   durch Raten am Namen. */
const LANGUAGE_NOTE = 'language.md';
const DICTIONARY_DIR = 'dictionary';
const PACKAGES_DIR = 'packages';

/* Angebot beim Anlegen einer Sprache. Lucide hat keine Flaggen, deshalb Emoji.
   Bei Sprachen ohne eindeutiges Land ist die Flagge immer etwas willkürlich. */
/* Angebot beim Anlegen einer Sprache: Europa. Lucide hat keine Flaggen,
   deshalb Emoji - und bei Sprachen ohne eindeutiges Land ist die Flagge
   immer etwas willkürlich.

   Bewusst begrenzt: Was hier steht, ist erprobt oder zumindest nah an
   Erprobtem - lateinische, kyrillische und griechische Schrift, Sprachen
   mit Wortzwischenräumen. Sprachen, die anders gebaut sind, gehören erst
   hierher, wenn jemand sie wirklich durchgespielt hat. */
const KNOWN_LANGUAGES = [
  { code: 'bg', name: 'Bulgarian', flag: '🇧🇬' },
  { code: 'ca', name: 'Catalan', flag: '🏴' },
  { code: 'cs', name: 'Czech', flag: '🇨🇿' },
  { code: 'da', name: 'Danish', flag: '🇩🇰' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'el', name: 'Greek', flag: '🇬🇷' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'et', name: 'Estonian', flag: '🇪🇪' },
  { code: 'fi', name: 'Finnish', flag: '🇫🇮' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'ga', name: 'Irish', flag: '🇮🇪' },
  { code: 'hr', name: 'Croatian', flag: '🇭🇷' },
  { code: 'hu', name: 'Hungarian', flag: '🇭🇺' },
  { code: 'is', name: 'Icelandic', flag: '🇮🇸' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'lt', name: 'Lithuanian', flag: '🇱🇹' },
  { code: 'lv', name: 'Latvian', flag: '🇱🇻' },
  { code: 'mk', name: 'Macedonian', flag: '🇲🇰' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'no', name: 'Norwegian', flag: '🇳🇴' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ro', name: 'Romanian', flag: '🇷🇴' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'sk', name: 'Slovak', flag: '🇸🇰' },
  { code: 'sl', name: 'Slovenian', flag: '🇸🇮' },
  { code: 'sq', name: 'Albanian', flag: '🇦🇱' },
  { code: 'sr', name: 'Serbian', flag: '🇷🇸' },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' }
];

/* In Dateinamen verbotene Zeichen. Grundformen enthalten sie normaler-
   weise nicht, aber verlassen wollen wir uns darauf nicht. */
function sanitizeFileName(name) {
  const clean = String(name).replace(/[\\/:*?"<>|#^\[\]]/g, '-').trim();
  return clean || 'word';
}

/* Werte, die Doppelpunkte oder Anführungszeichen enthalten können,
   müssen im Frontmatter in Anführungszeichen stehen.

   Die Zeichenbereiche decken ab, was die App anbietet: erweitertes
   Latein, Griechisch und Kyrillisch samt der Buchstaben, die über das
   Russische hinausgehen (є ї ґ ђ ј љ њ ћ џ). Sonst stünden serbische
   oder griechische Grundformen ohne Not in Anführungszeichen - lesbar
   bleiben sollen die Notizen ja auch für die Person. */
const PLAIN_YAML = /^[\wÀ-ɏΆ-ώЀ-ӿ][\wÀ-ɏΆ-ώЀ-ӿ .'\u2019-]*$/;

function yamlValue(value) {
  const text = String(value);
  if (PLAIN_YAML.test(text)) return text;
  return '"' + text.replace(/"/g, '\\"') + '"';
}

class Library {
  /* "area" ist der eigene Bereich des Moduls unterhalb des Bibliotheks-
     ordners: "reader" oder "packager". Jedes Modul bekommt seine eigene
     Bibliothek und sieht nur den eigenen Bereich. Der Packager schreibt
     nie in den des Readers - dorthin kommt ein Paket ausschließlich über
     den Import, und damit ausschließlich durch die Prüfung. */
  constructor(app, plugin, area) {
    this.app = app;
    this.plugin = plugin;
    this.area = area;
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
    const base = (this.plugin.settings.libraryFolder || '').trim();
    const parts = [base, this.area].filter(Boolean);
    return parts.length > 0 ? normalizePath(parts.join('/')) : '';
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

  /* Ein Paket aus einer ZIP-Datei in die Vault holen. */
  async importZip(arrayBuffer, label) {
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
      throw new Error('There is no ' + PACKAGE_FILE + ' in "' + label + '".');
    }

    /* Alles aus dem Paketordner, mit Pfaden relativ zu ihm. */
    const prefix = packagePath.slice(0, packagePath.length - PACKAGE_FILE.length);
    const contents = new Map();
    for (const [name, bytes] of files) {
      if (!name.startsWith(prefix)) continue;
      contents.set(name.slice(prefix.length), bytes);
    }

    return this.importFiles(contents, label);
  }

  /* Der eigentliche Import: prüfen, einordnen, schreiben.

     Absichtlich getrennt vom Entpacken. So gibt es zwei Türen - eine ZIP
     von außen und ein fertiges Paket vom Packager - aber nur einen Weg
     dahinter. Gleiche Prüfung, gleiche Platzierung, gleiches Verhalten.
     Eine Abkürzung für die eigene Seite würde mit der Zeit vom fremden
     Weg abweichen, und genau das fiele niemandem auf.

     contents: Map von Pfad (relativ zum Paketordner) auf Bytes. */
  async importFiles(contents, label) {
    const source = contents.get(PACKAGE_FILE);
    if (!source) throw new Error('There is no ' + PACKAGE_FILE + ' in "' + label + '".');

    let data;
    try {
      data = JSON.parse(new TextDecoder('utf-8').decode(source));
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
    const target = existing ? existing.folder : await this.newPackageFolder(language, data.title);

    await this.writePackageFiles(target, contents);

    return {
      title: data.title,
      language: language,
      folder: target,
      updated: !!existing,
      addedLanguage: addedLanguage,
      version: data.version,
      previousVersion: existing ? existing.version : null
    };
  }

  /* Der Ordner, in dem dieses Paket schon liegt - samt seiner bisherigen
     Fassung, damit der Import sagen kann, was er ersetzt. */
  async folderForPackageId(language, id) {
    for (const folder of this.packagesOf(language)) {
      const entry = await this.loadPackage(folder);
      if (entry && entry.ok && entry.data.id === id) {
        return { folder: folder, version: entry.data.version };
      }
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

module.exports = {
  Library,
  LANGUAGE_NOTE,
  DICTIONARY_DIR,
  PACKAGES_DIR,
  KNOWN_LANGUAGES,
  sanitizeFileName,
  yamlValue
};
