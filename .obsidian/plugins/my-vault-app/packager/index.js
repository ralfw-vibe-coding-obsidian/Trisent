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

const { ItemView, Notice, TFile, TFolder, normalizePath } = require('obsidian');
const { parseWork, parseWordNote, splitNote, buildPackage } = require('./build.js');

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
const DEFAULTS = { sent: {} };

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

    const build = actions.createEl('button', { cls: 'mod-cta', text: 'Build package' });
    build.addEventListener('click', () => this.build(text));

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

  async build(text) {
    try {
      this.reports.set(text.folder.path, await this.packager.build(text));
    } catch (error) {
      console.error('Trisent packager', error);
      this.reports.set(text.folder.path, {
        kind: 'bad', headline: 'The package could not be built.',
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

    plugin.registerView(VIEW_TYPE, (leaf) => new PackagerView(leaf, this));
    plugin.addRibbonIcon(RIBBON_ICON, 'Open Trisent packager', () => this.open());
    plugin.addCommand({
      id: 'open-packager',
      name: 'Open packager',
      callback: () => this.open()
    });
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
      const work = this.file(child.path + '/' + WORK_FILE);
      if (!work) continue;

      const built = this.file(child.path + '/' + PACKAGE_FILE);
      const front = this.app.metadataCache.getFileCache(work)?.frontmatter;

      result.push({
        folder: child,
        work: work,
        text: this.file(child.path + '/' + TEXT_FILE),
        package: built,
        title: (front && front.title) || child.name,
        version: built ? await this.versionOf(built) : 0,
        sent: this.sentVersion(child.path)
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
        kind: 'bad',
        headline: result.missing.length +
          (result.missing.length === 1 ? ' word has no note yet.' : ' words have no note yet.') +
          ' Nothing was written.',
        lines: result.missing.slice(0, 12),
        more: Math.max(0, result.missing.length - 12)
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

  addSettings(containerEl) { void containerEl; }
}

module.exports = { Packager, DEFAULTS, VIEW_TYPE, RIBBON_ICON };
