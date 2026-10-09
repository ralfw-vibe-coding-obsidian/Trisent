"use strict";

/*
 * Der Translator - übersetzen üben, in Sitzungen.
 *
 * Eine Sitzung legt Sätze vor wie Karten. Vorn: zwei Sätze davor aus der
 * Geschichte, in der Fremdsprache, als Zusammenhang - und der Satz in der
 * Muttersprache. Darunter das Feld; die Person tippt oder spricht ihn in
 * der Fremdsprache. Nach "Check" dreht sich die Karte: hinten das
 * Original zum Anhören und was sie geschrieben hat, darunter das Urteil.
 *
 * Woraus gezogen wird: zufällige Sätze aus einer Geschichte, oder die
 * schwierigsten über alle Geschichten. Wie viele: 5, 7 oder 10. Keine
 * Wiedervorlage, kein Berg - die Regeln stehen in practice.js.
 *
 * Das Feld liegt UNTER der Karte, nicht auf ihr: Eine Karte mit offenem
 * Eingabefeld und Tastatur zu drehen, macht auf dem iPhone Ärger. So
 * dreht sich nur Text.
 */

const { ItemView, Notice, normalizePath, setIcon, setTooltip } = require('obsidian');
const { matchesText, hasTag, tagKey } = require('../learning/tags.js');
const { page: pageOf } = require('../flashcards/find.js');
const { judgeTranslation, explainTranslation } = require('./check.js');
const { Dictation } = require('./speech.js');
const {
  SIZES, isArchived, hardness, compareHardness, isExact, storyItems, Draw, Session, MARK
} = require('./practice.js');

const VIEW_TYPE = 'trisent-translator-view';
const RIBBON_ICON = 'pen-line';

const HARDEST = 'The hardest';

/* Wie viele Geschichten auf eine Seite gehen - wie im Reader. */
const STORY_PAGE = 10;

/* Wie viele Sitzungen auf eine Seite der Historie gehen - durch zwei
   und drei teilbar, damit die Spalten aufgehen. */
const HISTORY_PAGE = 12;

const VERDICT = {
  wrong: { label: 'Not yet', icon: 'x', cls: 'is-wrong' },
  /* Richtig, aber mit Fehlern, die einen zweiten Blick lohnen - erst
     bekannt, wenn die Erklärung da ist. Zählt wie richtig. */
  slips: { label: 'Correct', icon: 'check', cls: 'is-slips' },
  correct: { label: 'Correct', icon: 'check', cls: 'is-right' },
  exact: { label: 'Correct — word for word', icon: 'star', cls: 'is-exact' }
};

/* "9 Oct, 14:32" - in der Zeit des Ortes, an dem man gerade ist. */
function whenText(stamp) {
  const at = new Date(stamp);
  if (isNaN(at.getTime())) return '';
  try {
    return at.toLocaleString(undefined, {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  } catch (error) {
    return at.toISOString().slice(0, 16).replace('T', ' ');
  }
}

class TranslatorView extends ItemView {
  constructor(leaf, translator) {
    super(leaf);
    this.translator = translator;
    this.library = translator.library;
    this.records = translator.records;
    this.journal = translator.journal;
    this.streak = translator.streak;
    this.screen = 'languages';
    this.languageCode = null;
    /* Die laufende Sitzung - siehe begin(). */
    this.run = null;
    this.sound = null;
    /* Der Filter der Geschichten, wie im Reader: Suchwort UND (Tag ODER
       Tag). Bleibt stehen, wenn man aus einer Sitzung zurückkommt. */
    this.storyQuery = '';
    this.storyTags = [];
    this.storyAt = 0;
    this.historyAt = 0;
    /* Welcher Reiter offen ist: 'stories' oder 'sessions'. Bleibt stehen,
       wenn man aus einer Sitzung zurückkommt. */
    this.tab = 'stories';
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return 'Translate';
  }

  getIcon() {
    return RIBBON_ICON;
  }

  async onOpen() {
    /* Eine Sitzung schreibt ihre Zahlen in ihre Notiz; Obsidian liest sie
       einen Moment später ein. Dann die Historie nachziehen - nur sie,
       damit ein Suchfeld nicht den Fokus verliert. */
    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      if (this.screen !== 'start' || !file) return;
      const language = this.library.languageByCode(this.languageCode);
      if (!language || !file.path.startsWith(this.journal.folderPath(language) + '/')) return;
      window.clearTimeout(this.historyTimer);
      this.historyTimer = window.setTimeout(() => this.paintHistory(), 300);
    }));

    const last = this.translator.settings.lastLanguage;
    if (last && this.library.languageByCode(last)) {
      this.screen = 'start';
      this.languageCode = last;
    }
    this.render();
  }

  async onClose() {
    window.clearTimeout(this.typingTimer);
    window.clearTimeout(this.historyTimer);
    if (this.speech) this.speech.stop();
    this.stopSound();
  }

  get size() {
    const stored = Number(this.translator.settings.size);
    return SIZES.includes(stored) ? stored : SIZES[0];
  }

  render() {
    if (this.speech) this.speech.stop();
    this.stopSound();

    const root = this.contentEl;
    root.empty();
    root.addClass('trisent-view');
    root.addClass('trisent-translator');

    this.barEl = root.createDiv({ cls: 'trisent-topbar is-hidden' });
    this.barInner = this.barEl.createDiv({ cls: 'trisent-page' });
    this.scrollEl = root.createDiv({ cls: 'trisent-scroll' });
    const page = this.scrollEl.createDiv({ cls: 'trisent-page' });

    const language = this.library.languageByCode(this.languageCode);

    if (this.screen === 'session' && this.run && language) {
      if (this.run.session.done) this.renderSummary(page, language);
      else this.renderCard(page, language);
      return;
    }
    if (this.screen === 'start' && language) {
      this.renderStart(page, language);
      return;
    }
    this.renderLanguages(page);
  }

  useBar() {
    this.barEl.removeClass('is-hidden');
    this.barInner.empty();
    return this.barInner;
  }

  header(container, title, onBack, backLabel) {
    const head = container.createDiv({ cls: 'trisent-header' });
    if (onBack) {
      const back = head.createEl('button', { cls: 'trisent-back' });
      setIcon(back.createSpan(), 'chevron-left');
      back.createSpan({ text: backLabel });
      back.addEventListener('click', onBack);
    }
    head.createDiv({ cls: 'trisent-header-title', text: title });
    return head;
  }

  renderStreak(parent, language) {
    const days = this.streak.current(language);
    if (days <= 0) return;
    const badge = parent.createSpan({
      cls: 'trisent-streak',
      attr: { title: days + (days === 1 ? ' day' : ' days') + ' in a row' }
    });
    setIcon(badge.createSpan({ cls: 'trisent-streak-icon' }), 'flame');
    badge.createSpan({ text: String(days) });
  }

  /* ---------------------------------------------------------------- */
  /* Sprache wählen                                                    */
  /* ---------------------------------------------------------------- */

  renderLanguages(page) {
    page.createEl('h1', { text: 'Translate' });

    const languages = this.library.languages();
    if (languages.length === 0) {
      page.createEl('p', { cls: 'trisent-lead', text: 'No languages yet. Add one in the reader first.' });
      return;
    }

    page.createEl('p', {
      cls: 'trisent-lead',
      text: 'Write the sentences of your stories in the language you are learning.'
    });

    const grid = page.createDiv({ cls: 'trisent-language-grid' });
    for (const language of languages) {
      const card = grid.createEl('button', { cls: 'trisent-tile' });
      const top = card.createDiv({ cls: 'trisent-tile-top' });
      top.createSpan({ cls: 'trisent-flag', text: language.flag || '🏳️' });
      top.createSpan({ cls: 'trisent-tile-name', text: language.name });
      this.renderStreak(top, language);
      card.addEventListener('click', () => {
        if (language.code !== this.languageCode) {
          this.storyQuery = '';
          this.storyTags = [];
          this.storyAt = 0;
          this.historyAt = 0;
        }
        this.languageCode = language.code;
        this.screen = 'start';
        this.translator.settings.lastLanguage = language.code;
        this.translator.saveSettings();
        this.render();
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Eine Sitzung wählen                                               */
  /* ---------------------------------------------------------------- */

  /* Die Texte einer Sprache mit allem, was das Üben braucht: Sätze,
     bisherige Versuche, ausgeschlossene. */
  async stories(language) {
    const entries = await this.library.loadPackages(language);
    const out = [];
    for (const entry of entries) {
      if (!entry.ok) continue;
      const sentences = [];
      for (const paragraph of entry.data.paragraphs || []) {
        for (const sentence of paragraph.sentences || []) sentences.push(sentence);
      }
      const record = this.records.of(language, entry.folder);
      /* Geübt werden kann nur, was beides hat: die Vorlage in der
         Muttersprache und das Original. */
      const items = storyItems(entry.folder.path, sentences).filter((item) =>
        item.sentence.id && item.sentence.fluent && item.sentence.source);
      out.push({ entry: entry, items: items, record: record });
    }
    return out;
  }

  renderStart(page, language) {
    const head = this.header(this.useBar(), language.flag + ' ' + language.name, () => {
      this.screen = 'languages';
      this.render();
    }, 'Languages');
    this.renderStreak(head, language);

    /* Zwei Reiter: Geschichten (hier fängt man an) und Sitzungen (was
       man getan hat). Beides wird mit der Zeit lang - nebeneinander
       untereinander gestapelt, müsste man am einen vorbeirollen, um zum
       anderen zu kommen. */
    const tabs = page.createDiv({ cls: 'trisent-tr-tabs' });
    for (const tab of [{ id: 'stories', label: 'Stories' }, { id: 'sessions', label: 'Sessions' }]) {
      const button = tabs.createEl('button', {
        cls: 'trisent-tr-tab' + (tab.id === this.tab ? ' is-on' : ''),
        text: tab.label
      });
      button.addEventListener('click', () => {
        if (tab.id === this.tab) return;
        this.tab = tab.id;
        this.render();
      });
    }

    if (this.tab === 'sessions') {
      this.historyEl = page.createDiv({ cls: 'trisent-tr-history' });
      this.paintHistory();
      return;
    }
    this.historyEl = null;

    /* Wie viele Sätze - steht oben, gilt für beide Wege darunter. */
    const sizes = page.createDiv({ cls: 'trisent-tr-sizes' });
    sizes.createSpan({ cls: 'trisent-tr-label', text: 'Sentences' });
    for (const size of SIZES) {
      const chip = sizes.createEl('button', {
        cls: 'trisent-tr-size' + (size === this.size ? ' is-on' : ''),
        text: String(size)
      });
      chip.addEventListener('click', () => {
        this.translator.settings.size = size;
        this.translator.saveSettings();
        this.render();
      });
    }

    const hardest = page.createDiv({ cls: 'trisent-tr-hardest' });

    if (this.library.packagesOf(language).length > 1) this.renderStoryFilter(page, language);
    const list = page.createDiv({ cls: 'trisent-package-list' });
    list.createDiv({ cls: 'trisent-loading', text: '…' });
    const pager = page.createDiv({ cls: 'trisent-pager' });

    this.stories(language).then((stories) => {
      if (!this.contentEl.contains(list)) return;
      list.empty();

      this.renderHardest(hardest, language, stories);

      if (stories.length === 0) {
        list.createEl('p', { cls: 'trisent-muted', text: 'No texts in this language yet.' });
        return;
      }

      const texts = this.translator.plugin.learning.texts;
      for (const story of stories) {
        story.tags = texts ? texts.tags(language, story.entry.folder) : [];
      }
      stories.sort((a, b) => this.library.titleOf(a.entry).localeCompare(this.library.titleOf(b.entry)));
      this.shelf = { language: language, stories: stories, list: list, pager: pager };
      this.paintStories();
    }).catch((error) => {
      console.error('Trisent: could not show the texts', error);
      if (!this.contentEl.contains(list)) return;
      list.empty();
      list.createEl('p', {
        cls: 'trisent-muted',
        text: 'The texts could not be shown: ' + String((error && error.message) || error)
      });
    });
  }

  /* Suchfeld und Tags über den Geschichten - dieselben Tags wie im
     Reader, dieselbe Regel: Suchwort UND (Tag ODER Tag). */
  renderStoryFilter(page, language) {
    const texts = this.translator.plugin.learning.texts;
    const known = texts ? texts.allTags(language) : [];
    this.storyTags = this.storyTags.filter((tag) => hasTag(known, tag));

    const bar = page.createDiv({ cls: 'trisent-shelf-filter' });
    const search = bar.createDiv({ cls: 'trisent-shelf-search' });
    setIcon(search.createSpan({ cls: 'trisent-shelf-search-icon' }), 'search');
    const input = search.createEl('input', {
      cls: 'trisent-shelf-search-input',
      attr: { type: 'search', placeholder: 'Search titles', enterkeyhint: 'search' }
    });
    input.value = this.storyQuery;
    input.addEventListener('input', () => {
      this.storyQuery = input.value;
      this.storyAt = 0;
      this.paintStories();
    });

    if (known.length === 0) return;
    const chips = bar.createDiv({ cls: 'trisent-shelf-tags' });
    for (const tag of known) {
      const chip = chips.createEl('button', {
        cls: 'trisent-shelf-tag' + (hasTag(this.storyTags, tag) ? ' is-on' : ''),
        text: '#' + tag
      });
      chip.addEventListener('click', () => {
        const on = hasTag(this.storyTags, tag);
        this.storyTags = on
          ? this.storyTags.filter((own) => tagKey(own) !== tagKey(tag))
          : this.storyTags.concat([tag]);
        chip.toggleClass('is-on', !on);
        this.storyAt = 0;
        this.paintStories();
      });
    }
  }

  /* Die Geschichten zeichnen, wie Filter und Seite es wollen - ohne den
     Rest der Seite, sonst verlöre das Suchfeld den Fokus. */
  paintStories() {
    const shelf = this.shelf;
    if (!shelf || !this.contentEl.contains(shelf.list)) return;
    const { list, pager, language } = shelf;
    list.empty();
    pager.empty();

    const filter = { query: this.storyQuery, tags: this.storyTags };
    const found = shelf.stories.filter((story) => matchesText({
      title: story.entry.data.title || story.entry.folder.name,
      subtitle: story.entry.data.titleTranslation,
      tags: story.tags
    }, filter));

    if (found.length === 0) {
      list.createDiv({ cls: 'trisent-shelf-none', text: 'No story matches this filter.' });
      return;
    }

    const slice = pageOf(found, this.storyAt, STORY_PAGE);
    this.storyAt = slice.page;
    for (const story of slice.items) this.renderStory(list, language, story);
    this.renderPager(pager, slice, (to) => {
      this.storyAt = to;
      this.paintStories();
      list.scrollIntoView({ block: 'start' });
    });
  }

  /* Blättern - dasselbe Knopfpaar wie im Reader und in der Lernkartei.
     Nur da, wenn es mehr als eine Seite gibt. */
  renderPager(bar, slice, step) {
    if (slice.pages <= 1) return;
    const back = bar.createEl('button', { cls: 'trisent-page-step' });
    setIcon(back.createSpan(), 'chevron-left');
    back.setAttr('aria-label', 'Previous page');
    if (slice.page === 0) back.setAttr('disabled', 'true');
    else back.addEventListener('click', () => step(slice.page - 1));
    bar.createSpan({ cls: 'trisent-page-count', text: slice.from + '–' + slice.to + ' of ' + slice.count });
    const next = bar.createEl('button', { cls: 'trisent-page-step' });
    setIcon(next.createSpan(), 'chevron-right');
    next.setAttr('aria-label', 'Next page');
    if (slice.page >= slice.pages - 1) next.setAttr('disabled', 'true');
    else next.addEventListener('click', () => step(slice.page + 1));
  }

  /* Die Historie: jede Sitzung mit Quelle, Datum und Ergebnis, die
     neueste oben. Ein Tipp öffnet ihre Notiz - dort steht jeder Versuch. */
  paintHistory() {
    const slot = this.historyEl;
    const language = this.library.languageByCode(this.languageCode);
    if (!slot || !language || !this.contentEl.contains(slot)) return;
    slot.empty();

    const sessions = this.journal.sessions(language).filter((entry) => entry.done > 0);
    if (sessions.length === 0) {
      slot.createDiv({ cls: 'trisent-muted', text: 'Your sessions will show up here.' });
      return;
    }

    const slice = pageOf(sessions, this.historyAt, HISTORY_PAGE);
    this.historyAt = slice.page;
    const list = slot.createDiv({ cls: 'trisent-tr-history-list' });

    for (const entry of slice.items) {
      const row = list.createEl('button', { cls: 'trisent-tr-session' });
      const left = row.createDiv({ cls: 'trisent-tr-session-left' });
      left.createDiv({ cls: 'trisent-tr-session-source', text: entry.source || 'Session' });
      const meta = [whenText(entry.startedAt)];
      meta.push(entry.done === entry.planned
        ? entry.done + (entry.done === 1 ? ' sentence' : ' sentences')
        : entry.done + ' of ' + entry.planned + ' sentences');
      left.createDiv({ cls: 'trisent-tr-session-meta', text: meta.filter(Boolean).join(' · ') });

      /* Jeder Versuch als Punkt, grün oder rot - auf einen Blick, wie es
         lief. */
      if (entry.results.length > 0) {
        const dots = left.createDiv({ cls: 'trisent-tr-session-dots' });
        for (const result of entry.results) {
          dots.createSpan({
            cls: 'trisent-tr-dot ' + VERDICT[result].cls,
            attr: { title: VERDICT[result].label }
          });
        }
      }

      const share = Math.round((entry.right / entry.done) * 100);
      const score = row.createDiv({
        cls: 'trisent-tr-session-score' + (share >= 70 ? ' is-good' : share < 50 ? ' is-low' : '')
      });
      score.setText(share + ' %');

      row.addEventListener('click', () => {
        this.app.workspace.getLeaf('tab').openFile(entry.file);
      });
    }

    this.renderPager(slot.createDiv({ cls: 'trisent-pager' }), slice, (to) => {
      this.historyAt = to;
      this.paintHistory();
      slot.scrollIntoView({ block: 'start' });
    });
  }

  /* Die schwierigsten Sätze über alle Geschichten. */
  hardestItems(stories) {
    const found = [];
    for (const story of stories) {
      for (const item of story.items) {
        const id = item.sentence.id;
        const h = hardness(story.record.marks[id], story.record.excluded.has(id));
        if (h) found.push({ item: item, h: h });
      }
    }
    found.sort((a, b) => compareHardness(a.h, b.h));
    return found.map((entry) => entry.item);
  }

  renderHardest(slot, language, stories) {
    const items = this.hardestItems(stories);
    const button = slot.createEl('button', { cls: 'trisent-tr-hard' + (items.length ? '' : ' is-empty') });
    const icon = button.createSpan({ cls: 'trisent-tr-hard-icon' });
    setIcon(icon, 'flame');
    const text = button.createDiv({ cls: 'trisent-tr-hard-text' });
    text.createDiv({ cls: 'trisent-tr-hard-title', text: HARDEST });
    text.createDiv({
      cls: 'trisent-tr-hard-sub',
      text: items.length === 0
        ? 'Sentences you got wrong will gather here.'
        : items.length + (items.length === 1 ? ' sentence' : ' sentences')
          + ' you found hard, from all your stories'
    });

    if (items.length === 0) {
      button.setAttr('disabled', 'true');
      return;
    }
    button.addEventListener('click', () => {
      this.begin(language, HARDEST, stories, new Draw(items, { mode: 'hardest', size: this.size }));
    });
  }

  renderStory(list, language, story) {
    const entry = story.entry;
    const total = story.items.length;
    const open = story.items.filter((item) => !isArchived(
      story.record.marks[item.sentence.id], story.record.excluded.has(item.sentence.id)
    ));

    const row = list.createEl('button', {
      cls: 'trisent-text-row' + (open.length === 0 ? ' is-finished' : '')
    });
    const left = row.createDiv({ cls: 'trisent-t-left' });
    left.createDiv({ cls: 'trisent-t-title', text: entry.data.title || entry.folder.name });
    if (entry.data.titleTranslation) {
      left.createDiv({ cls: 'trisent-t-sub', text: entry.data.titleTranslation });
    }

    const note = row.createDiv({ cls: 'trisent-t-note' });
    const archived = total - open.length;
    note.createDiv({
      text: open.length === 0
        ? 'All ' + total + ' sentences archived'
        : open.length + ' of ' + total + ' to practise'
    });
    if (archived > 0 && open.length > 0) note.createDiv({ text: archived + ' archived' });

    if (open.length === 0) {
      row.setAttr('disabled', 'true');
      return;
    }
    row.addEventListener('click', () => {
      this.begin(language, entry.data.title || entry.folder.name, [story], new Draw(open, { size: this.size }));
    });
  }

  /* ---------------------------------------------------------------- */
  /* Die Sitzung                                                       */
  /* ---------------------------------------------------------------- */

  begin(language, source, stories, draw) {
    const byText = new Map(stories.map((story) => [story.entry.folder.path, story.entry]));
    this.run = {
      language: language,
      source: source,
      stories: stories,
      byText: byText,
      session: new Session(draw, this.size),
      journalFile: null,
      counted: false,
      /* Was nach dem Prüfen auf der Rückseite steht. */
      checked: null
    };
    this.screen = 'session';
    this.render();
  }

  stop() {
    this.run = null;
    this.screen = 'start';
    this.render();
  }

  renderCard(page, language) {
    const run = this.run;
    const session = run.session;
    const item = session.card;
    const entry = run.byText.get(item.text);

    const bar = this.useBar();
    const head = this.header(bar, run.source, () => this.stop(), 'Stop');
    head.createDiv({
      cls: 'trisent-tr-count',
      text: session.position + ' / ' + session.size
    });
    const progress = bar.createDiv({ cls: 'trisent-tr-progress' });
    progress.createDiv({ cls: 'trisent-tr-progress-fill' }).style.width =
      Math.round((session.results.length / session.size) * 100) + '%';

    /* Die Karte. Beide Seiten liegen übereinander; die Rückseite wird
       erst nach dem Prüfen gefüllt. */
    const stage = page.createDiv({ cls: 'trisent-tr-stage' });
    const flip = stage.createDiv({ cls: 'trisent-tr-flip' });
    const inner = flip.createDiv({ cls: 'trisent-tr-flip-inner' });
    const front = inner.createDiv({ cls: 'trisent-tr-face is-front' });
    const back = inner.createDiv({ cls: 'trisent-tr-face is-back' });

    this.renderContext(front, item);
    front.createDiv({ cls: 'trisent-tr-prompt', text: item.sentence.fluent });
    if (run.source === HARDEST && entry) {
      front.createDiv({ cls: 'trisent-tr-from', text: entry.data.title || entry.folder.name });
    }

    const below = page.createDiv({ cls: 'trisent-tr-below' });
    this.renderAnswer(below, language, item, entry, flip, back);
  }

  /* Die zwei Sätze davor, in der Fremdsprache. Blass: Sie sind der Weg
     in die Szene, nicht die Aufgabe. */
  renderContext(face, item) {
    const context = face.createDiv({ cls: 'trisent-tr-context' });
    if (item.context.length === 0) {
      context.createDiv({ cls: 'trisent-tr-context-start', text: 'Beginning of the story' });
      return;
    }
    for (const sentence of item.context) {
      context.createDiv({ cls: 'trisent-tr-context-line', text: sentence.source || '' });
    }
  }

  renderAnswer(below, language, item, entry, flip, back) {
    const run = this.run;

    const field = below.createEl('textarea', {
      cls: 'trisent-tr-input',
      attr: {
        rows: '2',
        placeholder: 'In ' + language.name + '…',
        enterkeyhint: 'done',
        autocapitalize: 'sentences',
        spellcheck: 'false'
      }
    });
    this.keepVisible(field);

    /* Gleich weiterschreiben können: Jede neue Karte entsteht aus einem
       Tipp oder Enter (Start, Next, Exclude), und der Cursor steht schon
       im Feld. Noch innerhalb dieses Tipps - nur dann holt das iPhone
       die Tastatur hervor. */
    window.requestAnimationFrame(() => {
      if (field.isConnected) field.focus({ preventScroll: true });
    });
    field.focus({ preventScroll: true });

    const row = below.createDiv({ cls: 'trisent-tr-row' });
    const check = row.createEl('button', { cls: 'trisent-tr-check', text: 'Check' });
    this.keepFocus(check);

    /* Einsprechen statt tippen. Eines von beiden - wer getippt hat, redet
       nicht mehr in dasselbe Feld hinein. */
    const mic = row.createEl('button', {
      cls: 'trisent-dictate',
      attr: { 'aria-label': 'Say your translation' }
    });
    setIcon(mic, 'mic');
    setTooltip(mic, 'Say your translation');
    this.keepFocus(mic);

    const status = row.createSpan({ cls: 'trisent-task-status' });

    /* Leise und rechts: ein Satz, den man nicht mehr sehen will. Kein
       Versuch - an seine Stelle tritt der nächste. */
    const exclude = row.createEl('button', { cls: 'trisent-tr-exclude' });
    setIcon(exclude.createSpan(), 'archive-x');
    exclude.createSpan({ text: 'Exclude' });
    setTooltip(exclude, 'Never show this sentence again');
    this.keepFocus(exclude);

    const result = below.createDiv({ cls: 'trisent-tr-result' });

    /* Was zuletzt eingesprochen wurde. Steht genau das noch im Feld, gilt
       die Antwort als gesprochen - wer daran getippt hat, hat getippt. */
    let spoken = null;

    const lockForTyping = () => {
      const typed = field.value.trim().length > 0;
      if (typed) mic.setAttr('disabled', 'true');
      else mic.removeAttribute('disabled');
    };
    field.addEventListener('input', lockForTyping);

    const run_check = async () => {
      const answer = field.value.trim();
      if (!answer) {
        field.focus();
        return;
      }
      /* Jetzt darf die Tastatur gehen - der Tipp ist angekommen. */
      field.blur();
      field.setAttr('disabled', 'true');
      check.setAttr('disabled', 'true');
      mic.setAttr('disabled', 'true');
      exclude.setAttr('disabled', 'true');
      check.setText('Checking…');
      result.empty();

      const settings = this.translator.settings;
      const pay = (cost) => this.translator.addCost(cost);
      const task = {
        spoken: spoken !== null && spoken.trim() === answer,
        prompt: item.sentence.fluent,
        reference: item.sentence.source,
        answer: answer,
        fromLanguage: entry.data.fluentLanguage,
        toLanguage: entry.data.language,
        feedbackLanguage: entry.data.glossLanguage || entry.data.fluentLanguage
      };

      /* Wortgleich mit dem Original: Da gibt es nichts zu fragen - die
         Karte dreht sich sofort. */
      let outcome = 'exact';
      if (!isExact(answer, item.sentence.source)) {
        try {
          outcome = (await judgeTranslation(settings, task, pay)) ? 'correct' : 'wrong';
        } catch (error) {
          /* Die Prüfung kam nicht zustande - kein Versuch, noch einmal. */
          result.createDiv({ cls: 'trisent-tr-error', text: String(error.message || error) });
          field.removeAttribute('disabled');
          check.removeAttribute('disabled');
          exclude.removeAttribute('disabled');
          lockForTyping();
          check.setText('Check');
          return;
        }
      }

      run.session.record(outcome);
      const number = run.session.results.length;

      /* Die Erklärung kommt nach - die Karte wartet nicht auf sie. */
      const explained = outcome === 'exact'
        ? Promise.resolve({ note: '', issues: [] })
        : explainTranslation(settings, task, outcome !== 'wrong', pay)
          .catch((error) => ({ note: '', issues: [], failed: String(error.message || error) }));

      this.turn(below, back, flip, item, entry, answer, outcome, explained, task.spoken);
      this.save(run, language, item, entry, answer, outcome, explained, number, task.spoken);
    };

    check.addEventListener('click', run_check);
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        run_check();
      }
    });

    exclude.addEventListener('click', async () => {
      exclude.setAttr('disabled', 'true');
      try {
        await this.records.exclude(language, entry.folder, entry.data, item.sentence.id);
      } catch (error) {
        new Notice('Could not exclude this sentence: ' + String(error.message || error));
        exclude.removeAttribute('disabled');
        return;
      }
      run.session.exclude();
      this.render();
    });

    const idle = () => {
      mic.removeClass('is-recording');
      mic.removeClass('is-working');
      setIcon(mic, 'mic');
      status.setText('');
    };

    mic.addEventListener('click', async () => {
      const dictation = this.dictation();
      if (dictation.running) {
        dictation.stop();
        /* Sofort zeigen, dass es weitergeht - sonst wirkt der Tipp, als
           sei er ins Leere gegangen. */
        mic.removeClass('is-recording');
        mic.addClass('is-working');
        mic.setAttr('disabled', 'true');
        setIcon(mic, 'loader');
        status.setText('Writing it down…');
        return;
      }

      dictation.language = entry.data.language;
      /* Wer spricht, braucht die Tastatur nicht - erst jetzt, wo der Tipp
         angekommen ist, darf sie gehen. */
      field.blur();
      field.setAttr('disabled', 'true');
      check.setAttr('disabled', 'true');
      result.empty();

      let text = '';
      try {
        text = await dictation.record(() => {
          mic.addClass('is-recording');
          setIcon(mic, 'square');
          status.setText('Listening… tap again when you are done');
        });
        if (text) {
          field.value = text;
          spoken = text;
        }
      } catch (error) {
        result.createDiv({ cls: 'trisent-tr-error', text: String(error.message || error) });
      }

      idle();
      mic.removeAttribute('disabled');
      field.removeAttribute('disabled');
      check.removeAttribute('disabled');
      lockForTyping();

      /* Wer eingesprochen hat, will das Urteil - nicht noch einen Knopf. */
      if (text) run_check();
      else if (!result.hasChildNodes()) field.focus();
    });
  }

  /* Festhalten: im Text, im Tagebuch, im Streak. Läuft neben dem
     Umdrehen her - die Person soll nicht auf die Platte warten.

     Der Stand des Satzes wird sofort geschrieben. Ins Tagebuch kommt der
     Versuch, sobald die Erklärung da ist. Die Versuche einer Sitzung
     reihen sich dabei hintereinander ein: Wer schnell weitertippt, darf
     keine zweite Sitzungsnotiz bekommen und keine vertauschte
     Reihenfolge. */
  save(run, language, item, entry, answer, outcome, explained, number, spoken) {
    this.records.record(language, entry.folder, entry.data, item.sentence.id, outcome)
      .catch((error) => new Notice('Could not save this attempt: ' + String(error.message || error)));

    run.saving = (run.saving || Promise.resolve()).then(async () => {
      const verdict = await explained;
      try {
        if (!run.journalFile) {
          run.journalFile = await this.journal.start(language, run.source, run.session.size);
        }
        await this.journal.add(run.journalFile, number, {
          prompt: item.sentence.fluent,
          answer: answer,
          reference: item.sentence.source,
          result: outcome,
          note: verdict.note,
          issues: verdict.issues,
          title: entry.data.title || entry.folder.name,
          spoken: spoken
        });
        if (!run.counted) {
          run.counted = true;
          await this.streak.touch(language);
        }
      } catch (error) {
        new Notice('Could not save this attempt: ' + String(error.message || error));
      }
    });
  }

  /* Die Karte umdrehen und darunter das Urteil zeigen. Die Seite wird
     dafür NICHT neu gezeichnet - sonst entstünde die Karte neu und stünde
     ohne Bewegung auf der Rückseite. */
  turn(below, back, flip, item, entry, answer, outcome, explained, spoken) {
    this.renderContext(back, item);
    back.createDiv({ cls: 'trisent-tr-prompt-small', text: item.sentence.fluent });

    const original = back.createDiv({ cls: 'trisent-tr-original' });
    const audio = item.sentence.audio && item.sentence.audio.file
      ? entry.folder.path + '/' + item.sentence.audio.file
      : null;
    if (audio) this.renderSpeaker(original, audio);
    this.renderOriginal(original.createSpan({ cls: 'trisent-tr-original-text' }), item.sentence, entry);

    const mine = back.createDiv({ cls: 'trisent-tr-mine ' + VERDICT[outcome].cls });
    mine.createSpan({ cls: 'trisent-tr-mine-label', text: spoken ? 'You said' : 'You wrote' });
    mine.createSpan({ cls: 'trisent-tr-mine-text', text: answer });

    flip.addClass('is-turned');

    below.empty();
    const box = below.createDiv({ cls: 'trisent-tr-verdict ' + VERDICT[outcome].cls });
    const badge = box.createDiv({ cls: 'trisent-tr-badge' });
    setIcon(badge.createSpan(), VERDICT[outcome].icon);
    const badgeText = badge.createSpan({ text: VERDICT[outcome].label });

    /* Die Erklärung läuft nach. Bis dahin ein ruhiger Platzhalter, damit
       die Knöpfe darunter nicht springen, wenn sie kommt. */
    const explanation = box.createDiv({ cls: 'trisent-tr-explanation' });
    if (outcome === 'exact') {
      explanation.createDiv({ cls: 'trisent-tr-note', text: 'Word for word — just like the original.' });
    } else {
      explanation.createDiv({ cls: 'trisent-tr-waiting', text: 'Looking closer…' });
      explained.then((verdict) => {
        if (!explanation.isConnected) return;
        explanation.empty();

        /* Richtig, aber nicht fehlerfrei: Das soll man sehen, statt es
           unter einem grünen Haken zu überlesen. */
        const slips = (verdict.issues || []).length;
        if (outcome === 'correct' && slips > 0) {
          box.removeClass(VERDICT.correct.cls);
          box.addClass(VERDICT.slips.cls);
          badgeText.setText('Correct — ' + slips + (slips === 1 ? ' slip' : ' slips'));
          mine.removeClass(VERDICT.correct.cls);
          mine.addClass(VERDICT.slips.cls);
        }
        if (verdict.note) explanation.createDiv({ cls: 'trisent-tr-note', text: verdict.note });
        if (verdict.issues && verdict.issues.length > 0) {
          const issues = explanation.createEl('ul', { cls: 'trisent-tr-issues' });
          for (const issue of verdict.issues) issues.createEl('li', { text: issue });
        }
        if (verdict.failed) {
          explanation.createDiv({ cls: 'trisent-tr-error', text: 'No explanation this time: ' + verdict.failed });
        }
      });
    }

    const session = this.run.session;
    const last = session.results.length >= session.size;
    const row = below.createDiv({ cls: 'trisent-tr-row is-next' });
    const next = row.createEl('button', { cls: 'trisent-tr-next' });
    next.createSpan({ text: last ? 'Finish' : 'Next' });
    setIcon(next.createSpan(), last ? 'flag' : 'arrow-right');
    const go = () => {
      session.next();
      this.render();
    };
    next.addEventListener('click', go);
    /* Enter selbst abfangen: Sonst landete derselbe Tastendruck nach dem
       Umschalten als Zeilenumbruch im neuen Feld. */
    next.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      go();
    });
    window.setTimeout(() => next.focus({ preventScroll: true }), 50);
  }

  /* Das Original mit antippbaren Wörtern: Wer hier über ein Wort
     stolpert, öffnet seine Word card und kann es in den Index nehmen -
     als "beim Übersetzen aufgefallen". Wörter, die schon im Index
     stehen, tragen den kleinen Ring wie im Reader (dort an- und
     abschaltbar, hier gilt dieselbe Einstellung). */
  renderOriginal(slot, sentence, entry) {
    const text = String(sentence.source || '');
    const language = this.run ? this.run.language : null;
    const units = (sentence.units || [])
      .filter((unit) => unit && unit.key && Number.isInteger(unit.start) && Number.isInteger(unit.end)
        && unit.end > unit.start && unit.end <= text.length)
      .sort((a, b) => a.start - b.start);

    if (!language || units.length === 0) {
      slot.setText(text);
      return;
    }

    const marksOn = this.translator.plugin.settings.reader.indexMarks !== false;
    const inIndex = marksOn ? this.translator.plugin.learning.wordIndex.activeKeys(language) : new Set();

    let at = 0;
    for (const unit of units) {
      if (unit.start < at) continue;
      if (unit.start > at) slot.appendText(text.slice(at, unit.start));
      const word = slot.createSpan({
        cls: 'trisent-tr-word' + (inIndex.has(unit.key) ? ' is-indexed' : ''),
        text: text.slice(unit.start, unit.end),
        attr: { role: 'button', tabindex: '0' }
      });
      const open = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.showWord(language, unit.key);
      };
      word.addEventListener('click', open);
      word.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') open(event);
      });
      at = unit.end;
    }
    if (at < text.length) slot.appendText(text.slice(at));
  }

  async showWord(language, key) {
    const reader = this.translator.plugin.reader;
    if (!reader) return;
    try {
      await reader.showWord(language, key, null, { origin: 'translator' });
    } catch (error) {
      new Notice('Could not show this word: ' + String(error.message || error));
    }
  }

  renderSummary(page, language) {
    const run = this.run;
    const session = run.session;
    const done = session.results.length;

    this.header(this.useBar(), run.source, () => this.stop(), 'Back');

    page.createEl('h1', { text: 'Done' });
    if (done === 0) {
      page.createEl('p', { cls: 'trisent-lead', text: 'There was nothing left to practise here.' });
    } else {
      const right = session.right;
      const share = Math.round((right / done) * 100);
      page.createEl('p', {
        cls: 'trisent-lead',
        text: right + ' of ' + done + (done === 1 ? ' sentence' : ' sentences') + ' right — ' + share + ' %'
      });

      const marks = page.createDiv({ cls: 'trisent-tr-marks' });
      for (const entry of session.results) {
        marks.createSpan({ cls: 'trisent-tr-mark ' + VERDICT[entry.result].cls, text: MARK[entry.result] });
      }
    }

    const days = this.streak.current(language);
    if (days > 0) {
      page.createEl('p', { cls: 'trisent-muted', text: days === 1 ? 'Day one.' : days + ' days in a row.' });
    }

    const row = page.createDiv({ cls: 'trisent-tr-row is-next' });
    const back = row.createEl('button', { cls: 'trisent-tr-next' });
    back.createSpan({ text: 'Back to the stories' });
    back.addEventListener('click', () => this.stop());
  }

  /* ---------------------------------------------------------------- */
  /* Hilfen                                                            */
  /* ---------------------------------------------------------------- */

  dictation() {
    if (!this.speech) {
      this.speech = new Dictation(this.translator.settings, (cost) => this.translator.addCost(cost));
    }
    return this.speech;
  }

  /* Auf dem Telefon schiebt sich die Tastatur über das Feld. Solange
     geschrieben wird, unten Platz schaffen und das Feld nach oben holen. */
  keepVisible(field) {
    field.addEventListener('focus', () => {
      window.clearTimeout(this.typingTimer);
      if (this.scrollEl) this.scrollEl.addClass('is-typing');
      window.setTimeout(() => field.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350);
    });
    /* Den Platz erst etwas später einziehen: Sonst rutscht "Check" unter
       dem Finger weg, und der erste Tipp ginge ins Leere. */
    field.addEventListener('blur', () => {
      window.clearTimeout(this.typingTimer);
      this.typingTimer = window.setTimeout(() => {
        if (this.scrollEl) this.scrollEl.removeClass('is-typing');
      }, 400);
    });
  }

  /* Ein Knopf neben dem Feld wirkt beim ersten Tipp: Das Feld behält den
     Fokus, bis der Klick angekommen ist. */
  keepFocus(button) {
    button.addEventListener('mousedown', (event) => event.preventDefault());
  }

  renderSpeaker(parent, path) {
    const button = parent.createEl('button', { cls: 'trisent-tr-play' });
    const icon = button.createSpan();
    setIcon(icon, 'play');
    setTooltip(button, 'Hear this sentence');
    button.addEventListener('click', () => this.toggleSound(button, icon, path));
  }

  toggleSound(button, icon, path) {
    if (this.soundButton === button) {
      this.stopSound();
      return;
    }
    this.stopSound();

    let url;
    try {
      url = this.app.vault.adapter.getResourcePath(normalizePath(path));
    } catch (error) {
      new Notice('Could not find the sound for this sentence.');
      return;
    }

    const sound = new Audio(url);
    this.sound = sound;
    this.soundButton = button;
    this.soundIcon = icon;
    button.addClass('is-playing');
    setIcon(icon, 'square');

    sound.addEventListener('ended', () => this.stopSound());
    sound.addEventListener('error', () => {
      new Notice('Could not play this sentence.');
      this.stopSound();
    });
    sound.play().catch(() => this.stopSound());
  }

  stopSound() {
    if (this.sound) {
      this.sound.pause();
      this.sound = null;
    }
    if (this.soundButton) {
      this.soundButton.removeClass('is-playing');
      if (this.soundIcon) setIcon(this.soundIcon, 'play');
    }
    this.soundButton = null;
    this.soundIcon = null;
  }
}

module.exports = { TranslatorView, VIEW_TYPE, RIBBON_ICON };
