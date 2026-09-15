"use strict";

/*
 * Die Wortkarte - rechts in der Seitenleiste.
 *
 * Gehört dieser Sitzung.
 */

const { ItemView, setIcon } = require('obsidian');
const { WORD_STATUS, readablePos } = require('../core/package.js');

const CARD_VIEW_TYPE = 'trisent-card-view';

class WordCardView extends ItemView {
  constructor(leaf, reader) {
    super(leaf);
    this.reader = reader;
    this.card = null;
  }

  getViewType() {
    return CARD_VIEW_TYPE;
  }

  getDisplayText() {
    return this.card ? this.card.lemma : 'Word';
  }

  getIcon() {
    return 'book-open';
  }

  async onOpen() {
    this.render();
  }

  show(card) {
    this.card = card;
    this.render();
    /* Der Reiter trägt das Wort im Titel. */
    this.leaf.updateHeader?.();
  }

  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('trisent-card-view');

    if (!this.card) {
      root.createDiv({
        cls: 'trisent-card-hint',
        text: 'Long press a word — or right click it — to see it here.'
      });
      return;
    }

    const card = this.card;
    const page = root.createDiv({ cls: 'trisent-card' });

    /* Kopf: die Grundform, nicht die Form aus dem Satz. */
    const head = page.createDiv({ cls: 'trisent-card-head' });
    head.createDiv({ cls: 'trisent-card-lemma', text: card.lemma });
    const tags = head.createDiv({ cls: 'trisent-card-tags' });
    if (card.partOfSpeech) {
      tags.createSpan({ cls: 'trisent-chip', text: readablePos(card.partOfSpeech) });
    }
    if (card.surface && card.surface !== card.lemma) {
      tags.createSpan({ cls: 'trisent-card-form', text: 'in the text: ' + card.surface });
    }

    if (card.gloss) {
      page.createDiv({ cls: 'trisent-card-gloss', text: card.gloss });
    }

    /* Nur der Stand, den das Wort gerade hat. Vier Knöpfe nebeneinander
       sahen aus wie eine Frage, die niemand gestellt hat. Antippen
       schaltet weiter - dieselbe Bewegung wie im Text. */
    const row = page.createDiv({ cls: 'trisent-card-state' });
    const pill = row.createEl('button', { cls: 'trisent-status is-' + card.status });
    pill.createSpan({ cls: 'trisent-status-dot' });
    pill.createSpan({ cls: 'trisent-status-name', text: card.status });
    row.createSpan({ cls: 'trisent-status-hint', text: 'tap to change' });

    pill.addEventListener('click', () => {
      const at = WORD_STATUS.indexOf(card.status);
      const next = WORD_STATUS[(at + 1) % WORD_STATUS.length];
      this.reader.setStatusEverywhere(card.key, next, card.entry);
      card.status = next;
      this.render();
    });

    if (card.forms && card.forms.length > 0) {
      const section = this.section(page, 'Forms');
      const chips = section.createDiv({ cls: 'trisent-topics' });
      for (const form of card.forms) chips.createSpan({ cls: 'trisent-topic', text: form });
    }

    if (card.grammar) {
      this.section(page, 'Grammar').createDiv({
        cls: 'trisent-card-text',
        text: card.grammar
      });
    }

    /* Wendungen, zu denen dieses Wort gehört. Der Weg zur Klammer, wenn
       die Glossen ausgeblendet sind. */
    if (card.phrases && card.phrases.length > 0) {
      const section = this.section(page, 'Part of');
      for (const phrase of card.phrases) {
        const row = section.createEl('button', { cls: 'trisent-card-phrase' });
        row.createSpan({ cls: 'trisent-card-phrase-surface', text: phrase.lemma });
        row.createSpan({ cls: 'trisent-card-phrase-gloss', text: phrase.gloss || '' });
        row.addEventListener('click', () => this.reader.openCardFor(phrase.key));
      }
    }

    this.renderOccurrences(page, card);

    /* Der Weg in die eigene Notiz - dort ist Platz für alles Eigene. */
    const foot = page.createDiv({ cls: 'trisent-card-foot' });
    const open = foot.createEl('button', { cls: 'trisent-card-open' });
    setIcon(open.createSpan(), 'file-text');
    open.createSpan({ text: card.file ? 'Open note' : 'Create note' });
    open.addEventListener('click', () => this.reader.openWordNote(card));
  }

  /* Alle Stellen, an denen das Wort vorkommt - nach Text gruppiert, der
     gerade gelesene zuerst. Das ist der Moment, in dem aus einzelnen
     Texten ein Netz wird. */
  renderOccurrences(page, card) {
    const groups = [];
    const byPath = new Map();

    for (const occurrence of card.occurrences || []) {
      let group = byPath.get(occurrence.path);
      if (!group) {
        group = { title: occurrence.title, path: occurrence.path, items: [] };
        byPath.set(occurrence.path, group);
        groups.push(group);
      }
      group.items.push(occurrence);
    }

    if (groups.length === 0 && !card.searching) return;

    const total = (card.occurrences || []).length;
    const elsewhere = groups.filter((g) => g.title).length;

    let title = total + (total === 1 ? ' place' : ' places');
    if (elsewhere > 0) {
      title += ' · ' + (elsewhere + 1) + ' texts';
    }
    const section = this.section(page, title);

    for (const group of groups) {
      /* Der gerade gelesene Text trägt keinen Titel - man weiß ja, wo man
         ist. Die anderen schon, und sie sind anklickbar. */
      if (group.title) {
        const head = section.createEl('button', { cls: 'trisent-occurrence-text' });
        setIcon(head.createSpan({ cls: 'trisent-occurrence-icon' }), 'corner-down-right');
        head.createSpan({ text: group.title });
        head.addEventListener('click', () =>
          this.reader.goTo(card.language.code, group.path, group.items[0].sentence)
        );
      }

      for (const occurrence of group.items) {
        const row = section.createDiv({ cls: 'trisent-occurrence' });
        const line = row.createDiv({ cls: 'trisent-occurrence-source' });
        line.createSpan({ text: occurrence.before });
        line.createSpan({ cls: 'trisent-occurrence-hit', text: occurrence.hit });
        line.createSpan({ text: occurrence.after });
        row.createDiv({ cls: 'trisent-occurrence-fluent', text: occurrence.fluent });

        if (group.title) {
          row.addClass('is-clickable');
          row.addEventListener('click', () =>
            this.reader.goTo(card.language.code, group.path, occurrence.sentence)
          );
        }
      }
    }

    if (card.searching) {
      section.createDiv({ cls: 'trisent-occurrence-searching', text: 'Looking in your other texts…' });
    }
  }

  section(page, title) {
    const section = page.createDiv({ cls: 'trisent-card-section' });
    section.createDiv({ cls: 'trisent-card-section-title', text: title });
    return section;
  }
}

module.exports = { WordCardView, CARD_VIEW_TYPE };
