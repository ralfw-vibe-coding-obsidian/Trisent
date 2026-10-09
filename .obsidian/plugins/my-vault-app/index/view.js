"use strict";

/*
 * Der Index - die Wörter, die der Person aufgefallen sind.
 *
 * Keine Lernkartei: Nichts wird fällig, nichts türmt sich. Man blättert
 * darin, wenn einem danach ist - nach dem, was zuletzt auffiel, nach dem
 * Alphabet, nach dem, worüber man am häufigsten gestolpert ist, oder nach
 * dem, was in den Texten am häufigsten vorkommt (da lohnt sich das
 * Merken am meisten).
 *
 * Ein Tipp auf ein Wort öffnet seine Word card - Bedeutung, Grammatik,
 * Fundstellen, alles, was es schon gibt. Archivieren blendet ein Wort
 * aus und behält es; Löschen nimmt es ohne Spur heraus.
 *
 * Die Daten stehen in den Word notes; Regeln in learning/marks.js,
 * Ablage in learning/wordindex.js.
 */

const { ItemView, Notice, setIcon, setTooltip } = require('obsidian');
const { SORTS, compareItems, frequencies } = require('../learning/marks.js');
const { fold } = require('../learning/tags.js');
const { page: pageOf } = require('../flashcards/find.js');

const VIEW_TYPE = 'trisent-index-view';
const RIBBON_ICON = 'bookmark';

/* Wie viele Wörter auf eine Seite gehen. */
const PAGE = 20;

const ORIGIN = {
  reader: { icon: 'book-open', label: 'Noticed while reading' },
  translator: { icon: 'pen-line', label: 'Noticed while translating' }
};

/* "9 Oct" - in der Zeit des Ortes, an dem man gerade ist. */
function dayText(stamp) {
  const at = new Date(stamp);
  if (isNaN(at.getTime())) return '';
  try {
    return at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  } catch (error) {
    return at.toISOString().slice(0, 10);
  }
}

class IndexView extends ItemView {
  constructor(leaf, index) {
    super(leaf);
    this.index = index;
    this.library = index.library;
    this.words = index.words;
    this.dictionary = index.dictionary;
    this.languageCode = null;
    /* Ansicht, nicht Einstellung: Suchwort und Seite merkt man sich nicht
       über Tage. Reihenfolge und Reiter schon - siehe index.settings. */
    this.query = '';
    this.at = 0;
    this.visited = null;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return 'Index';
  }

  getIcon() {
    return RIBBON_ICON;
  }

  async onOpen() {
    const last = this.index.settings.lastLanguage;
    if (last && this.library.languageByCode(last)) this.languageCode = last;
    this.render();
  }

  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('trisent-view');
    root.addClass('trisent-index');

    this.barEl = root.createDiv({ cls: 'trisent-topbar is-hidden' });
    this.barInner = this.barEl.createDiv({ cls: 'trisent-page' });
    this.scrollEl = root.createDiv({ cls: 'trisent-scroll' });
    const page = this.scrollEl.createDiv({ cls: 'trisent-page' });

    const language = this.library.languageByCode(this.languageCode);
    if (language) this.renderLanguage(page, language);
    else this.renderLanguages(page);
  }

  useBar() {
    this.barEl.removeClass('is-hidden');
    this.barInner.empty();
    return this.barInner;
  }

  /* ---------------------------------------------------------------- */
  /* Sprache wählen                                                    */
  /* ---------------------------------------------------------------- */

  renderLanguages(page) {
    page.createEl('h1', { text: 'Index' });
    const languages = this.library.languages();
    if (languages.length === 0) {
      page.createEl('p', { cls: 'trisent-lead', text: 'No languages yet. Add one in the reader first.' });
      return;
    }
    page.createEl('p', {
      cls: 'trisent-lead',
      text: 'The words that caught your eye while reading and translating.'
    });

    const grid = page.createDiv({ cls: 'trisent-language-grid' });
    for (const language of languages) {
      const entries = this.words.entries(language);
      const active = entries.filter((entry) => !entry.mark.archived).length;

      const tile = grid.createEl('button', { cls: 'trisent-tile' });
      const top = tile.createDiv({ cls: 'trisent-tile-top' });
      top.createSpan({ cls: 'trisent-flag', text: language.flag || '🏳️' });
      top.createSpan({ cls: 'trisent-tile-name', text: language.name });
      const big = tile.createDiv({ cls: 'trisent-big' });
      big.createSpan({ cls: 'trisent-big-num', text: String(active) });
      big.createSpan({ cls: 'trisent-big-unit', text: active === 1 ? 'word' : 'words' });

      tile.addEventListener('click', () => {
        this.languageCode = language.code;
        this.query = '';
        this.at = 0;
        this.index.settings.lastLanguage = language.code;
        this.index.saveSettings();
        this.render();
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Der Index einer Sprache                                           */
  /* ---------------------------------------------------------------- */

  renderLanguage(page, language) {
    const bar = this.useBar();
    const head = bar.createDiv({ cls: 'trisent-header' });
    const back = head.createEl('button', { cls: 'trisent-back' });
    setIcon(back.createSpan(), 'chevron-left');
    back.createSpan({ text: 'Languages' });
    back.addEventListener('click', () => {
      this.languageCode = null;
      this.render();
    });
    head.createDiv({ cls: 'trisent-header-title', text: (language.flag || '🏳️') + ' ' + language.name });

    const settings = this.index.settings;
    const archived = settings.show === 'archived';
    const all = this.words.entries(language);
    const shown = all.filter((entry) => entry.mark.archived === archived);
    const activeCount = all.filter((entry) => !entry.mark.archived).length;
    const archivedCount = all.length - activeCount;

    /* Zwei Reiter: was im Index steht, und was archiviert ist. */
    const tabs = page.createDiv({ cls: 'trisent-ix-tabs' });
    for (const tab of [
      { id: 'active', label: 'In your index', count: activeCount },
      { id: 'archived', label: 'Archived', count: archivedCount }
    ]) {
      const button = tabs.createEl('button', {
        cls: 'trisent-ix-tab' + ((tab.id === 'archived') === archived ? ' is-on' : '')
      });
      button.createSpan({ text: tab.label });
      button.createSpan({ cls: 'trisent-ix-tab-count', text: String(tab.count) });
      button.addEventListener('click', () => {
        if ((tab.id === 'archived') === archived) return;
        settings.show = tab.id;
        this.index.saveSettings();
        this.at = 0;
        this.render();
      });
    }

    if (all.length === 0) {
      page.createEl('p', { cls: 'trisent-lead', text: 'Nothing here yet.' });
      page.createEl('p', {
        cls: 'trisent-muted',
        text: 'When a word catches your eye, open its word card and tap the bookmark at the top.'
      });
      return;
    }

    /* Suchen und ordnen. */
    const controls = page.createDiv({ cls: 'trisent-ix-controls' });
    const search = controls.createDiv({ cls: 'trisent-shelf-search' });
    setIcon(search.createSpan({ cls: 'trisent-shelf-search-icon' }), 'search');
    const input = search.createEl('input', {
      cls: 'trisent-shelf-search-input',
      attr: { type: 'search', placeholder: 'Search words', enterkeyhint: 'search' }
    });
    input.value = this.query;
    input.addEventListener('input', () => {
      this.query = input.value;
      this.at = 0;
      this.paint();
    });

    const sorts = controls.createDiv({ cls: 'trisent-ix-sorts' });
    const current = SORTS.some((sort) => sort.id === settings.sort) ? settings.sort : 'recent';
    for (const sort of SORTS) {
      const chip = sorts.createEl('button', {
        cls: 'trisent-ix-sort' + (sort.id === current ? ' is-on' : ''),
        text: sort.label
      });
      chip.addEventListener('click', () => {
        if (sort.id === current) return;
        settings.sort = sort.id;
        this.index.saveSettings();
        this.at = 0;
        this.render();
      });
    }

    const list = page.createDiv({ cls: 'trisent-ix-list' });
    list.createDiv({ cls: 'trisent-loading', text: '…' });
    const pager = page.createDiv({ cls: 'trisent-pager' });

    /* Bedeutungen und Häufigkeiten werden gelesen - erst der Rahmen,
       dann die Wörter. */
    this.load(language).then(({ glosses, freq }) => {
      if (!this.contentEl.contains(list)) return;
      const items = shown.map((entry) => ({
        key: entry.key,
        lemma: entry.lemma,
        gloss: (glosses.get(entry.key) || {}).gloss || '',
        mark: entry.mark,
        freq: freq.get(entry.key) || { sentences: 0, texts: 0 }
      }));
      items.sort(compareItems(current));
      this.shelf = { language: language, items: items, list: list, pager: pager, archived: archived };
      this.paint();
    }).catch((error) => {
      console.error('Trisent: could not show the index', error);
      if (!this.contentEl.contains(list)) return;
      list.empty();
      list.createDiv({ cls: 'trisent-muted', text: 'The index could not be shown: ' + String(error.message || error) });
    });
  }

  async load(language) {
    const glosses = await this.dictionary.entries(language);
    const texts = (await this.library.loadPackages(language))
      .filter((entry) => entry.ok)
      .map((entry) => ({ id: entry.folder.path, data: entry.data }));
    return { glosses: glosses, freq: frequencies(texts) };
  }

  /* Die Liste zeichnen, wie Suche und Seite es wollen - ohne den Rest
     der Seite, sonst verlöre das Suchfeld den Fokus. */
  paint() {
    const shelf = this.shelf;
    if (!shelf || !this.contentEl.contains(shelf.list)) return;
    const { list, pager, language } = shelf;
    list.empty();
    pager.empty();

    const query = fold(this.query).trim();
    const found = query
      ? shelf.items.filter((item) => fold(item.lemma).includes(query) || fold(item.gloss).includes(query))
      : shelf.items;

    if (found.length === 0) {
      list.createDiv({
        cls: 'trisent-muted',
        text: shelf.items.length === 0
          ? (shelf.archived ? 'Nothing archived.' : 'Everything is archived.')
          : 'No word matches “' + this.query + '”.'
      });
      return;
    }

    const slice = pageOf(found, this.at, PAGE);
    this.at = slice.page;
    for (const item of slice.items) this.renderRow(list, language, item);

    if (slice.pages <= 1) return;
    const step = (to) => {
      this.at = to;
      this.paint();
      list.scrollIntoView({ block: 'start' });
    };
    const prev = pager.createEl('button', { cls: 'trisent-page-step' });
    setIcon(prev.createSpan(), 'chevron-left');
    prev.setAttr('aria-label', 'Previous page');
    if (slice.page === 0) prev.setAttr('disabled', 'true');
    else prev.addEventListener('click', () => step(slice.page - 1));
    pager.createSpan({ cls: 'trisent-page-count', text: slice.from + '–' + slice.to + ' of ' + slice.count });
    const next = pager.createEl('button', { cls: 'trisent-page-step' });
    setIcon(next.createSpan(), 'chevron-right');
    next.setAttr('aria-label', 'Next page');
    if (slice.page >= slice.pages - 1) next.setAttr('disabled', 'true');
    else next.addEventListener('click', () => step(slice.page + 1));
  }

  renderRow(list, language, item) {
    const row = list.createDiv({ cls: 'trisent-ix-row' + (this.visited === item.key ? ' is-visited' : '') });

    /* Die ganze linke Seite öffnet die Word card. */
    const open = row.createEl('button', { cls: 'trisent-ix-open' });
    const top = open.createDiv({ cls: 'trisent-ix-top' });
    top.createSpan({ cls: 'trisent-ix-lemma', text: item.lemma });
    if (item.gloss) top.createSpan({ cls: 'trisent-ix-gloss', text: item.gloss });

    const meta = open.createDiv({ cls: 'trisent-ix-meta' });
    for (const origin of item.mark.from) {
      const icon = meta.createSpan({ cls: 'trisent-ix-origin', attr: { title: ORIGIN[origin].label } });
      setIcon(icon, ORIGIN[origin].icon);
    }
    if (item.mark.count > 1) {
      meta.createSpan({
        cls: 'trisent-ix-count',
        text: '×' + item.mark.count,
        attr: { title: 'Added ' + item.mark.count + ' times' }
      });
    }
    const where = item.freq.sentences === 0
      ? 'in none of your texts'
      : item.freq.sentences + (item.freq.sentences === 1 ? ' sentence' : ' sentences')
        + ' · ' + item.freq.texts + (item.freq.texts === 1 ? ' text' : ' texts');
    meta.createSpan({ cls: 'trisent-ix-where', text: where });
    const when = dayText(item.mark.last);
    if (when) meta.createSpan({ cls: 'trisent-ix-when', text: when });

    open.addEventListener('click', () => {
      this.visited = item.key;
      for (const other of list.querySelectorAll('.trisent-ix-row.is-visited')) other.removeClass('is-visited');
      row.addClass('is-visited');
      this.index.showWord(language, item.key);
    });

    const actions = row.createDiv({ cls: 'trisent-ix-actions' });
    const keep = actions.createEl('button', { cls: 'trisent-ix-action' });
    setIcon(keep, item.mark.archived ? 'archive-restore' : 'archive');
    setTooltip(keep, item.mark.archived ? 'Back into your index' : 'Archive');
    keep.addEventListener('click', async () => {
      try {
        if (item.mark.archived) await this.words.restore(language, item.key);
        else await this.words.archive(language, item.key);
      } catch (error) {
        new Notice('Could not change this word: ' + String(error.message || error));
        return;
      }
      this.index.changed(language, item.key);
      this.render();
    });

    const drop = actions.createEl('button', { cls: 'trisent-ix-action' });
    setIcon(drop, 'trash-2');
    setTooltip(drop, 'Remove from your index');
    drop.addEventListener('click', () => this.askRemove(row, language, item));
  }

  /* Löschen fragt am Wort selbst nach - nichts poppt auf, und man kann
     es sich anders überlegen. Gelöscht wird nur der Eintrag im Index;
     die Word note mit Lernstand und Notizen bleibt. */
  askRemove(row, language, item) {
    row.empty();
    row.addClass('is-asking');
    row.createDiv({ cls: 'trisent-ix-ask', text: 'Remove “' + item.lemma + '” from your index?' });
    const buttons = row.createDiv({ cls: 'trisent-ix-actions' });
    const yes = buttons.createEl('button', { cls: 'trisent-ix-yes', text: 'Remove' });
    const no = buttons.createEl('button', { cls: 'trisent-ix-no', text: 'Keep' });
    no.addEventListener('click', () => this.paint());
    yes.addEventListener('click', async () => {
      try {
        await this.words.remove(language, item.key);
      } catch (error) {
        new Notice('Could not remove this word: ' + String(error.message || error));
        return;
      }
      this.index.changed(language, item.key);
      this.render();
    });
  }
}

module.exports = { IndexView, VIEW_TYPE, RIBBON_ICON };
