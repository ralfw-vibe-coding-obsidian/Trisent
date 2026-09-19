"use strict";

/*
 * Die Lernkartei ansehen. Je Sprache eine.
 *
 * Schritt 1: hinzufügen und nachsehen. Die Sitzung kommt als Nächstes.
 */

const { ItemView, Notice, setIcon } = require('obsidian');
const { isDue, isNew, today, daysBetween, RHYTHM, MAX_LEVEL } = require('./schedule.js');

const VIEW_TYPE = 'trisent-deck-view';
const RIBBON_ICON = 'layers';

class DeckView extends ItemView {
  constructor(leaf, flashcards) {
    super(leaf);
    this.flashcards = flashcards;
    this.library = flashcards.library;
    this.deck = flashcards.deck;
    this.streak = flashcards.streak;
    this.languageCode = null;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return 'Flashcards';
  }

  getIcon() {
    return RIBBON_ICON;
  }

  async onOpen() {
    const last = this.flashcards.settings.lastLanguage;
    if (last && this.library.languageByCode(last)) this.languageCode = last;
    this.render();
  }

  async onClose() {
    /* nichts aufzuräumen */
  }

  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('trisent-view');

    this.barEl = root.createDiv({ cls: 'trisent-topbar is-hidden' });
    this.barInner = this.barEl.createDiv({ cls: 'trisent-page' });
    this.scrollEl = root.createDiv({ cls: 'trisent-scroll' });
    const page = this.scrollEl.createDiv({ cls: 'trisent-page' });

    const language = this.library.languageByCode(this.languageCode);
    if (language) this.renderDeck(page, language);
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
    page.createEl('h1', { text: 'Flashcards' });

    const languages = this.library.languages();
    if (languages.length === 0) {
      page.createEl('p', { cls: 'trisent-lead', text: 'No languages yet.' });
      return;
    }

    page.createEl('p', {
      cls: 'trisent-lead',
      text: 'Words you put aside while reading. Each language has its own deck.'
    });

    const grid = page.createDiv({ cls: 'trisent-language-grid' });
    for (const language of languages) {
      const cards = this.deck.all(language);
      const due = cards.filter((card) => isDue(card, today())).length;

      const tile = grid.createEl('button', { cls: 'trisent-tile' });
      const top = tile.createDiv({ cls: 'trisent-tile-top' });
      top.createSpan({ cls: 'trisent-flag', text: language.flag || '🏳️' });
      top.createSpan({ cls: 'trisent-tile-name', text: language.name });

      const big = tile.createDiv({ cls: 'trisent-big' });
      big.createSpan({ cls: 'trisent-big-num', text: String(cards.length) });
      big.createSpan({ cls: 'trisent-big-unit', text: cards.length === 1 ? 'card' : 'cards' });

      const foot = tile.createDiv({ cls: 'trisent-tile-foot' });
      foot.createSpan({ text: due > 0 ? due + ' due today' : 'nothing due' });

      tile.addEventListener('click', () => {
        this.languageCode = language.code;
        this.flashcards.settings.lastLanguage = language.code;
        this.flashcards.saveSettings();
        this.render();
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Die Kartei                                                        */
  /* ---------------------------------------------------------------- */

  renderDeck(page, language) {
    const bar = this.useBar();
    const head = bar.createDiv({ cls: 'trisent-header' });

    const back = head.createEl('button', { cls: 'trisent-back' });
    setIcon(back.createSpan(), 'chevron-left');
    back.createSpan({ text: 'Languages' });
    back.addEventListener('click', () => {
      this.languageCode = null;
      this.render();
    });

    head.createDiv({
      cls: 'trisent-header-title',
      text: (language.flag || '🏳️') + ' ' + language.name
    });

    const cards = this.deck.all(language);
    if (cards.length === 0) {
      page.createEl('p', {
        cls: 'trisent-lead',
        text: 'No cards yet.'
      });
      page.createEl('p', {
        cls: 'trisent-muted',
        text: 'While reading, press and hold a word and put it in your deck from its card.'
      });
      return;
    }

    /* Was ansteht, zuerst - danach nach Fälligkeit. */
    const now = today();
    cards.sort((a, b) => String(a.due || '').localeCompare(String(b.due || '')));

    const due = cards.filter((card) => isDue(card, now)).length;
    const fresh = cards.filter(isNew).length;

    const summary = page.createDiv({ cls: 'trisent-deck-summary' });
    this.renderCount(summary, String(due), due === 1 ? 'due' : 'due', due > 0);
    this.renderCount(summary, String(fresh), fresh === 1 ? 'new' : 'new', false);
    this.renderCount(summary, String(cards.length), 'in total', false);

    const list = page.createDiv({ cls: 'trisent-deck' });
    for (const card of cards) this.renderCard(list, card, now);
  }

  renderCount(parent, value, label, strong) {
    const item = parent.createDiv({ cls: 'trisent-count' + (strong ? ' is-strong' : '') });
    item.createSpan({ cls: 'trisent-count-value', text: value });
    item.createSpan({ cls: 'trisent-count-label', text: label });
  }

  renderCard(list, card, now) {
    const row = list.createDiv({
      cls: 'trisent-card-row' + (isDue(card, now) ? ' is-due' : '')
    });

    const words = row.createDiv({ cls: 'trisent-card-words' });
    words.createDiv({ cls: 'trisent-card-front', text: card.front || card.key });
    if (card.back) words.createDiv({ cls: 'trisent-card-back', text: card.back });

    const facts = row.createDiv({ cls: 'trisent-card-facts' });

    /* Das Level als Balken - eine Zahl von 0 bis 9 sagt wenig, der
       Fortschritt darin viel. */
    const level = facts.createDiv({
      cls: 'trisent-level',
      attr: { title: 'Level ' + card.level + ' of ' + MAX_LEVEL }
    });
    for (let i = 1; i <= MAX_LEVEL; i++) {
      level.createSpan({ cls: 'trisent-level-step' + (i <= card.level ? ' is-on' : '') });
    }

    const seen = facts.createSpan({ cls: 'trisent-card-stat' });
    setIcon(seen.createSpan(), 'eye');
    seen.createSpan({ text: String(card.seen) });

    if (card.wrong > 0) {
      const wrong = facts.createSpan({ cls: 'trisent-card-stat is-bad' });
      setIcon(wrong.createSpan(), 'x');
      wrong.createSpan({ text: String(card.wrong) });
    }

    facts.createSpan({ cls: 'trisent-card-due', text: this.dueText(card, now) });
  }

  /* "heute", "in 3 Tagen", "seit 2 Tagen fällig" - ein Datum allein muss
     man erst nachrechnen. */
  dueText(card, now) {
    if (card.seen === 0) return 'new';
    if (!card.due) return 'due';

    const days = daysBetween(now, card.due);
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    if (days < 0) return days === -1 ? '1 day over' : -days + ' days over';
    if (card.level >= MAX_LEVEL && RHYTHM[MAX_LEVEL] > 1000) return 'learned';
    return 'in ' + days + ' days';
  }
}

module.exports = { DeckView, VIEW_TYPE, RIBBON_ICON };
