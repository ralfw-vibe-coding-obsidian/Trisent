"use strict";

/*
 * Exercises - Übungen, die zum Übersetzen hinführen.
 *
 * Vom Deutschen ins Französische zu übersetzen ist schwer: Man muss die
 * Wörter finden, sie beugen und in die richtige Reihenfolge bringen.
 * Jede Übung hier nimmt einen Teil davon ab, damit der andere geübt
 * werden kann. Die erste ist das Satzpuzzle (puzzle.js): Die Wörter sind
 * da, nur die Reihenfolge fehlt.
 *
 * Der Ablauf wie im Translator: eine Geschichte oder die schwierigsten
 * Sätze, 5, 7 oder 10 davon, am Ende auf Wunsch die falschen noch
 * einmal. Anders als dort: keine Buchführung. Hier wird nur geübt.
 */

const { ItemView, Notice, normalizePath, setIcon, setTooltip } = require('obsidian');
const { matchesText, hasTag, tagKey } = require('../learning/tags.js');
const { page: pageOf } = require('../flashcards/find.js');
const {
  SIZES, hardness, compareHardness, storyItems, Draw, Session
} = require('../translator/practice.js');
const { tilesOf, shuffleTiles, checkOrder } = require('./puzzle.js');

const VIEW_TYPE = 'trisent-exercises-view';
const RIBBON_ICON = 'puzzle';

const HARDEST = 'The hardest';
const STORY_PAGE = 10;

/* Die Übungsarten. Weitere kommen hinzu: Lücken mit Auswahl, die
   richtige Form, aus Grundformen bauen, hören und schreiben. */
const TYPES = [
  { id: 'puzzle', label: 'Puzzle', icon: 'puzzle', hint: 'Put the words in order' }
];

class ExercisesView extends ItemView {
  constructor(leaf, exercises) {
    super(leaf);
    this.exercises = exercises;
    this.library = exercises.library;
    this.screen = 'languages';
    this.languageCode = null;
    this.run = null;
    this.storyQuery = '';
    this.storyTags = [];
    this.storyAt = 0;
    this.sound = null;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return 'Exercises';
  }

  getIcon() {
    return RIBBON_ICON;
  }

  get settings() {
    return this.exercises.settings;
  }

  get size() {
    const stored = Number(this.settings.size);
    return SIZES.includes(stored) ? stored : SIZES[0];
  }

  get type() {
    return TYPES.some((type) => type.id === this.settings.type) ? this.settings.type : TYPES[0].id;
  }

  async onOpen() {
    const last = this.settings.lastLanguage;
    if (last && this.library.languageByCode(last)) {
      this.screen = 'start';
      this.languageCode = last;
    }
    this.registerDomEvent(document, 'keydown', (event) => this.onKey(event));
    this.render();
  }

  async onClose() {
    this.stopSound();
  }

  render() {
    this.stopSound();
    const root = this.contentEl;
    root.empty();
    root.addClass('trisent-view');
    root.addClass('trisent-exercises');

    this.barEl = root.createDiv({ cls: 'trisent-topbar is-hidden' });
    this.barInner = this.barEl.createDiv({ cls: 'trisent-page' });
    this.scrollEl = root.createDiv({ cls: 'trisent-scroll' });
    const page = this.scrollEl.createDiv({ cls: 'trisent-page' });

    const language = this.library.languageByCode(this.languageCode);
    this.keyAction = null;

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

  /* Am Schreibtisch tippt man lieber, als zu zielen: Enter prüft bzw.
     geht weiter. */
  onKey(event) {
    if (this.app.workspace.getActiveViewOfType(ExercisesView) !== this) return;
    if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (!this.keyAction) return;
    event.preventDefault();
    this.keyAction();
  }

  /* ---------------------------------------------------------------- */
  /* Sprache wählen                                                    */
  /* ---------------------------------------------------------------- */

  renderLanguages(page) {
    page.createEl('h1', { text: 'Exercises' });
    const languages = this.library.languages();
    if (languages.length === 0) {
      page.createEl('p', { cls: 'trisent-lead', text: 'No languages yet. Add one in the reader first.' });
      return;
    }
    page.createEl('p', {
      cls: 'trisent-lead',
      text: 'Small steps towards translating into the language you are learning.'
    });

    const grid = page.createDiv({ cls: 'trisent-language-grid' });
    for (const language of languages) {
      const tile = grid.createEl('button', { cls: 'trisent-tile' });
      const top = tile.createDiv({ cls: 'trisent-tile-top' });
      top.createSpan({ cls: 'trisent-flag', text: language.flag || '🏳️' });
      top.createSpan({ cls: 'trisent-tile-name', text: language.name });
      tile.addEventListener('click', () => {
        if (language.code !== this.languageCode) {
          this.storyQuery = '';
          this.storyTags = [];
          this.storyAt = 0;
        }
        this.languageCode = language.code;
        this.screen = 'start';
        this.settings.lastLanguage = language.code;
        this.exercises.saveSettings();
        this.render();
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Eine Übung wählen                                                 */
  /* ---------------------------------------------------------------- */

  async stories(language) {
    const entries = await this.library.loadPackages(language);
    const records = this.exercises.records();
    const out = [];
    for (const entry of entries) {
      if (!entry.ok) continue;
      const sentences = [];
      for (const paragraph of entry.data.paragraphs || []) {
        for (const sentence of paragraph.sentences || []) sentences.push(sentence);
      }
      /* Geübt werden kann, was Vorlage, Original und Wörter hat. */
      const items = storyItems(entry.folder.path, sentences).filter((item) =>
        item.sentence.id && item.sentence.fluent && item.sentence.source
        && (item.sentence.units || []).length > 0);
      const record = records ? records.of(language, entry.folder) : { marks: {}, excluded: new Set() };
      out.push({ entry: entry, items: items, record: record });
    }
    return out;
  }

  renderStart(page, language) {
    this.header(this.useBar(), language.flag + ' ' + language.name, () => {
      this.screen = 'languages';
      this.render();
    }, 'Languages');

    /* Welche Übung. */
    const types = page.createDiv({ cls: 'trisent-ex-types' });
    for (const type of TYPES) {
      const button = types.createEl('button', {
        cls: 'trisent-ex-type' + (type.id === this.type ? ' is-on' : '')
      });
      setIcon(button.createSpan({ cls: 'trisent-ex-type-icon' }), type.icon);
      const text = button.createSpan({ cls: 'trisent-ex-type-text' });
      text.createSpan({ cls: 'trisent-ex-type-label', text: type.label });
      text.createSpan({ cls: 'trisent-ex-type-hint', text: type.hint });
      button.addEventListener('click', () => {
        this.settings.type = type.id;
        this.exercises.saveSettings();
        this.render();
      });
    }

    /* Wie viele Sätze. */
    const sizes = page.createDiv({ cls: 'trisent-ex-sizes' });
    sizes.createSpan({ cls: 'trisent-ex-label', text: 'Sentences' });
    for (const size of SIZES) {
      const chip = sizes.createEl('button', {
        cls: 'trisent-ex-size' + (size === this.size ? ' is-on' : ''),
        text: String(size)
      });
      chip.addEventListener('click', () => {
        this.settings.size = size;
        this.exercises.saveSettings();
        this.render();
      });
    }

    const hardest = page.createDiv({ cls: 'trisent-ex-hardest' });
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
      const texts = this.exercises.plugin.learning.texts;
      for (const story of stories) story.tags = texts ? texts.tags(language, story.entry.folder) : [];
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

  /* Die schwierigsten Sätze - dieselben wie im Translator: die, an denen
     die Person beim Übersetzen am häufigsten gescheitert ist. */
  renderHardest(slot, language, stories) {
    const found = [];
    for (const story of stories) {
      for (const item of story.items) {
        const id = item.sentence.id;
        const h = hardness(story.record.marks[id], story.record.excluded.has(id));
        if (h) found.push({ item: item, h: h });
      }
    }
    found.sort((a, b) => compareHardness(a.h, b.h));
    const items = found.map((entry) => entry.item);

    const button = slot.createEl('button', { cls: 'trisent-ex-hard' + (items.length ? '' : ' is-empty') });
    setIcon(button.createSpan({ cls: 'trisent-ex-hard-icon' }), 'flame');
    const text = button.createDiv();
    text.createDiv({ cls: 'trisent-ex-hard-title', text: HARDEST });
    text.createDiv({
      cls: 'trisent-ex-hard-sub',
      text: items.length === 0
        ? 'Sentences you got wrong in the translator will gather here.'
        : items.length + (items.length === 1 ? ' sentence' : ' sentences') + ' you found hard when translating'
    });
    if (items.length === 0) {
      button.setAttr('disabled', 'true');
      return;
    }
    button.addEventListener('click', () => {
      this.begin(language, HARDEST, stories, new Draw(items, { mode: 'hardest', size: this.size }));
    });
  }

  renderStoryFilter(page, language) {
    const texts = this.exercises.plugin.learning.texts;
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

  paintStories() {
    const shelf = this.shelf;
    if (!shelf || !this.contentEl.contains(shelf.list)) return;
    const { list, pager, language } = shelf;
    list.empty();
    pager.empty();

    const found = shelf.stories.filter((story) => matchesText({
      title: story.entry.data.title || story.entry.folder.name,
      subtitle: story.entry.data.titleTranslation,
      tags: story.tags
    }, { query: this.storyQuery, tags: this.storyTags }));

    if (found.length === 0) {
      list.createDiv({ cls: 'trisent-shelf-none', text: 'No story matches this filter.' });
      return;
    }

    const slice = pageOf(found, this.storyAt, STORY_PAGE);
    this.storyAt = slice.page;
    for (const story of slice.items) this.renderStory(list, language, story);
    if (slice.pages <= 1) return;

    const step = (to) => {
      this.storyAt = to;
      this.paintStories();
      list.scrollIntoView({ block: 'start' });
    };
    const prev = pager.createEl('button', { cls: 'trisent-page-step' });
    setIcon(prev.createSpan(), 'chevron-left');
    if (slice.page === 0) prev.setAttr('disabled', 'true');
    else prev.addEventListener('click', () => step(slice.page - 1));
    pager.createSpan({ cls: 'trisent-page-count', text: slice.from + '–' + slice.to + ' of ' + slice.count });
    const next = pager.createEl('button', { cls: 'trisent-page-step' });
    setIcon(next.createSpan(), 'chevron-right');
    if (slice.page >= slice.pages - 1) next.setAttr('disabled', 'true');
    else next.addEventListener('click', () => step(slice.page + 1));
  }

  renderStory(list, language, story) {
    const entry = story.entry;
    const row = list.createEl('button', { cls: 'trisent-text-row' });
    const left = row.createDiv({ cls: 'trisent-t-left' });
    left.createDiv({ cls: 'trisent-t-title', text: entry.data.title || entry.folder.name });
    if (entry.data.titleTranslation) left.createDiv({ cls: 'trisent-t-sub', text: entry.data.titleTranslation });
    row.createDiv({ cls: 'trisent-t-note', text: story.items.length + ' sentences' });

    if (story.items.length === 0) {
      row.setAttr('disabled', 'true');
      return;
    }
    /* Alle Sätze - archiviert heißt hier nichts; Üben schadet keinem. */
    row.addEventListener('click', () => {
      this.begin(language, entry.data.title || entry.folder.name, [story], new Draw(story.items, { size: this.size }));
    });
  }

  /* ---------------------------------------------------------------- */
  /* Die Sitzung                                                       */
  /* ---------------------------------------------------------------- */

  begin(language, source, stories, draw) {
    this.run = {
      language: language,
      source: source,
      type: this.type,
      byText: new Map(stories.map((story) => [story.entry.folder.path, story.entry])),
      session: new Session(draw, this.size),
      round: 1
    };
    this.screen = 'session';
    this.render();
  }

  /* Noch eine Runde mit den falschen - so oft, wie noch welche falsch
     sind. */
  retry(items) {
    const first = this.run;
    this.run = Object.assign({}, first, {
      round: first.round + 1,
      session: new Session(new Draw(items, { mode: 'hardest', size: items.length }), items.length)
    });
    this.render();
  }

  stop() {
    this.run = null;
    this.screen = 'start';
    this.render();
  }

  title() {
    const run = this.run;
    return run.round > 1 ? run.source + ' · again' : run.source;
  }

  renderCard(page, language) {
    const run = this.run;
    const session = run.session;
    const item = session.card;
    const entry = run.byText.get(item.text);

    const bar = this.useBar();
    const head = this.header(bar, this.title(), () => this.stop(), 'Stop');
    head.createDiv({ cls: 'trisent-ex-count', text: session.position + ' / ' + session.size });
    const progress = bar.createDiv({ cls: 'trisent-ex-progress' });
    progress.createDiv({ cls: 'trisent-ex-progress-fill' }).style.width =
      Math.round((session.results.length / session.size) * 100) + '%';

    const card = page.createDiv({ cls: 'trisent-ex-card' });
    card.createDiv({ cls: 'trisent-ex-prompt', text: item.sentence.fluent });
    if (run.source === HARDEST && entry) {
      card.createDiv({ cls: 'trisent-ex-from', text: entry.data.title || entry.folder.name });
    }

    this.renderPuzzle(page, card, item, entry);
  }

  /* Das Puzzle: oben die gelegten Kärtchen, darunter die übrigen. Ein
     Tipp legt ein Kärtchen ans Ende bzw. nimmt es zurück. */
  renderPuzzle(page, card, item, entry) {
    const tiles = tilesOf(item.sentence);
    const pool = shuffleTiles(tiles);
    const placed = [];

    const answer = page.createDiv({ cls: 'trisent-ex-answer' });
    const rest = page.createDiv({ cls: 'trisent-ex-pool' });
    const row = page.createDiv({ cls: 'trisent-ex-row' });
    const check = row.createEl('button', { cls: 'trisent-ex-check', text: 'Check' });
    const result = page.createDiv({ cls: 'trisent-ex-result' });

    const paint = () => {
      answer.empty();
      rest.empty();
      if (placed.length === 0) {
        answer.createSpan({ cls: 'trisent-ex-placeholder', text: 'Tap the words in the right order' });
      }
      placed.forEach((tile, index) => {
        const chip = answer.createEl('button', { cls: 'trisent-ex-tile is-placed', text: tile.text });
        chip.addEventListener('click', () => {
          placed.splice(index, 1);
          pool.push(tile);
          paint();
        });
      });
      pool.forEach((tile, index) => {
        const chip = rest.createEl('button', { cls: 'trisent-ex-tile', text: tile.text });
        chip.addEventListener('click', () => {
          pool.splice(index, 1);
          placed.push(tile);
          paint();
        });
      });
      const complete = pool.length === 0;
      check.toggleAttribute('disabled', !complete);
      this.keyAction = complete ? checkNow : null;
    };

    const checkNow = () => {
      const verdict = checkOrder(placed, tiles);
      const outcome = verdict.correct ? 'correct' : 'wrong';
      this.run.session.record(outcome);

      /* Das Ergebnis zeigen: die gelegten Kärtchen bleiben stehen, falsche
         Stellen rot; darunter das Original zum Lesen und Hören. */
      answer.empty();
      rest.remove();
      row.remove();
      placed.forEach((tile, index) => {
        answer.createSpan({
          cls: 'trisent-ex-tile is-placed is-done' + (verdict.wrong.includes(index) ? ' is-wrong' : ''),
          text: tile.text
        });
      });
      card.addClass(verdict.correct ? 'is-right' : 'is-wrong');

      const box = result.createDiv({ cls: 'trisent-ex-verdict ' + (verdict.correct ? 'is-right' : 'is-wrong') });
      const badge = box.createDiv({ cls: 'trisent-ex-badge' });
      setIcon(badge.createSpan(), verdict.correct ? 'check' : 'x');
      badge.createSpan({ text: verdict.correct ? 'Correct' : 'Not yet' });

      const original = box.createDiv({ cls: 'trisent-ex-original' });
      const audio = item.sentence.audio && item.sentence.audio.file
        ? entry.folder.path + '/' + item.sentence.audio.file
        : null;
      if (audio) this.renderSpeaker(original, audio);
      original.createSpan({ cls: 'trisent-ex-original-text', text: item.sentence.source });

      this.renderNext(result);
    };

    check.addEventListener('click', checkNow);
    paint();
    /* Ein Satz mit einem einzigen Wort ist kein Puzzle - dann liegt es
       schon da, und es geht nur ums Prüfen. */
    if (tiles.length === 1) {
      placed.push(pool.pop());
      paint();
    }
  }

  renderNext(slot) {
    const session = this.run.session;
    const last = session.results.length >= session.size;
    const row = slot.createDiv({ cls: 'trisent-ex-row is-next' });
    const next = row.createEl('button', { cls: 'trisent-ex-next' });
    next.createSpan({ text: last ? 'Finish' : 'Next' });
    setIcon(next.createSpan(), last ? 'flag' : 'arrow-right');
    const go = () => {
      session.next();
      this.render();
    };
    next.addEventListener('click', go);
    this.keyAction = go;
  }

  renderSummary(page, language) {
    const run = this.run;
    const session = run.session;
    const done = session.results.length;

    this.header(this.useBar(), this.title(), () => this.stop(), 'Back');
    page.createEl('h1', { text: run.round === 1 ? 'Done' : run.round === 2 ? 'Second try' : 'Try ' + run.round });

    if (done > 0) {
      page.createEl('p', {
        cls: 'trisent-lead',
        text: session.right + ' of ' + done + (done === 1 ? ' sentence' : ' sentences') + ' right.'
      });
      const marks = page.createDiv({ cls: 'trisent-ex-marks' });
      for (const entry of session.results) {
        marks.createSpan({ cls: 'trisent-ex-mark ' + (entry.result === 'wrong' ? 'is-wrong' : 'is-right') });
      }
    } else {
      page.createEl('p', { cls: 'trisent-lead', text: 'There was nothing to practise here.' });
    }

    const row = page.createDiv({ cls: 'trisent-ex-row is-next' });
    const wrong = session.results.filter((entry) => entry.result === 'wrong').map((entry) => entry.item);
    if (wrong.length > 0) {
      const again = row.createEl('button', { cls: 'trisent-ex-again' });
      setIcon(again.createSpan(), 'rotate-ccw');
      again.createSpan({
        text: wrong.length === 1 ? 'Try the wrong one again' : 'Try the ' + wrong.length + ' wrong ones again'
      });
      again.addEventListener('click', () => this.retry(wrong));
    }
    const back = row.createEl('button', { cls: 'trisent-ex-next' });
    back.createSpan({ text: 'Back to the stories' });
    back.addEventListener('click', () => this.stop());
    this.keyAction = () => this.stop();
  }

  /* ---------------------------------------------------------------- */
  /* Ton                                                               */
  /* ---------------------------------------------------------------- */

  renderSpeaker(parent, path) {
    const button = parent.createEl('button', { cls: 'trisent-ex-play' });
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

module.exports = { ExercisesView, VIEW_TYPE, RIBBON_ICON };
