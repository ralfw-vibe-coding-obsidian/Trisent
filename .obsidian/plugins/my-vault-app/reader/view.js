"use strict";

/*
 * Der Reader - Übersicht, Textliste und das Lesen selbst.
 *
 * Gehört dieser Sitzung. Der Packager fasst diese Datei nicht an.
 */

const { ItemView, TFolder, Notice, setIcon } = require('obsidian');
const { WORD_STATUS } = require('../core/package.js');
const { KNOWN_LANGUAGES } = require('../core/library.js');
const { Playback, Recorder, SPEEDS } = require('./audio.js');
const {
  matchesIn, occurrenceOf, searchPackages
} = require('../learning/occurrences.js');

const VIEW_TYPE = 'trisent-view';
const RIBBON_ICON = 'languages';

/* Die drei Darstellungsebenen. Die Kurzzeichen stehen auf den Schaltern. */
const LEVELS = [
  { id: 'source', short: 'F', label: 'Original' },
  { id: 'gloss', short: 'G', label: 'Word by word' },
  { id: 'fluent', short: 'T', label: 'Translation' }
];

/* Wonach die Textliste geordnet werden kann. "easiest" ist die Vorgabe,
   weil die Frage vor der Liste meistens "was kann ich jetzt lesen?"
   lautet - aber wer sich fordern will, dreht es um. */
/* Die drei Stufen der Worthervorhebung. Der Schalter beim Lesen geht
   der Reihe nach durch. */
const HIGHLIGHTS = [
  { id: 'underline', icon: 'underline', label: 'Words underlined' },
  { id: 'fill', icon: 'highlighter', label: 'Words filled' },
  { id: 'none', icon: 'eye-off', label: 'Words unmarked' }
];

const SORTS = [
  { id: 'easiest', label: 'Easiest' },
  { id: 'hardest', label: 'Hardest' },
  { id: 'alphabetical', label: 'A–Z' }
];

class TrisentView extends ItemView {
  constructor(leaf, reader) {
    super(leaf);
    this.reader = reader;
    this.library = reader.library;
    this.streak = reader.streak;
    this.deck = reader.deck;
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
    const last = this.reader.settings.lastLanguage;
    if (last && this.library.languageByCode(last)) {
      this.screen = 'packages';
      this.languageCode = last;
    }
    this.render();
  }

  playback() {
    if (!this.player) this.player = new Playback(this.app, this);
    return this.player;
  }

  recorder() {
    if (!this.taker) this.taker = new Recorder(this);
    return this.taker;
  }

  stopAudio() {
    if (this.player) this.player.stop();
    if (this.taker) this.taker.stop();
  }

  /* Beim Verlassen des Textes sind die Aufnahmen weg - sie liegen nur im
     Arbeitsspeicher und sollen nirgends sonst landen. */
  dropRecordings() {
    if (this.taker) this.taker.clear();
    this.taker = null;
  }

  async onClose() {
    this.stopAudio();
    this.dropRecordings();
    /* nichts aufzuräumen */
  }

  render() {
    /* Was gerade läuft, gehört zu dem, was gerade zu sehen ist. */
    this.stopAudio();
    this.dropRecordings();

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
        (this.reader.plugin.settings.libraryFolder || 'the vault root') +
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

  /* An wie vielen Tagen hintereinander. Steht im Reader und im Translator,
     und es ist derselbe Zähler. */
  renderStreak(parent, language) {
    const days = this.streak.current(language);
    if (days <= 0) return null;

    const badge = parent.createSpan({
      cls: 'trisent-streak',
      attr: { title: days + (days === 1 ? ' day in a row' : ' days in a row') }
    });
    setIcon(badge.createSpan({ cls: 'trisent-streak-icon' }), 'flame');
    badge.createSpan({ text: String(days) });
    return badge;
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
    const last = this.reader.settings.lastPackage;
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
        this.reader.settings.lastLanguage = language.code;
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
    this.renderStreak(foot, language);
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
      this.reader.plugin.applyFolderVisibility();
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

    const head = bar.querySelector('.trisent-header');
    this.renderStreak(head, language);
    this.renderImportButton(head);
    this.attachDropTarget();

    if (this.importReport) this.renderImportReport(page);

    /* Die Schalter hängen nicht an den Paketdateien, nur an ihrer Zahl -
       die steht sofort fest, also stehen sie auch sofort da. */
    if (this.library.packagesOf(language).length > 1) this.renderSortSwitches(page);

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

      /* Die Frage vor der Liste ist nie "wie heißt der Text", sondern
         "was kann ich jetzt lesen?". Also steht oben, was sich am
         leichtesten liest - und die Reihenfolge ändert sich beim Lernen
         von selbst mit. */
      const rows = entries.map((entry) => ({
        entry: entry,
        stats: entry.ok ? this.library.packageStats(entry.data, statusMap) : null
      }));

      rows.sort(this.comparator());

      for (const row of rows) {
        this.renderPackageRow(list, row.entry, statusMap, row.stats);
      }
    });
  }

  renderPackageRow(list, entry, statusMap, stats) {
    if (!entry.ok) {
      const broken = list.createDiv({ cls: 'trisent-text-row is-broken' });
      broken.createDiv({ cls: 'trisent-t-title', text: entry.folder.name });
      broken.createDiv({ cls: 'trisent-t-error', text: 'Cannot read this package: ' + entry.error });
      return;
    }

    const data = entry.data;
    const mark = this.readingMark(entry, stats.sentences);

    const row = list.createEl('button', {
      cls: 'trisent-text-row' + (mark ? ' is-current' : '')
    });

    const left = row.createDiv({ cls: 'trisent-t-left' });

    const heading = left.createDiv({ cls: 'trisent-t-title' });
    heading.createSpan({ text: data.title || entry.folder.name });

    /* Ob ein Text zu hören ist, entscheidet mit darüber, ob man ihn jetzt
       aufschlägt - also gehört es neben den Titel, nicht in die Zahlen. */
    const spoken = (data.paragraphs || []).some((paragraph) =>
      (paragraph.sentences || []).some((sentence) => sentence.audio && sentence.audio.file)
    );
    if (spoken) {
      const note = heading.createSpan({
        cls: 'trisent-t-audio',
        attr: { 'aria-label': 'Has audio', title: 'Has audio' }
      });
      setIcon(note, 'ear');
    }
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
    this.countToday();
    this.reader.settings.lastPackage = { path: path, language: this.languageCode };
    this.reader.saveSettings();
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
      if (files && files.length > 0) this.importArchives(Array.from(files));
    });
  }

  pickPackages() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip';
    input.multiple = true;
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      if (files.length > 0) this.importArchives(files);
    });
    input.click();
  }

  async importArchives(files) {
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
    this.reader.plugin.applyFolderVisibility();

    /* Steht man in einer Textliste und das Paket gehört in eine andere
       Sprache, geht es dorthin weiter. Auf der Übersicht bleibt man, wo
       man ist - dort sieht man die neuen Zahlen ja an den Kacheln. */
    if (this.screen === 'packages') {
      const elsewhere = this.importReport.done.find((r) => r.language.code !== this.languageCode);
      if (elsewhere) this.languageCode = elsewhere.language.code;
    }

    this.render();
  }

  /* Was der Import getan hat, in einem Satz. */
  importLine(result) {
    const what = '"' + result.title + '" in ' + result.language.name;

    if (!result.updated) {
      return 'Added ' + what +
        (result.addedLanguage ? ' — which was added to your library' : '');
    }

    const from = result.previousVersion;
    const to = result.version;
    if (typeof from === 'number' && typeof to === 'number' && to <= from) {
      return 'Replaced ' + what + ' — you had version ' + from +
        ', this one is version ' + to + '.';
    }
    if (typeof from === 'number' && typeof to === 'number') {
      return 'Updated ' + what + ' from version ' + from + ' to ' + to + '.';
    }
    return 'Updated ' + what + '.';
  }

  renderImportReport(page) {
    const report = this.importReport;
    const box = page.createDiv({ cls: 'trisent-report' });

    if (report.busy) {
      box.createDiv({ cls: 'trisent-report-line', text: 'Reading…' });
      return;
    }

    for (const result of report.done) {
      /* Ein Paket, das eine neuere Fassung ersetzt, ist einen Hinweis wert -
         verbieten wollen wir es nicht, entschieden hat es ja die Person. */
      const backwards =
        result.updated &&
        typeof result.version === 'number' &&
        typeof result.previousVersion === 'number' &&
        result.version <= result.previousVersion;

      const line = box.createDiv({
        cls: 'trisent-report-line ' + (backwards ? 'is-warn' : 'is-good')
      });
      setIcon(line.createSpan({ cls: 'trisent-report-icon' }), backwards ? 'alert-triangle' : 'check');
      line.createSpan({ text: this.importLine(result) });
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

  /* Was der Abspieler über einen Satz wissen muss. */
  playItem(sentenceId) {
    const audio = this.audioFor.get(sentenceId);
    return {
      id: sentenceId,
      file: audio.file,
      timings: Array.isArray(audio.timings) ? audio.timings : null
    };
  }

  renderAudioBar(container) {
    const bar = container.createDiv({ cls: 'trisent-audiobar' });

    const all = [];
    for (const id of this.sentenceIds) {
      if (this.audioFor.has(id)) all.push(this.playItem(id));
    }

    this.speakButton = bar.createEl('button', { cls: 'trisent-speak' });
    setIcon(this.speakButton.createSpan({ cls: 'trisent-speak-icon' }), 'play');
    this.speakButton.createSpan({ cls: 'trisent-speak-label', text: 'Play text' });
    this.speakButton.addEventListener('click', () => this.playback().play(all));

    /* Ganz aufhören, statt nur anzuhalten. Der Knopf steht immer da, ist
       aber nur sichtbar, wenn es etwas zu stoppen gibt - so springt die
       Leiste nicht, sobald das Abspielen beginnt. */
    this.stopButton = bar.createEl('button', {
      /* Von Anfang an unsichtbar - beim Öffnen läuft ja noch nichts.
         Sichtbar wird er erst, wenn es etwas zu stoppen gibt. */
      cls: 'trisent-stopbutton is-idle',
      attr: { 'aria-label': 'Stop', title: 'Stop' }
    });
    setIcon(this.stopButton, 'square');
    this.stopButton.addEventListener('click', () => this.stopAudio());

    /* Langsamer hören ist beim Lernen kein Luxus. */
    const label = (value) => (value === 1 ? '1×' : String(value).replace('0.', '.') + '×');
    const speed = () => {
      const stored = this.reader.settings.speed;
      return SPEEDS.includes(stored) ? stored : 1;
    };

    const pace = bar.createEl('button', {
      cls: 'trisent-speed' + (speed() === 1 ? '' : ' is-on'),
      text: label(speed()),
      attr: { 'aria-label': 'Playback speed', title: 'Playback speed' }
    });

    pace.addEventListener('click', async () => {
      /* Den Stand jedes Mal frisch nachsehen. Merkt der Knopf ihn sich vom
         Zeichnen, rechnet er beim zweiten Klick wieder dieselbe Stufe aus
         und wirkt, als klemme er. */
      const next = SPEEDS[(SPEEDS.indexOf(speed()) + 1) % SPEEDS.length];
      this.reader.settings.speed = next;
      await this.reader.saveSettings();
      /* Wirkt sofort, auch mitten im Satz. */
      if (this.player) this.player.setSpeed(next);
      pace.setText(label(next));
      pace.toggleClass('is-on', next !== 1);
    });
  }

  highlightMode() {
    const mode = this.reader.settings.highlight;
    return HIGHLIGHTS.some((h) => h.id === mode) ? mode : 'underline';
  }

  renderSortSwitches(page) {
    const row = page.createDiv({ cls: 'trisent-sort' });
    const current = this.reader.settings.sort || 'easiest';

    for (const sort of SORTS) {
      const button = row.createEl('button', {
        cls: 'trisent-sort-button' + (sort.id === current ? ' is-on' : ''),
        text: sort.label
      });
      button.addEventListener('click', async () => {
        if (sort.id === current) return;
        this.reader.settings.sort = sort.id;
        await this.reader.saveSettings();
        this.render();
      });
    }
  }

  /* Die Reihenfolge der Textliste. Kaputte Pakete stehen immer unten -
     dort stören sie beim Aussuchen nicht. */
  comparator() {
    const mode = this.reader.settings.sort || 'easiest';
    const title = (row) => this.library.titleOf(row.entry);

    return (a, b) => {
      if (!a.stats || !b.stats) return a.stats ? -1 : b.stats ? 1 : 0;

      if (mode === 'alphabetical') return title(a).localeCompare(title(b));

      if (mode === 'hardest') {
        if (a.stats.coverage !== b.stats.coverage) return a.stats.coverage - b.stats.coverage;
        if (b.stats.fresh !== a.stats.fresh) return b.stats.fresh - a.stats.fresh;
        return title(a).localeCompare(title(b));
      }

      if (b.stats.coverage !== a.stats.coverage) return b.stats.coverage - a.stats.coverage;
      if (a.stats.fresh !== b.stats.fresh) return a.stats.fresh - b.stats.fresh;
      return title(a).localeCompare(title(b));
    };
  }

  /* Der wievielte Satz ist die gemerkte Leseposition? */
  readingMark(entry, total) {
    const stored = this.reader.settings.reading[entry.folder.path];
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

    this.library.loadPackage(folder).then(async (entry) => {
      if (!this.contentEl.contains(body)) return;

      /* Das Wörterbuch der Person über das des Textes legen - ab jetzt
         sagt der Text dasselbe wie die Word card. */
      let dictionary = {};
      if (entry && entry.ok) {
        dictionary = await this.reader.dictionary.overlay(language, entry.data.dictionary);
      }
      /* Nach dem Warten noch einmal: Vielleicht ist die Person längst
         woanders. */
      if (!this.contentEl.contains(body)) return;

      page.empty();
      try {
        this.buildText(page, language, folder, entry, dictionary);
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

  buildText(page, language, folder, entry, dictionary) {
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
      this.dictionary = dictionary || data.dictionary || {};
      this.packageData = data;
      this.statusMap = this.library.wordStatusMap(language);
      /* Einmal je Text nachsehen, welche Wörter in der Kartei liegen -
         nicht einmal je Wort. */
      this.inDeck = this.deck.byKey(language);
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
      /* Und die Sätze, zu denen Ton im Paket liegt. Hat ein Paket keinen,
         erscheinen die Abspielknöpfe gar nicht erst - eine App, der die
         Hälfte der Knöpfe nichts tut, sieht kaputt aus. */
      this.audioFor = new Map();
      for (const paragraph of data.paragraphs || []) {
        for (const sentence of paragraph.sentences || []) {
          this.sentenceIds.push(sentence.id);
          const audio = sentence.audio;
          if (audio && audio.file) this.audioFor.set(sentence.id, audio);
        }
      }

      this.renderLevelSwitches(bar);
      this.updateProgress();
      /* Der Ton bekommt eine eigene Zeile mit Beschriftung. Als Symbol in
         der ohnehin vollen Kopfzeile hat ihn niemand gefunden. */
      if (this.audioFor.size > 0) this.renderAudioBar(bar);

      const text = page.createDiv({
        cls:
          'trisent-text' +
          (this.reader.settings.levels.gloss !== false ? ' is-gloss' : '') +
          ' is-mark-' + this.highlightMode()
      });
      for (const paragraph of data.paragraphs || []) {
        const block = text.createDiv({ cls: 'trisent-paragraph' });

        const spoken = (paragraph.sentences || [])
          .filter((sentence) => this.audioFor.has(sentence.id))
          .map((sentence) => this.playItem(sentence.id));

        /* Bei nur einem vertonten Satz täte der Absatzknopf genau dasselbe
           wie der Satzknopf daneben - zwei Knöpfe für eine Handlung. */
        const worthIt = spoken.length > 1;

        if (paragraph.speaker || worthIt) {
          const head = block.createDiv({ cls: 'trisent-paragraph-head' });
          if (paragraph.speaker) {
            head.createDiv({ cls: 'trisent-speaker', text: paragraph.speaker });
          }
          if (worthIt) {
            this.renderPlayButton(head, 'trisent-play-paragraph', spoken, 'Play this part');
          }
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
      const on = this.reader.settings.levels[level.id] !== false;
      const button = switches.createEl('button', {
        cls: 'trisent-switch' + (on ? ' is-on' : ''),
        attr: { 'aria-label': level.label, title: level.label }
      });
      button.createSpan({ text: level.short });
      button.addEventListener('click', async () => {
        this.reader.settings.levels[level.id] = !on;
        await this.reader.saveSettings();
        this.render();
      });
    }

    /* Durch die drei Stufen schalten, ohne in die Einstellungen zu gehen -
       beim Lesen merkt man ja erst, ob die Markierung stark genug ist. */
    const current = this.highlightMode();
    const at = HIGHLIGHTS.findIndex((h) => h.id === current);
    const mark = HIGHLIGHTS[at < 0 ? 0 : at];

    const paint = switches.createEl('button', {
      cls: 'trisent-switch trisent-switch-icon' + (mark.id === 'none' ? '' : ' is-on'),
      attr: { 'aria-label': mark.label, title: mark.label }
    });
    setIcon(paint, mark.icon);
    paint.addEventListener('click', async () => {
      const next = HIGHLIGHTS[(HIGHLIGHTS.indexOf(mark) + 1) % HIGHLIGHTS.length];
      this.reader.settings.highlight = next.id;
      await this.reader.saveSettings();
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
    const levels = this.reader.settings.levels;
    const wrap = block.createDiv({ cls: 'trisent-sentence' });
    wrap.dataset.sentence = sentence.id || '';

    /* Die schmale Spalte links steht bei jedem Satz, sobald das Paket
       überhaupt Ton hat - auch bei einem Satz ohne. Sonst rückten die
       Zeilen unterschiedlich weit ein. */
    if (this.audioFor.size > 0) {
      const gutter = wrap.createDiv({ cls: 'trisent-gutter' });
      if (this.audioFor.has(sentence.id)) {
        this.renderPlayButton(
          gutter, 'trisent-play-sentence',
          [this.playItem(sentence.id)], 'Play this sentence'
        );
        /* Nachsprechen gibt es nur da, wo es auch etwas zum Vergleichen
           gibt - ohne das Original wäre die Aufnahme wertlos. */
        this.renderRecordButton(gutter, sentence.id);
      }
    }

    const body = wrap.createDiv({ cls: 'trisent-sentence-body' });

    if (levels.source !== false || levels.gloss !== false) {
      const line = body.createDiv({ cls: 'trisent-line' });
      for (const group of this.groupsOf(sentence)) {
        const groupEl = line.createDiv({ cls: 'trisent-group' });
        for (const column of group) {
          this.renderColumn(groupEl, column, levels);
        }
      }
    }

    if (levels.fluent !== false) {
      body.createDiv({ cls: 'trisent-t', text: sentence.fluent || '' });
    }
  }

  /* Ein Abspielknopf. Alle drei Ebenen benutzen denselben - ein Absatz
     ist nur eine längere Liste von Sätzen als ein einzelner Satz. */
  renderPlayButton(parent, cls, items, label) {
    const button = parent.createEl('button', {
      cls: 'trisent-play ' + cls,
      attr: { 'aria-label': label, title: label }
    });
    setIcon(button, 'play');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.playback().play(items);
    });
    return button;
  }

  /* Hebt das Wort hervor, das gerade klingt. Bei Sprachen, in denen man
     die Wortgrenzen nicht hört, ist das der Unterschied zwischen "ich
     höre den Satz" und "ich sehe, wo ich gerade bin". */
  markSpokenWord(sentenceId, unitIndex) {
    if (!this.scrollEl) return;

    for (const el of this.scrollEl.querySelectorAll('.trisent-word.is-spoken')) {
      el.removeClass('is-spoken');
    }
    if (unitIndex === null || unitIndex === undefined) return;

    const word = this.scrollEl.querySelector(
      '.trisent-sentence[data-sentence="' + sentenceId + '"] .trisent-word[data-unit="' + unitIndex + '"]'
    );
    if (word) word.addClass('is-spoken');
  }

  /* Nachsprechen: aufnehmen, und danach beides hintereinander hören -
     erst sich selbst, dann den Muttersprachler. */
  renderRecordButton(gutter, sentenceId) {
    const button = gutter.createEl('button', {
      cls: 'trisent-record',
      attr: { 'aria-label': 'Say it yourself', title: 'Say it yourself' }
    });
    setIcon(button, 'mic');

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const taker = this.recorder();
      if (taker.running) {
        taker.stop();
        return;
      }
      /* Nicht gleichzeitig hören und sprechen. */
      this.stopAudio();
      taker.start(sentenceId);
    });
  }

  markRecording(sentenceId) {
    if (!this.scrollEl) return;
    for (const el of this.scrollEl.querySelectorAll('.trisent-record.is-recording')) {
      el.removeClass('is-recording');
      setIcon(el, 'mic');
    }
    const wrap = this.sentenceEl(sentenceId);
    const button = wrap && wrap.querySelector('.trisent-record');
    if (button) {
      button.addClass('is-recording');
      setIcon(button, 'square');
    }
  }

  /* Die Aufnahme steht - jetzt der Vergleich. */
  recordingDone(sentenceId, take) {
    this.markRecording(null);
    if (!take) return;
    this.renderTakeRow(sentenceId);
    this.compare(sentenceId);
  }

  compare(sentenceId) {
    const take = this.recorder().takeFor(sentenceId);
    if (!take || !this.audioFor.has(sentenceId)) return;

    const original = this.playItem(sentenceId);
    this.playback().play([
      { id: sentenceId, url: take.url, voice: 'you' },
      Object.assign({}, original, { voice: 'native' })
    ]);
  }

  /* Eine Zeile unter dem Satz, solange eine eigene Aufnahme dazu da ist.
     Nur bei einem Satz gleichzeitig - man vergleicht ja immer den, den
     man gerade gesprochen hat. */
  renderTakeRow(sentenceId) {
    for (const el of this.scrollEl.querySelectorAll('.trisent-take')) el.remove();

    const wrap = this.sentenceEl(sentenceId);
    const body = wrap && wrap.querySelector('.trisent-sentence-body');
    if (!body) return;

    const row = body.createDiv({ cls: 'trisent-take' });

    const again = row.createEl('button', { cls: 'trisent-take-button' });
    setIcon(again.createSpan({ cls: 'trisent-take-icon' }), 'repeat');
    again.createSpan({ text: 'Hear both again' });
    again.addEventListener('click', () => this.compare(sentenceId));

    const drop = row.createEl('button', {
      cls: 'trisent-take-button is-quiet',
      attr: { 'aria-label': 'Discard recording', title: 'Discard recording' }
    });
    setIcon(drop, 'trash-2');
    drop.addEventListener('click', () => {
      this.stopAudio();
      this.recorder().discard(sentenceId);
      row.remove();
    });
  }

  sentenceEl(sentenceId) {
    if (!this.scrollEl || !sentenceId) return null;
    return this.scrollEl.querySelector(
      '.trisent-sentence[data-sentence="' + sentenceId + '"]'
    );
  }

  /* Zeigt, welcher Satz gerade klingt. Beim Durchlaufen wandert die
     Anzeige mit und zieht die Seite nach, damit man nicht sucht. */
  markPlaying(sentenceId, state, follow, voice) {
    if (!this.scrollEl) return;

    const running = state === 'playing';
    const held = state === 'paused';

    for (const el of this.scrollEl.querySelectorAll('.trisent-sentence.is-playing')) {
      el.removeClass('is-playing');
    }
    for (const el of this.scrollEl.querySelectorAll('.trisent-play.is-playing')) {
      el.removeClass('is-playing');
      setIcon(el, 'play');
    }
    /* Beim Anhalten bleibt das Wort stehen, bei Stopp geht es weg. */
    if (!held) {
      for (const el of this.scrollEl.querySelectorAll('.trisent-word.is-spoken')) {
        el.removeClass('is-spoken');
      }
    }

    if (this.stopButton) this.stopButton.toggleClass('is-idle', !running && !held);

    if (this.speakButton) {
      this.speakButton.toggleClass('is-on', running || held);
      const icon = this.speakButton.querySelector('.trisent-speak-icon');
      const text = this.speakButton.querySelector('.trisent-speak-label');
      if (icon) setIcon(icon, running ? 'pause' : 'play');
      if (text) text.setText(running ? 'Pause' : held ? 'Continue' : 'Play text');
    }

    for (const el of this.scrollEl.querySelectorAll('.trisent-voice')) el.remove();
    if (!sentenceId) return;

    const wrap = this.sentenceEl(sentenceId);
    if (!wrap) return;
    wrap.addClass('is-playing');

    /* Beim Vergleich muss man wissen, wen man gerade hört - sonst ist der
       Vergleich wertlos. */
    if (voice) {
      const gutter = wrap.querySelector('.trisent-gutter');
      if (gutter) {
        /* Zwei Symbole statt zweier Wörter: Man hört ohnehin, wer spricht -
           es geht nur darum, auf einen Blick zu sehen, an welcher Stelle
           des Vergleichs man ist. Dieselben Symbole wie die Knöpfe darüber:
           Mikrofon für die eigene Stimme, Lautsprecher für die aus dem
           Paket. */
        const badge = gutter.createDiv({ cls: 'trisent-voice is-' + voice });
        setIcon(badge, voice === 'you' ? 'mic' : 'volume-2');
      }
    }

    const button = wrap.querySelector('.trisent-play');
    if (button) {
      button.addClass('is-playing');
      setIcon(button, running ? 'pause' : 'play');
    }

    if (!follow || !running) return;
    const box = this.scrollEl.getBoundingClientRect();
    const rect = wrap.getBoundingClientRect();
    if (rect.top < box.top + 12 || rect.bottom > box.bottom - 12) {
      this.scrollEl.scrollTop += rect.top - box.top - 80;
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
        wordEl = f.createSpan({
          cls: 'trisent-word' + (this.inDeck.has(column.unit.key) ? ' is-carded' : ''),
          text: column.f
        });
        wordEl.dataset.key = column.unit.key;
        if (column.unitIndex !== undefined) wordEl.dataset.unit = String(column.unitIndex);
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
    const stored = this.reader.settings.reading[this.packagePath];
    if (!stored) return null;
    /* Früher stand hier nur die Satz-ID. */
    if (typeof stored === 'string') return { sentence: stored, offset: 0 };
    return stored;
  }

  restoreReadingPosition(textEl) {
    /* Ein Sprung von der Wortkarte schlägt die gemerkte Stelle. */
    const jump = this.jumpTo;
    this.jumpTo = null;

    /* Die Wortkarte zu dem Wort, wegen dem man gekommen ist. */
    const show = this.openAfterText;
    this.openAfterText = null;
    if (show) window.setTimeout(() => this.openCard(show, null), 0);

    const stored = jump ? { sentence: jump, offset: 0 } : this.readingPosition();
    if (!stored || !stored.sentence) return;

    const target = textEl.querySelector(
      '.trisent-sentence[data-sentence="' + stored.sentence + '"]'
    );
    if (!target) return;

    if (jump) {
      /* Kurz aufleuchten lassen, sonst sucht man auf der Seite, wo man
         eigentlich gelandet ist. */
      target.addClass('is-arrived');
      window.setTimeout(() => target.removeClass('is-arrived'), 1600);
    }

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

    this.reader.settings.reading[this.packagePath] = {
      sentence: current.dataset.sentence,
      offset: offset
    };
    this.updateProgress();
    this.reader.saveSettingsSoon();
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

  /* Trägt zusammen, was über ein Wort bekannt ist.

     Der aktuelle Text steht sofort da, die übrigen Texte werden danach
     durchsucht - das Lesen der Pakete dauert, und die Karte soll nicht
     darauf warten. */
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
      /* Woher das Wort stammt - für den Verweis in der Wortnotiz. */
      packagePath: this.packagePath,
      phrases: [],
      occurrences: [],
      searching: true
    };

    const seenPhrases = new Set();
    const here = { title: null, path: this.packagePath };
    for (const paragraph of this.packageData.paragraphs || []) {
      for (const sentence of paragraph.sentences || []) {
        for (const item of matchesIn(sentence, key)) {
          card.occurrences.push(occurrenceOf(sentence, item, here));
        }
        for (const phrase of sentence.phrases || []) {
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
    this.reader.showCard(card);
    this.collectOccurrences(card);
  }

  /* Dieselbe Stelle in allen anderen Texten der Sprache. Erst hier wird
     aus einzelnen Texten ein Netz: Man sieht, in wie vielen Zusammenhängen
     einem dasselbe Wort schon begegnet ist. */
  async collectOccurrences(card) {
    const elsewhere = await searchPackages(this.library, card.language, card.key, {
      skipPath: this.packagePath
    });

    for (const occurrence of elsewhere) card.occurrences.push(occurrence);

    card.searching = false;
    this.reader.updateCard(card);
  }

  /* Von einer Fundstelle in einem anderen Text dorthin springen. */
  goTo(languageCode, path, sentenceId, key) {
    this.languageCode = languageCode;
    this.jumpTo = sentenceId;
    /* Kommt man von außen - etwa aus der Lernkartei -, soll nicht nur
       die Stelle dastehen, sondern auch die Erklärung dazu. Die Karte
       kann erst auf, wenn der Text geladen ist; deshalb gemerkt. */
    this.openAfterText = key || null;
    this.openText(path);
  }

  /* Ein Wort ist in die Kartei gewandert - die Ecke sofort setzen, an
     allen Vorkommen, ohne den Text neu zu zeichnen. */
  markDeck(key) {
    this.setDeckMark(key, true);
  }

  /* Und wieder weg, wenn die Karte aus der Kartei verschwindet. */
  unmarkDeck(key) {
    this.setDeckMark(key, false);
  }

  setDeckMark(key, on) {
    if (!this.scrollEl || !this.inDeck) return;
    if (on) this.inDeck.set(key, true);
    else this.inDeck.delete(key);

    for (const el of this.scrollEl.querySelectorAll('.trisent-word')) {
      if (el.dataset.key !== key) continue;
      if (on) el.addClass('is-carded');
      else el.removeClass('is-carded');
    }
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
    units.forEach((unit, index) => {
      between(cursor, unit.start);
      push(unit.surface, unit.gloss || '', unit.start, unit.end, unit);
      /* Die Zeitmarken zeigen auf diesen Index, nicht auf die Spalte. */
      columns[columns.length - 1].unitIndex = index;
      cursor = unit.end;
    });
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

  /* Einen Text aufzuschlagen ist die Beschäftigung, die zählt - nicht
     schon das Öffnen der App. */
  countToday() {
    const language = this.library.languageByCode(this.languageCode);
    if (!language) return;
    this.streak.touch(language).then((state) => {
      if (state) this.render();
    });
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
    this.reader.settings.lastLanguage = code;
    this.reader.saveSettings();
    this.render();
  }
}

module.exports = { TrisentView, VIEW_TYPE, RIBBON_ICON, LEVELS };
