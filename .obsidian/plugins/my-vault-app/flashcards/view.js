"use strict";

/*
 * Die Lernkartei: ansehen und üben.
 *
 * Drei Bilder in einer Ansicht - Sprachen, die Kartei einer Sprache, und
 * die laufende Sitzung. Gerechnet wird nirgends hier: Wann eine Karte
 * wiederkommt, steht in schedule.js, wie der Stapel läuft in session.js.
 */

const { ItemView, Notice, setIcon, setTooltip } = require('obsidian');
const {
  isDue, isNew, today, daysBetween, pick, timeline, barHeight,
  SOURCES, rhythm, maxLevel
} = require('./schedule.js');
const { Session } = require('./session.js');
const { searchPackages } = require('../learning/occurrences.js');

/* Wonach die Kartei geordnet wird. Bei gleicher Schwierigkeit
   alphabetisch - sonst wechselte die Reihenfolge bei jedem Zeichnen. */
/* Wie viele Beispielsätze auf der Rückseite stehen. Genug, um zu sehen,
   wie das Wort sich benimmt, wenig genug, um sie noch zu lesen. */
const EXAMPLES = 5;

/* Wie weit der Zeitstrahl nach vorn schaut: heute und 31 Tage. Ein
   Monat - lang genug, dass man einen Berg kommen sieht, kurz genug für
   einen Strich je Tag. */
const SPAN = 32;

/* Ein kurzes Datum wie "20 Oct". Mittags gerechnet, damit keine
   Zeitzone den Tag verschiebt. */
function shortDate(day) {
  try {
    return new Date(day + 'T12:00:00Z').toLocaleDateString('en', {
      day: 'numeric', month: 'short', timeZone: 'UTC'
    });
  } catch (error) {
    return day;
  }
}

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
    this.examples = new Map();
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
      this.renderStreak(top, language);

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
    this.renderStreak(head, language);

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
    this.renderTimeline(page, cards, now);

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

  /* An wie vielen Tagen hintereinander mit dieser Sprache gelernt wurde.
     Derselbe Zähler wie im Reader und im Translator - Karten üben ist
     dieselbe Beschäftigung mit derselben Sprache. */
  renderStreak(parent, language) {
    const days = this.streak.current(language);
    if (days <= 0) return;

    const badge = parent.createSpan({
      cls: 'trisent-streak',
      attr: { title: days + (days === 1 ? ' day in a row' : ' days in a row') }
    });
    setIcon(badge.createSpan({ cls: 'trisent-streak-icon' }), 'flame');
    badge.createSpan({ text: String(days) });
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
    this.paintCard(row, card, now);
  }

  paintCard(row, card, now) {
    row.empty();
    row.removeClass('is-asking');

    /* Weglegen. Klein und blass, aber immer da - auf dem Telefon gibt es
       kein Darüberfahren, unter dem sich etwas verstecken ließe. */
    const drop = row.createEl('button', { cls: 'trisent-card-drop' });
    setIcon(drop.createSpan(), 'x');
    setTooltip(drop, 'Remove from deck');
    drop.addEventListener('click', () => this.askRemove(row, card, now));

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

  /* Zwei Schritte statt eines Dialogs: Die Karte selbst fragt nach, und
     man kann es sich anders überlegen, ohne dass etwas aufgepoppt ist.
     Der Lernstand des Wortes bleibt in jedem Fall - er steht in der
     Wortnotiz, nicht in der Karte. */
  askRemove(row, card, now) {
    row.empty();
    row.addClass('is-asking');

    row.createDiv({
      cls: 'trisent-card-ask',
      text: 'Remove “' + (card.front || card.key) + '”?'
    });
    row.createDiv({
      cls: 'trisent-card-ask-note',
      text: 'The word and what you know about it stay. Only the card goes.'
    });

    const buttons = row.createDiv({ cls: 'trisent-card-ask-buttons' });

    const keep = buttons.createEl('button', { cls: 'trisent-ask-keep', text: 'Keep' });
    keep.addEventListener('click', () => this.paintCard(row, card, now));

    const drop = buttons.createEl('button', { cls: 'trisent-ask-drop', text: 'Remove' });
    drop.addEventListener('click', async () => {
      drop.setAttr('disabled', 'true');
      try {
        await this.deck.remove(card);
      } catch (error) {
        new Notice('Could not remove this card: ' + String(error.message || error));
        this.paintCard(row, card, now);
        return;
      }
      /* Die Ecke am Wort im Text verschwindet mit. */
      this.flashcards.plugin.reader?.forgetCard(card.key);
      this.render();
    });
  }

  /* ---------------------------------------------------------------- */
  /* Was auf einen zukommt                                             */
  /* ---------------------------------------------------------------- */

  /* Ein Strich je Tag, ein Balken dort, wo etwas wartet.

     Ganz links steht alles vor heute, ganz rechts alles nach dem Monat -
     zwei Sammelplätze am Ende einer Linie, auf der sonst je ein Tag
     steht. Sie stehen auf derselben Linie und in derselben Höhe wie die
     Tage, denn genau darum geht es: 320 Überfällige neben 10 von heute
     sieht man nur, wenn beide nebeneinander stehen. */
  renderTimeline(page, cards, now) {
    const strip = timeline(cards, now, SPAN);
    const counted = strip.fresh + strip.over + strip.later
      + strip.days.reduce((sum, entry) => sum + entry.count, 0);
    if (counted === 0) return;

    const last = strip.days[strip.days.length - 1].day;

    const section = page.createDiv({ cls: 'trisent-timeline' });
    section.createDiv({ cls: 'trisent-section-label', text: 'Coming up' });

    const plot = section.createDiv({ cls: 'trisent-tl' });

    /* Neue ganz links, vor dem Überfälligen: Sie sind kein Rückstand,
       sondern Vorrat - was man sich noch vornehmen kann. */
    this.renderSlot(plot, strip.fresh, 'is-edge is-new',
      this.cardsText(strip.fresh) + ' never seen');

    this.renderSlot(plot, strip.over, 'is-edge is-over',
      this.cardsText(strip.over) + ' before today');

    strip.days.forEach((entry, offset) => {
      const marks = offset === 0 ? 'is-today' : (offset % 7 === 0 ? 'is-week' : '');
      const when = this.whenText(offset) + ' · ' + shortDate(entry.day);

      this.renderSlot(plot, entry.count, marks,
        entry.count === 0
          ? 'Nothing ' + when
          : this.cardsText(entry.count) + ' ' + when);
    });

    this.renderSlot(plot, strip.later, 'is-edge is-later',
      this.cardsText(strip.later) + ' after ' + shortDate(last));

    /* Die Beschriftung nennt nur die beiden Enden. Was dazwischen liegt,
       sagt die Linie selbst - und das Datum steht am Strich, wenn man
       darauf zeigt. */
    /* Die beiden linken Sammelplätze stehen dicht beieinander, ihre
       Beschriftung deshalb auch - die Farbe sagt, welche zu welchem
       gehört. */
    const axis = section.createDiv({ cls: 'trisent-tl-axis' });
    const ends = axis.createSpan({ cls: 'trisent-tl-ends' });
    ends.createSpan({ cls: 'trisent-tl-key is-new', text: 'new' });
    ends.createSpan({ text: '·' });
    ends.createSpan({ cls: 'trisent-tl-key is-over', text: 'overdue' });
    axis.createSpan({ text: 'after ' + shortDate(last) });
  }

  /* Zahl oben, Balken darunter, Strich auf der Linie. Die leeren Tage
     bekommen dieselben Kästen - sonst säßen die Balken der vollen Tage
     auf verschiedenen Höhen. */
  renderSlot(parent, count, marks, title) {
    const slot = parent.createDiv({
      cls: 'trisent-tl-slot' + (marks ? ' ' + marks : ''),
      attr: { title: title }
    });

    slot.createDiv({
      cls: 'trisent-tl-value',
      text: count > 0 ? String(count) : ''
    });

    const stack = slot.createDiv({ cls: 'trisent-tl-stack' });
    if (count > 0) {
      const bar = stack.createDiv({ cls: 'trisent-tl-bar' });
      bar.style.height = Math.max(barHeight(count) * 100, 6) + '%';
    }

    slot.createDiv({ cls: 'trisent-tl-foot' });
  }

  cardsText(count) {
    return count + (count === 1 ? ' card' : ' cards');
  }

  whenText(offset) {
    if (offset === 0) return 'today';
    if (offset === 1) return 'tomorrow';
    return 'in ' + offset + ' days';
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
    /* Einmal gesucht, für die ganze Sitzung gemerkt: Eine Karte, die
       über "Again" wiederkommt, liest die Pakete nicht noch einmal. */
    this.examples = new Map();
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

    /* Eine angedeutete Karte, die sich dreht. Beide Seiten stehen von
       Anfang an da - die hintere ist nur weggedreht. Nur so gibt es eine
       Bewegung statt eines Sprungs, und nur deshalb zeichnet das
       Umdrehen die Seite nicht neu. */
    const stage = page.createDiv({ cls: 'trisent-stage' });
    const flip = stage.createDiv({
      cls: 'trisent-flip' + (session.revealed ? ' is-turned' : '')
    });
    const inner = flip.createDiv({ cls: 'trisent-flip-inner' });

    const front = inner.createDiv({ cls: 'trisent-flip-face is-front' });
    front.createDiv({
      cls: 'trisent-face-line ' + (wordSide ? 'is-word' : 'is-fluent'),
      text: session.question || '—'
    });
    front.createDiv({ cls: 'trisent-face-hint', text: 'tap to turn it over' });

    const reverse = inner.createDiv({ cls: 'trisent-flip-face is-back' });

    /* Die Frage steht auch auf der Rückseite, blass: Man sieht die
       Antwort sonst ohne das, wozu sie gehört - und beim Bewerten will
       man beides nebeneinander gelesen haben. */
    reverse.createDiv({
      cls: 'trisent-face-echo ' + (wordSide ? 'is-word' : 'is-fluent'),
      text: session.question || ''
    });

    reverse.createDiv({
      cls: 'trisent-face-line ' + (wordSide ? 'is-fluent' : 'is-word'),
      text: session.answerText || 'No translation in this card.'
    });
    this.renderCardFacts(reverse, card);

    flip.addEventListener('click', () => this.turn());
    this.flipEl = flip;

    /* Die Beispielsätze stehen unter der Karte, nicht darauf: Eine Karte
       hat eine feste Größe, fünf Sätze haben das nicht. */
    this.extrasEl = page.createDiv({ cls: 'trisent-examples' });
    if (session.revealed) this.renderExamples(this.extrasEl, card);

    this.answersEl = page.createDiv({ cls: 'trisent-answers' });
    this.paintAnswers(language);
  }

  /* Beispielsätze - erst nach dem Umdrehen. Vorher wären sie ein halber
     Hinweis, und darum geht es beim Abfragen ja gerade nicht.

     Gesucht wird über den Wissensschlüssel, mit demselben Code, den der
     Reader für die Wortkarte benutzt. Ein Satz, der hier steht, ist also
     derselbe, den man dort findet. */
  renderExamples(slot, card) {
    const found = this.examples.get(card.key);
    if (found) {
      this.paintExamples(slot, found);
      return;
    }

    slot.createDiv({ cls: 'trisent-examples-wait', text: 'Looking for examples…' });
    this.loadExamples(slot, card);
  }

  async loadExamples(slot, card) {
    const language = this.library.languageByCode(this.languageCode);
    if (!language) return;

    let found = [];
    try {
      found = await searchPackages(this.library, language, card.key, { limit: EXAMPLES });
    } catch (error) {
      found = [];
    }
    this.examples.set(card.key, found);

    /* Inzwischen kann die Karte weitergeblättert sein - dann gehört der
       Kasten nicht mehr zur Seite und darf nicht mehr gefüllt werden. */
    if (!slot.isConnected) return;
    this.paintExamples(slot, found);
  }

  paintExamples(slot, found) {
    slot.empty();
    if (found.length === 0) return;

    for (const occurrence of found) {
      const row = slot.createDiv({ cls: 'trisent-example' });
      const line = row.createDiv({ cls: 'trisent-example-source' });
      line.createSpan({ text: occurrence.before });
      line.createSpan({ cls: 'trisent-example-hit', text: occurrence.hit });
      line.createSpan({ text: occurrence.after });
      if (occurrence.fluent) {
        row.createDiv({ cls: 'trisent-example-fluent', text: occurrence.fluent });
      }
    }
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

  paintAnswers(language) {
    const session = this.session;
    const row = this.answersEl;
    if (!session || !row) return;
    row.empty();

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

  /* Umdrehen zeichnet die Seite NICHT neu - sonst entstünde die Karte
     neu und stünde sofort auf der Rückseite, ohne Bewegung. */
  turn() {
    if (!this.session || this.session.revealed) return;
    this.session.reveal();

    if (this.flipEl) this.flipEl.addClass('is-turned');
    if (this.extrasEl) this.renderExamples(this.extrasEl, this.session.card);
    this.paintAnswers(this.library.languageByCode(this.languageCode));
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
