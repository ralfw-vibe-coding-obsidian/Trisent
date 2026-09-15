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

const { ItemView, Notice, Platform, Setting, TFile, TFolder, normalizePath } = require('obsidian');
const { parseWork, parseWordNote, splitNote, buildPackage } = require('./build.js');
const { keyFor } = require('../core/package.js');
const { sanitizeFileName, yamlValue } = require('../core/library.js');
const ai = require('./ai.js');

const VIEW_TYPE = 'trisent-packager-view';
const RIBBON_ICON = 'package-plus';

const WORK_FILE = 'work.md';
const TEXT_FILE = 'text.md';
const PACKAGE_FILE = 'package.json';
const WORDS_DIR = 'words';
const RULES_FILE = 'rules.md';

/* Was der Packager sich merkt. Liegt in data.json unter "packager".

   "sent" hält fest, welche Fassung eines Textes schon in der Bibliothek
   angekommen ist. Das kann der Packager nicht selbst nachsehen - dort
   drüben schaut er nicht hinein. */
const DEFAULTS = { enabled: true, sent: {}, claudePath: 'claude' };

/* Aus einem Ordnernamen eine Kennung machen: klein, ohne Sonderzeichen. */
function slug(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'text';
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
    root.empty();
    root.addClass('trisent-view');

    const page = root.createDiv({ cls: 'trisent-scroll' }).createDiv({ cls: 'trisent-page' });
    try {
      this.renderBody(page);
    } catch (error) {
      console.error('Trisent packager', error);
      page.createDiv({ cls: 'trisent-problem', text: String(error.message || error) });
    }
  }

  renderBody(page) {
    page.createEl('h1', { text: 'Packager' });

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
    if (text.version) {
      title.createSpan({ cls: 'trisent-chip', text: 'version ' + text.version });
      /* "built" heißt nur: die Datei liegt da. "sent" heißt: diese
         Fassung ist durch den Import in der Bibliothek angekommen. */
      title.createSpan({
        cls: 'trisent-chip is-level',
        text: text.sent === text.version ? 'sent' : 'built'
      });
    }

    const actions = row.createDiv({ cls: 'trisent-pack-actions' });

    /* Ein Knopf für den ganzen Weg: aufbereiten, fehlende Wörter
       beschreiben, bauen. Zwischenstände interessieren nur, solange
       etwas läuft - dann stehen sie auf dem Knopf. */
    const open = text.total > text.done;
    if (text.work || (this.packager.canPrepare() && text.total > 0)) {
      const make = actions.createEl('button', {
        cls: 'mod-cta',
        text: open ? 'Make package' : 'Build again'
      });
      make.addEventListener('click', () => this.make(text, make));
    }

    if (text.version) {
      const send = actions.createEl('button', { text: 'Send to library' });
      send.addEventListener('click', () => this.send(text));
    }

    const report = this.reports.get(text.folder.path);
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

  /* Ein langer Text braucht einige Minuten. Solange muss auf dem Knopf
     stehen, woran gerade gearbeitet wird - sonst sitzt die Person vor
     einer Ansicht, die nichts tut. */
  async make(text, button) {
    button.disabled = true;
    const step = (what) => button.setText(what);

    try {
      this.reports.set(text.folder.path, await this.packager.makePackage(text, step));
    } catch (error) {
      console.error('Trisent packager', error);
      this.reports.set(text.folder.path, {
        kind: 'bad', headline: 'It stopped here.',
        lines: [String(error.message || error)], more: 0
      });
    }
    await this.refresh();
  }

  async send(text) {
    try {
      const result = await this.packager.send(text);
      new Notice(result, 8000);
    } catch (error) {
      console.error('Trisent packager', error);
      new Notice(String(error.message || error), 12000);
    }
    await this.refresh();
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
    plugin.addRibbonIcon(RIBBON_ICON, 'Open Trisent packager', () => this.open());
    plugin.addCommand({
      id: 'open-packager',
      name: 'Open packager',
      callback: () => this.open()
    });
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

    const result = [];
    for (const child of root.children) {
      if (!(child instanceof TFolder)) continue;
      if (!/^[a-z]{2,3}$/i.test(child.name)) continue;

      const words = this.folder(child.path + '/' + WORDS_DIR);
      result.push({
        code: child.name.toLowerCase(),
        folder: child,
        rules: !!this.file(child.path + '/' + RULES_FILE),
        words: words ? words.children.filter((f) => f instanceof TFile).length : 0,
        texts: await this.textsOf(child)
      });
    }
    return result.sort((a, b) => a.code.localeCompare(b.code));
  }

  /* Ein Ordner mit einer work.md darin ist ein Text in Arbeit. */
  async textsOf(languageFolder) {
    const result = [];
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
      const front = work ? this.app.metadataCache.getFileCache(work)?.frontmatter : null;
      const source = this.file(child.path + '/' + TEXT_FILE);

      result.push({
        folder: child,
        work: work,
        text: source,
        package: built,
        title: (front && front.title) || child.name,
        version: built ? await this.versionOf(built) : 0,
        sent: this.sentVersion(child.path),
        done: work ? parseWork(await this.app.vault.cachedRead(work)).paragraphs.length : 0,
        total: source ? paragraphsOf(await this.app.vault.cachedRead(source)).length : 0,
        code: languageFolder.name.toLowerCase()
      });
    }
    return result;
  }

  /* Die Fassung steht im gebauten Paket selbst. */
  async versionOf(file) {
    try {
      const data = JSON.parse(await this.app.vault.cachedRead(file));
      return Number.isFinite(data.version) ? data.version : 0;
    } catch (error) {
      return 0;
    }
  }

  sentVersion(folderPath) {
    return (this.settings.sent || {})[folderPath] || 0;
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
    let done = text.done;

    if (text.total > done) {
      if (!this.canPrepare()) {
        throw new Error('The text is not prepared yet, and Claude was not found. Check the settings.');
      }
      const paragraphs = paragraphsOf(await this.app.vault.read(text.text));
      while (done < paragraphs.length) {
        step('Paragraph ' + (done + 1) + ' of ' + paragraphs.length + '…');
        const block = await this.prepareParagraph(text, paragraphs[done]);
        await this.appendToWork(text, block, done === 0);
        done += 1;
      }
      /* Die Werkbank gibt es jetzt - und der weitere Weg liest aus ihr. */
      text.work = this.file(text.folder.path + '/' + WORK_FILE);
      text.done = done;
    }

    step('Building…');
    let result = await this.build(text);

    /* Fehlende Wortnotizen sind kein Fehler, sondern der nächste Schritt.
       Also gehen wir ihn gleich mit. */
    if (result.kind === 'missing' && this.canPrepare()) {
      step('Writing ' + result.entries.length + ' word notes…');
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
        headline: result.entries.length + ' words still have no note.',
        lines: result.entries.slice(0, 10).map((e) => e.key),
        more: Math.max(0, result.entries.length - 10)
      };
    }
    return result;
  }

  /* Einen Absatz aufbereiten lassen und nachrechnen. */
  async prepareParagraph(text, paragraph) {
    const languageFolder = this.basePath() + '/' + this.rootPath + '/' + text.code.toUpperCase();
    const rules = await this.readIfThere(
      this.rootPath + '/' + text.code.toUpperCase() + '/' + RULES_FILE
    );
    const example = await this.exampleFor(text);

    /* Zwei Anläufe: Beim zweiten bekommt Claude die Fundliste des Prüfers
       mit. Das ist der ganze Sinn eines strengen Prüfers - er kann sagen,
       was nicht stimmt, statt nur nein. */
    let answer = null;
    let problems = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      answer = await ai.prepare({
        command: this.settings.claudePath || 'claude',
        temp: ai.tempDir(),
        folder: languageFolder,
        rules: rules,
        example: example,
        paragraph: attempt === 1
          ? paragraph
          : paragraph + '\n\nDein voriger Versuch hatte diese Fehler:\n- ' +
            problems.slice(0, 10).join('\n- ')
      });

      problems = this.checkBlock(answer.block, paragraph, text.code);
      if (problems.length === 0) break;
    }

    if (problems.length > 0) {
      throw new Error(
        'A paragraph did not come back clean, twice in a row: ' + problems.slice(0, 3).join(' / ')
      );
    }
    return answer.block;
  }

  /* ---------------------------------------------------------------- */
  /* Wortnotizen                                                       */
  /* ---------------------------------------------------------------- */

  /* In Häppchen, nicht alles auf einmal: Eine Antwort über dreißig
     Einträge wird lang, und wird sie abgeschnitten, ist alles weg. */
  async writeWords(text, entries, step) {
    const code = text.code.toUpperCase();
    const languageFolder = this.basePath() + '/' + this.rootPath + '/' + code;
    const rules = await this.readIfThere(this.rootPath + '/' + code + '/' + RULES_FILE);
    const folder = await this.ensureWordsFolder(code);

    let written = 0;
    const size = 8;
    for (let at = 0; at < entries.length; at += size) {
      const batch = entries.slice(at, at + size);
      step('Word notes ' + (at + 1) + '–' + Math.min(at + size, entries.length) +
           ' of ' + entries.length + '…');

      const answers = await ai.words({
        command: this.settings.claudePath || 'claude',
        temp: ai.tempDir(),
        folder: languageFolder,
        rules: rules,
        entries: batch
      });

      for (const answer of answers) {
        if (await this.writeWordNote(folder, text.code, answer)) written += 1;
      }
    }
    return written;
  }

  /* Geschrieben wird nur, was zum Schlüssel passt. Eine Notiz unter dem
     falschen Schlüssel wäre schlimmer als gar keine: Sie sieht richtig
     aus und trägt den Lernstand ins Leere. */
  async writeWordNote(folder, code, answer) {
    const parts = String(answer.key).split(':');
    if (parts.length < 3) return false;

    const partOfSpeech = parts[2].toUpperCase();
    const lemma = answer.lemma || parts[1];
    if (keyFor(code, lemma, partOfSpeech) !== answer.key) return false;
    if (!answer.gloss) return false;

    const base = sanitizeFileName(lemma);
    let path = folder.path + '/' + base + '.md';
    if (this.app.vault.getAbstractFileByPath(path)) {
      path = folder.path + '/' + base + ' (' + partOfSpeech + ').md';
    }
    if (this.app.vault.getAbstractFileByPath(path)) return false;

    const lines = [
      '---',
      'type: packager-word',
      'language: ' + code,
      'lemma: ' + yamlValue(lemma),
      'partOfSpeech: ' + partOfSpeech,
      'key: ' + yamlValue(answer.key),
      'gloss: ' + yamlValue(answer.gloss)
    ];
    if (answer.forms.length > 0) {
      lines.push('forms: [' + answer.forms.map(yamlValue).join(', ') + ']');
    }
    lines.push('---', '');
    if (answer.grammar) lines.push('## Grammar', '', answer.grammar.trim(), '');

    await this.app.vault.create(path, lines.join('\n'));
    return true;
  }

  async ensureWordsFolder(code) {
    const path = this.rootPath + '/' + code + '/' + WORDS_DIR;
    const existing = this.folder(path);
    if (existing) return existing;

    await this.app.vault.createFolder(normalizePath(path));
    return this.folder(path);
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
    const folder = this.folder(this.rootPath + '/' + text.code.toUpperCase());
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
      text.work = await this.app.vault.create(text.folder.path + '/' + WORK_FILE, head);
      return;
    }

    const current = await this.app.vault.read(text.work);
    const joined = current.replace(/\s+$/, '') + '\n\n---\n\n' + block + '\n';
    await this.app.vault.modify(text.work, joined);
  }

  /* ---------------------------------------------------------------- */
  /* Bauen                                                             */
  /* ---------------------------------------------------------------- */

  async build(text) {
    const work = parseWork(await this.app.vault.read(text.work));
    const original = text.text ? await this.app.vault.read(text.text) : null;

    const language = String((work.head || {}).language || '').toLowerCase();
    const words = await this.wordsOf(language);

    /* Jede neue Fassung zählt hoch - daran erkennt der Reader, dass das
       Paket dasselbe ist und nur neuer. */
    let version = 1;
    if (text.package) {
      try {
        const previous = JSON.parse(await this.app.vault.read(text.package));
        if (Number.isFinite(previous.version)) version = previous.version + 1;
      } catch (error) {
        /* Kaputte alte Fassung - dann fangen wir eben bei 1 an. */
      }
    }

    const result = buildPackage(work, original, words, version);

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

    /* Erst wenn alles stimmt, wird geschrieben. Ein halbes Paket ist
       schlimmer als keins. */
    const path = text.folder.path + '/' + PACKAGE_FILE;
    const body = JSON.stringify(result.data, null, 2) + '\n';
    const existing = this.file(path);
    if (existing) await this.app.vault.modify(existing, body);
    else await this.app.vault.create(path, body);

    const stats = result.stats;
    return {
      kind: 'ok',
      headline: 'Built version ' + version + ' of "' + result.data.title + '".',
      detail: stats.paragraphs + ' paragraphs · ' + stats.sentences + ' sentences · ' +
              stats.units + ' words · ' + stats.phrases + ' phrases · ' +
              stats.keys + ' different entries in the dictionary.'
    };
  }

  /* Der Wortvorrat einer Sprache, nach Schlüssel. */
  async wordsOf(code) {
    const map = new Map();
    const folder = this.folder(this.rootPath + '/' + code.toUpperCase() + '/' + WORDS_DIR);
    if (!folder) return map;

    for (const child of folder.children) {
      if (!(child instanceof TFile) || child.extension !== 'md') continue;
      const note = parseWordNote(await this.app.vault.cachedRead(child));
      if (note.key) map.set(note.key, note);
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
      const bytes = await this.app.vault.readBinary(file);
      contents.set(relative, new Uint8Array(bytes));
    }

    const result = await this.plugin.reader.library.importFiles(contents, text.folder.name);

    if (!this.settings.sent) this.settings.sent = {};
    this.settings.sent[text.folder.path] = result.version;
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
        'The workshop that turns texts into packages. Reading works without it. ' +
        'It needs a desktop and is always off on phones and tablets. Takes effect after a reload.'
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
  }
}

module.exports = { Packager, DEFAULTS, VIEW_TYPE, RIBBON_ICON };
