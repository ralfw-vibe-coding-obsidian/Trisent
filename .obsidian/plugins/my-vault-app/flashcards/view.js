"use strict";

/*
 * Die Lernkartei: ansehen und üben.
 *
 * Drei Bilder in einer Ansicht - Sprachen, die Kartei einer Sprache, und
 * die laufende Sitzung. Gerechnet wird nirgends hier: Wann eine Karte
 * wiederkommt, steht in schedule.js, wie der Stapel läuft in session.js.
 */

const { ItemView, Notice, setIcon } = require('obsidian');
const {
  isDue, isNew, today, daysBetween, pick, SOURCES, rhythm, maxLevel
} = require('./schedule.js');
const { Session } = require('./session.js');

/* Wonach die Kartei geordnet wird. Bei gleicher Schwierigkeit
   alphabetisch - sonst wechselte die Reihenfolge bei jedem Zeichnen. */
const ORDERS = [
  { id: 'alphabetical', label: 'A–Z' },
  { id: 'hardest', label: 'Hardest first' }
];

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
    this.session = null;
    /* Der Streak wird je Sitzung einmal angestoßen, nicht je Karte. */
    this.counted = false;
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
    this.registerDomEvent(document, 'keydown', (event) => this.onKey(event));
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
    if (language && this.session) this.renderSession(page, language);
    else if (language) this.renderDeck(page, language);
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

    const now = today();

    const due = cards.filter((card) => isDue(card, now)).length;
    const fresh = cards.filter(isNew).length;

    const summary = page.createDiv({ cls: 'trisent-deck-summary' });
    this.renderCount(summary, String(due), 'due', due > 0);
    this.renderCount(summary, String(fresh), 'new', false);
    this.renderCount(summary, String(cards.length), 'in total', false);

    this.renderStart(page, language, cards, now);

    const listHead = page.createDiv({ cls: 'trisent-deck-head' });
    listHead.createDiv({ cls: 'trisent-section-label', text: 'All cards' });
    this.renderSort(listHead);

    const list = page.createDiv({ cls: 'trisent-deck' });
    for (const card of this.sorted(cards, language)) this.renderCard(list, card, now);
  }

  /* Wonach die Kartei geordnet ist. Steht sichtbar da, weil eine
     Reihenfolge, die nicht alphabetisch ist, sonst willkürlich wirkt. */
  renderSort(head) {
    const current = this.sortMode();
    const row = head.createDiv({ cls: 'trisent-choice-row' });

    for (const option of ORDERS) {
      const button = row.createEl('button', {
        cls: 'trisent-choice-option' + (option.id === current ? ' is-on' : ''),
        text: option.label
      });
      button.addEventListener('click', () => {
        if (option.id === current) return;
        this.flashcards.settings.sort = option.id;
        this.flashcards.saveSettings();
        this.render();
      });
    }
  }

  sortMode() {
    const mode = this.flashcards.settings.sort;
    return ORDERS.some((order) => order.id === mode) ? mode : 'alphabetical';
  }

  /* Alphabetisch wird in der Sprache der Karten sortiert, nicht in der
     des Rechners: Sonst landen é und ж an überraschenden Stellen. */
  sorted(cards, language) {
    const name = (card) => card.front || card.key || '';
    const byName = (a, b) => name(a).localeCompare(name(b), language.code);

    if (this.sortMode() === 'hardest') {
      return cards.slice().sort((a, b) => (b.wrong - a.wrong) || byName(a, b));
    }
    return cards.slice().sort(byName);
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
      attr: { title: 'Level ' + card.level + ' of ' + maxLevel() }
    });
    for (let i = 1; i <= maxLevel(); i++) {
      level.createSpan({ cls: 'trisent-level-step' + (i <= card.level ? ' is-on' : '') });
    }

    const seen = facts.createSpan({ cls: 'trisent-card-stat' });
    setIcon(seen.createSpan(), 'eye');
    seen.createSpan({ text: String(card.seen) });

    /* Die Spalte steht auch dann, wenn nichts darin ist. Sonst rutschte
       in jeder zweiten Zeile alles andere zur Seite, und die Liste
       flimmerte, statt sich lesen zu lassen. */
    const wrong = facts.createSpan({ cls: 'trisent-card-stat is-bad' });
    if (card.wrong > 0) {
      setIcon(wrong.createSpan(), 'x');
      wrong.createSpan({ text: String(card.wrong) });
    }

    facts.createSpan({ cls: 'trisent-card-due', text: this.dueText(card, now) });
  }

  /* ---------------------------------------------------------------- */
  /* Eine Sitzung beginnen                                             */
  /* ---------------------------------------------------------------- */

  /* Die drei Entscheidungen stehen über dem Knopf, nicht in den
     Einstellungen: Sie ändern sich von Tag zu Tag. Gemerkt werden sie
     trotzdem - meistens will man dasselbe wie gestern. */
  renderStart(page, language, cards, now) {
    const settings = this.flashcards.settings;
    const panel = page.createDiv({ cls: 'trisent-start' });
    const options = panel.createDiv({ cls: 'trisent-start-options' });

    this.renderChoice(options, 'Draw', SOURCES, settings.source, (value) => {
      settings.source = value;
    });
    this.renderChoice(options, 'How many', [
      { id: 10, label: '10' }, { id: 20, label: '20' }, { id: 50, label: '50' }
    ], settings.size, (value) => {
      settings.size = value;
    });
    this.renderChoice(options, 'Show', [
      { id: 'front', label: language.name }, { id: 'back', label: 'Translation' }
    ], settings.ask, (value) => {
      settings.ask = value;
    });

    const stack = pick(cards, settings.source, settings.size, now);
    const go = panel.createEl('button', { cls: 'trisent-practise' });
    setIcon(go.createSpan(), 'play');
    go.createSpan({
      text: stack.length > 0
        ? 'Practise ' + stack.length + (stack.length === 1 ? ' card' : ' cards')
        : 'Nothing to practise'
    });

    if (stack.length === 0) {
      go.setAttr('disabled', 'true');
      return;
    }
    go.addEventListener('click', () => this.start(stack));
  }

  renderChoice(parent, label, options, value, onPick) {
    const group = parent.createDiv({ cls: 'trisent-choice' });
    group.createDiv({ cls: 'trisent-choice-label', text: label });
    const row = group.createDiv({ cls: 'trisent-choice-row' });

    for (const option of options) {
      const button = row.createEl('button', {
        cls: 'trisent-choice-option' + (option.id === value ? ' is-on' : ''),
        text: option.label
      });
      button.addEventListener('click', () => {
        onPick(option.id);
        this.flashcards.saveSettings();
        this.render();
      });
    }
  }

  start(stack) {
    this.session = new Session(stack, { ask: this.flashcards.settings.ask });
    this.counted = false;
    this.render();
  }

  /* ---------------------------------------------------------------- */
  /* Die Sitzung                                                       */
  /* ---------------------------------------------------------------- */

  renderSession(page, language) {
    const session = this.session;
    const bar = this.useBar();
    const head = bar.createDiv({ cls: 'trisent-header' });

    const back = head.createEl('button', { cls: 'trisent-back' });
    setIcon(back.createSpan(), 'chevron-left');
    back.createSpan({ text: session.done ? 'Deck' : 'Stop' });
    back.addEventListener('click', () => this.stop());

    head.createDiv({
      cls: 'trisent-header-title',
      text: (language.flag || '🏳️') + ' ' + language.name
    });

    if (!session.done) {
      head.createDiv({
        cls: 'trisent-session-count',
        text: session.position + ' / ' + session.total
      });
    }

    /* Der Balken zählt Erledigtes, nicht Angesehenes - "nochmal" bringt
       ihn deshalb nicht voran. Das ist ehrlicher. */
    const track = bar.createDiv({ cls: 'trisent-progress' });
    const fill = track.createDiv({ cls: 'trisent-progress-fill' });
    const share = session.total > 0 ? session.settled / session.total : 1;
    fill.style.width = Math.round(share * 100) + '%';

    if (session.done) {
      this.renderSummary(page, language);
      return;
    }

    const card = session.card;
    const wordSide = session.ask === 'front';

    const stage = page.createDiv({ cls: 'trisent-stage' });
    const face = stage.createDiv({ cls: 'trisent-face' });

    face.createDiv({
      cls: 'trisent-face-line ' + (wordSide ? 'is-word' : 'is-fluent'),
      text: session.question || '—'
    });

    if (session.revealed) {
      face.createDiv({ cls: 'trisent-face-rule' });
      face.createDiv({
        cls: 'trisent-face-line ' + (wordSide ? 'is-fluent' : 'is-word'),
        text: session.answerText || 'No translation in this card.'
      });
      this.renderCardFacts(face, card);
    } else {
      face.addClass('is-tappable');
      face.createDiv({ cls: 'trisent-face-hint', text: 'tap to turn it over' });
      face.addEventListener('click', () => this.turn());
    }

    this.renderAnswers(page, language, session);
  }

  /* Was die Karte über sich weiß - erst nach dem Umdrehen, sonst wäre
     das Level schon ein halber Hinweis. */
  renderCardFacts(face, card) {
    const facts = face.createDiv({ cls: 'trisent-face-facts' });
    const level = facts.createDiv({
      cls: 'trisent-level',
      attr: { title: 'Level ' + card.level + ' of ' + maxLevel() }
    });
    for (let i = 1; i <= maxLevel(); i++) {
      level.createSpan({ cls: 'trisent-level-step' + (i <= card.level ? ' is-on' : '') });
    }
    if (card.wrong > 0) {
      const wrong = facts.createSpan({ cls: 'trisent-card-stat is-bad' });
      setIcon(wrong.createSpan(), 'x');
      wrong.createSpan({ text: String(card.wrong) });
    }
  }

  renderAnswers(page, language, session) {
    const row = page.createDiv({ cls: 'trisent-answers' });

    if (!session.revealed) {
      const turn = row.createEl('button', { cls: 'trisent-turn' });
      setIcon(turn.createSpan(), 'eye');
      turn.createSpan({ text: 'Show' });
      turn.addEventListener('click', () => this.turn());
      return;
    }

    const buttons = [
      { kind: 'again', label: 'Again', icon: 'rotate-ccw', cls: 'is-again' },
      { kind: 'unknown', label: 'Not yet', icon: 'x', cls: 'is-unknown' },
      { kind: 'known', label: 'Knew it', icon: 'check', cls: 'is-known' }
    ];

    for (const spec of buttons) {
      const button = row.createEl('button', { cls: 'trisent-answer ' + spec.cls });
      setIcon(button.createSpan(), spec.icon);
      button.createSpan({ text: spec.label });
      button.addEventListener('click', () => this.rate(spec.kind, language));
    }
  }

  renderSummary(page, language) {
    const session = this.session;

    page.createEl('h1', { text: 'Done' });
    page.createEl('p', {
      cls: 'trisent-lead',
      text: session.total === 1
        ? 'One card practised.'
        : session.total + ' cards practised.'
    });

    const counts = page.createDiv({ cls: 'trisent-deck-summary' });
    this.renderCount(counts, String(session.known), 'knew it', session.known > 0);
    this.renderCount(counts, String(session.unknown), 'not yet', false);
    if (session.repeats > 0) {
      this.renderCount(counts, String(session.repeats), 'turned back', false);
    }

    const days = this.streak.current(language);
    if (days > 0) {
      page.createEl('p', {
        cls: 'trisent-muted',
        text: days === 1 ? 'Day one.' : days + ' days in a row.'
      });
    }

    const row = page.createDiv({ cls: 'trisent-answers' });
    const again = row.createEl('button', { cls: 'trisent-turn' });
    setIcon(again.createSpan(), 'layers');
    again.createSpan({ text: 'Back to the deck' });
    again.addEventListener('click', () => this.stop());
  }

  turn() {
    if (!this.session || this.session.revealed) return;
    this.session.reveal();
    this.render();
  }

  stop() {
    this.session = null;
    this.render();
  }

  /* Erst zeichnen, dann schreiben: Der Knopf soll sofort antworten, das
     Festhalten darf einen Augenblick dauern. */
  async rate(kind, language) {
    if (!this.session) return;
    const result = this.session.answer(kind, today());
    this.render();
    if (!result) return;

    try {
      await this.deck.save(result.card, result.state);
    } catch (error) {
      new Notice('Could not save this card: ' + String(error.message || error));
    }

    if (!this.counted) {
      this.counted = true;
      await this.streak.touch(language);
    }
  }

  /* Am Schreibtisch tippt man lieber, als zu zielen. */
  onKey(event) {
    if (!this.session || this.session.done) return;
    if (this.app.workspace.getActiveViewOfType(DeckView) !== this) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const target = event.target;
    if (target && (target.isContentEditable
      || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

    const language = this.library.languageByCode(this.languageCode);
    if (!language) return;

    if (!this.session.revealed) {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      this.turn();
      return;
    }

    const keys = { '1': 'again', '2': 'unknown', '3': 'known' };
    const kind = keys[event.key];
    if (!kind) return;
    event.preventDefault();
    this.rate(kind, language);
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
    if (card.level >= maxLevel() && rhythm()[maxLevel()] > 1000) return 'learned';
    return 'in ' + days + ' days';
  }
}

module.exports = { DeckView, VIEW_TYPE, RIBBON_ICON };
