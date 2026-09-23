"use strict";

/*
 * Trisent - ein adaptiver interlinearer Sprachreader.
 *
 * Diese Datei ist nur die Integration: Sie lädt die Einstellungen, baut
 * die Bibliothek auf, meldet die beiden Module an und hält die Ansichten
 * aktuell. Alles Inhaltliche steht daneben:
 *
 *   core/      gemeinsam - Paketformat, Bibliothek, ZIP
 *   reader/    Lesen und Lernen
 *   packager/  Texte zu Paketen schnüren
 *
 * Wer hier etwas ändert, ändert es für beide Module. Änderungen an dieser
 * Datei, an core/ und an styles.css deshalb nur im Einvernehmen.
 *
 * Obsidian lädt main.js direkt - es gibt keinen Build-Schritt. Nach jeder
 * Änderung in Obsidian neu laden.
 */

const obsidian = require('obsidian');
const { Plugin, PluginSettingTab, Setting, Notice, normalizePath } = obsidian;

/* Die Dateien der App, in Ladereihenfolge. Eine neue Datei muss hier
   eingetragen werden - eine der wenigen abgestimmten Änderungen in
   dieser Datei. */
const MODULES = [
  'core/zip.js',
  'core/package.js',
  'core/library.js',
  'learning/streak.js',
  'learning/occurrences.js',
  'learning/entries.js',
  'learning/dictionary.js',
  'learning/schema.js',
  'learning/migrations.js',
  'flashcards/schedule.js',
  'flashcards/session.js',
  'flashcards/find.js',
  'flashcards/deck.js',
  'learning/index.js',
  'reader/audio.js',
  'reader/view.js',
  'reader/card.js',
  'reader/index.js',
  'translator/sentences.js',
  'translator/check.js',
  'translator/speech.js',
  'translator/view.js',
  'translator/index.js',
  'flashcards/view.js',
  'flashcards/index.js',
  'packager/ai.js',
  'packager/audio.js',
  'packager/build.js',
  'packager/dictionary.js',
  'packager/index.js'
];

/* Aus "core/library.js" + "./zip.js" wird "core/zip.js". */
function resolvePath(from, request) {
  const parts = from.split('/').slice(0, -1);
  for (const piece of request.split('/')) {
    if (piece === '.' || piece === '') continue;
    if (piece === '..') parts.pop();
    else parts.push(piece);
  }
  return parts.join('/');
}

/* Die Stilvorlagen der Module. styles.css lädt Obsidian selbst; alles
   Weitere holen wir beim Start dazu, damit jede Seite ihre eigene Datei
   hat und wir uns nicht gegenseitig hineinschreiben. */
const MODULE_STYLES = [
  'reader/reader.css',
  'translator/translator.css',
  'flashcards/flashcards.css',
  'packager/packager.css'
];

/* Beim Entwickeln liegen die Dateien einzeln im Plugin-Ordner und werden
   von dort gelesen. Für eine Veröffentlichung darf das nicht sein: Über
   BRAT kommen nur main.js, manifest.json und styles.css beim Empfänger
   an, und ein Plugin, das dann elf fehlende Dateien sucht, startet gar
   nicht erst.

   Deshalb diese eine Naht: Der Bauschritt auf GitHub ersetzt das null
   durch die Inhalte aller Dateien. Ist etwas darin, wird nicht mehr
   gelesen, sondern von hier genommen. Für die Entwicklung ändert sich
   nichts. */
const EMBEDDED = null;

/* Nur was beide Module angeht. Alles Weitere steht darunter in "reader"
   bzw. "packager" - so kann jede Seite ihre Einstellungen ändern, ohne
   der anderen ihre zu überschreiben. */
const SHARED_DEFAULTS = {
  libraryFolder: 'Trisent',
  hideLibraryFolder: true
};

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
            this.plugin.reader.refresh();
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

    /* Jedes Modul steuert bei, was nur es betrifft. */
    this.plugin.reader.addSettings(containerEl);
    this.plugin.translator.addSettings(containerEl);
    this.plugin.flashcards.addSettings(containerEl);
    this.plugin.packager.addSettings(containerEl);
  }
}

/* ------------------------------------------------------------------ */
/* Das Plugin                                                          */
/* ------------------------------------------------------------------ */

module.exports = class TrisentPlugin extends Plugin {
  async onload() {
    this.moduleStyles = [];

    let modules;
    try {
      modules = await this.loadModules();
    } catch (error) {
      console.error('Trisent could not load its own files', error);
      new Notice('Trisent could not start: ' + String(error.message || error), 15000);
      return;
    }

    const reader = modules['reader/index.js'];
    const translator = modules['translator/index.js'];
    const flashcards = modules['flashcards/index.js'];
    const packager = modules['packager/index.js'];

    await this.loadSettings(
      reader.DEFAULTS, translator.DEFAULTS, flashcards.DEFAULTS, packager.DEFAULTS
    );

    /* Die Seite der Lernenden. Reader und Translator teilen sich, was hier
       liegt - und der Packager reicht fertige Pakete an
       plugin.learning.importFiles(). Das ist die Vordertür, benannt nach
       dem Zweck und nicht nach einem Werkzeug. */
    this.learning = new modules['learning/index.js'].Learning(this);

    this.reader = new reader.Reader(this);
    this.translator = new translator.Translator(this);
    this.flashcards = new flashcards.Flashcards(this);
    this.packager = new packager.Packager(this);

    this.addSettingTab(new TrisentSettingTab(this.app, this));

    /* Wenn sich in der Vault etwas an der Struktur ändert, die Ansichten
       nachziehen - sonst zeigen sie veraltete Zahlen. */
    const onVaultChange = () => this.scheduleRefresh();
    this.registerEvent(this.app.vault.on('create', onVaultChange));
    this.registerEvent(this.app.vault.on('delete', onVaultChange));
    this.registerEvent(this.app.vault.on('rename', onVaultChange));
    this.registerEvent(this.app.metadataCache.on('changed', onVaultChange));
    this.registerEvent(this.app.metadataCache.on('resolved', onVaultChange));

    await this.loadModuleStyles();
    this.app.workspace.onLayoutReady(() => {
      this.applyFolderVisibility();
      /* Erst wenn die Vault fertig eingelesen ist - vorher kennt Obsidian
         die Eigenschaften der Notizen noch nicht. */
      this.runMigrations();
    });
  }

  /* Alte Notizen auf das heutige Schema bringen. Läuft einmal je Vault;
     was dabei geschah, sagt eine Meldung - eine Migration, die stumm
     durch die Notizen der Person geht, wäre unheimlich. */
  async runMigrations() {
    let report;
    try {
      report = await this.learning.migrate();
    } catch (error) {
      console.error('Trisent: migration failed', error);
      new Notice('Trisent could not update your notes: ' + String(error.message || error), 15000);
      return;
    }
    if (!report) return;

    const parts = [];
    if (report.notes > 0) parts.push(report.notes + ' word notes');
    if (report.cards > 0) parts.push(report.cards + ' flashcards');

    if (parts.length === 0) {
      if (report.waiting > 0) {
        new Notice(
          'Trisent left ' + report.waiting + ' word notes alone: their texts are '
          + 'not in your library right now. Import them and they will be tidied up.',
          12000
        );
      }
      return;
    }

    let text = 'Trisent tidied up ' + parts.join(' and ') + '.';
    if (report.rescued > 0) {
      text += ' ' + report.rescued
        + (report.rescued === 1 ? ' grammar note you had changed was kept'
                                : ' grammar notes you had changed were kept')
        + ' under "My notes".';
    }
    if (report.waiting > 0) {
      text += ' ' + report.waiting + ' more wait for texts that are not imported.';
    }
    new Notice(text, 12000);
  }

  onunload() {
    this.removeFolderStyle();
    for (const style of this.moduleStyles || []) style.remove();
    this.moduleStyles = [];
  }

  scheduleRefresh() {
    window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.reader.refresh();
      this.translator.refresh();
      this.flashcards.refresh();
    }, 200);
  }

  /* ---------------------------------------------------------------- */
  /* Die Dateien der App laden                                         */
  /* ---------------------------------------------------------------- */

  /* Obsidian lädt nur main.js. Die übrigen Dateien holen wir selbst aus
     dem Plugin-Ordner und führen sie als gewöhnliche Module aus.

     Das ist bewusst so und nicht mit require('./datei.js') gelöst: Wie
     Obsidian relative Pfade auflöst, ist nicht zugesichert - und wenn es
     danebengeht, startet die App gar nicht erst. Hier steht dagegen
     genau, wo gesucht wird. */
  async loadModules() {
    const base = this.manifest.dir;
    if (!base) throw new Error('The plugin folder is unknown.');

    let sources = EMBEDDED;
    if (!sources) {
      sources = {};
      for (const name of MODULES) {
        sources[name] = await this.app.vault.adapter.read(normalizePath(base + '/' + name));
      }
    }

    const loaded = {};
    const load = (name) => {
      if (loaded[name]) return loaded[name].exports;
      if (sources[name] === undefined) throw new Error('Unknown file: ' + name);

      const unit = { exports: {} };
      loaded[name] = unit;

      /* sourceURL sorgt dafür, dass Fehlermeldungen den Dateinamen
         nennen statt "eval". */
      const run = new Function(
        'module', 'exports', 'require',
        sources[name] + '\n//# sourceURL=trisent/' + name
      );
      run(unit, unit.exports, (request) =>
        request === 'obsidian' ? obsidian : load(resolvePath(name, request))
      );
      return unit.exports;
    };

    const modules = {};
    for (const name of MODULES) modules[name] = load(name);
    return modules;
  }

  /* ---------------------------------------------------------------- */
  /* Stilvorlagen der Module                                           */
  /* ---------------------------------------------------------------- */

  /* Obsidian lädt von sich aus nur styles.css. Die Dateien der Module
     holen wir selbst - fehlt eine, läuft die App trotzdem. */
  async loadModuleStyles() {
    /* In einer veröffentlichten Fassung stecken alle Stilvorlagen bereits
       in styles.css, die Obsidian selbst lädt. */
    if (EMBEDDED) return;

    const base = this.manifest.dir;
    if (!base) return;

    for (const name of MODULE_STYLES) {
      const path = normalizePath(base + '/' + name);
      let css;
      try {
        css = await this.app.vault.adapter.read(path);
      } catch (error) {
        continue;
      }

      const style = document.createElement('style');
      style.setAttr('data-trisent-style', name);
      style.textContent = css;
      document.head.appendChild(style);
      this.moduleStyles.push(style);
    }
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

  /* ---------------------------------------------------------------- */
  /* Einstellungen laden und sichern                                   */
  /* ---------------------------------------------------------------- */

  async loadSettings(readerDefaults, translatorDefaults, flashcardDefaults, packagerDefaults) {
    const stored = (await this.loadData()) || {};

    this.settings = {
      libraryFolder:
        stored.libraryFolder !== undefined ? stored.libraryFolder : SHARED_DEFAULTS.libraryFolder,
      hideLibraryFolder:
        stored.hideLibraryFolder !== undefined
          ? stored.hideLibraryFolder
          : SHARED_DEFAULTS.hideLibraryFolder,
      /* Die Fassung der Notizen in dieser Vault. Fehlt sie, ist die Vault
         älter als die erste Migration - siehe learning/migrations.js. */
      schema: Number(stored.schema) || 1,
      reader: Object.assign({}, readerDefaults, stored.reader || {}),
      translator: Object.assign({}, translatorDefaults, stored.translator || {}),
      flashcards: Object.assign({}, flashcardDefaults, stored.flashcards || {}),
      packager: Object.assign({}, packagerDefaults, stored.packager || {})
    };

    /* Frühere Fassungen hatten alles flach nebeneinander. Was von dort
       stammt, wandert in seinen Bereich - sonst wäre die Leseposition
       nach dem Umbau weg. */
    for (const key of Object.keys(readerDefaults)) {
      if (stored[key] !== undefined && (stored.reader || {})[key] === undefined) {
        this.settings.reader[key] = stored[key];
      }
    }
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
