"use strict";

/*
 * Die Wortkarte - rechts in der Seitenleiste.
 *
 * Gehört dieser Sitzung.
 */

const { ItemView, MarkdownRenderer, setIcon, setTooltip } = require('obsidian');
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

    /* Kopf: die Grundform, nicht die Form aus dem Satz. Rechts daneben
       die Lernkartei - sie gehört nach oben, weil man sie im Moment des
       Lesens braucht und nicht erst hinter den Vorkommen suchen will. */
    const head = page.createDiv({ cls: 'trisent-card-head' });
    const naming = head.createDiv({ cls: 'trisent-card-naming' });
    this.renderDeckState(head.createDiv({ cls: 'trisent-card-deck' }), card);

    naming.createDiv({ cls: 'trisent-card-lemma', text: card.lemma });
    const tags = naming.createDiv({ cls: 'trisent-card-tags' });
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
      const box = this.section(page, 'Grammar').createDiv({ cls: 'trisent-card-text' });
      this.renderMarkdown(box, card.grammar, card);
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
    /* Immer "Open", nie "Create": Den Eintrag zu diesem Wort GIBT es -
       er steht im Paket, und die Karte zeigt ihn ja gerade an. Was beim
       ersten Mal noch fehlt, ist bloß die Datei in der Vault, und wann
       die entsteht, ist eine Frage der Umsetzung und keine, mit der man
       die Person behelligt. */
    open.createSpan({ text: 'Open dictionary entry' });
    open.addEventListener('click', () => this.reader.openWordNote(card));
  }

  /* Die Grammatiknotiz kommt aus dem Paket und ist Markdown - in den
     Notizen stehen Formen in `Akzenten`, Absätze durch Leerzeilen.
     Roh gezeigt sähe die Person diese Zeichen statt der Auszeichnung.

     Obsidian hat den Renderer unterwegs umbenannt: Neuere Fassungen
     haben MarkdownRenderer.render, ältere nur renderMarkdown. Wir
     nehmen, was da ist - sonst hängt das Aussehen davon ab, wann jemand
     Obsidian zuletzt aktualisiert hat. */
  renderMarkdown(box, text, card) {
    const path = card.file ? card.file.path : '';

    let job = null;
    try {
      if (typeof MarkdownRenderer.render === 'function') {
        job = MarkdownRenderer.render(this.app, text, box, path, this);
      } else if (typeof MarkdownRenderer.renderMarkdown === 'function') {
        job = MarkdownRenderer.renderMarkdown(text, box, path, this);
      }
    } catch (error) {
      console.error('Trisent: could not render the grammar note', error);
      job = null;
    }

    if (!job) {
      this.renderPlain(box, text);
      return;
    }
    job.catch((error) => {
      console.error('Trisent: could not render the grammar note', error);
      this.renderPlain(box, text);
    });
  }

  /* Der Notausgang. Auszeichnungen bleiben dann sichtbar - aber die
     Absätze wenigstens erhalten: Als ein Textblock liefe alles zu einem
     Klumpen zusammen, weil der Browser Zeilenumbrüche verschluckt. */
  renderPlain(box, text) {
    box.empty();
    for (const block of String(text).split(/\n\s*\n/)) {
      if (block.trim()) box.createEl('p', { text: block.trim() });
    }
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

  /* Ein Zeichen, kein Satz - es sitzt neben der Grundform und muss dort
     schmal bleiben. Was es bedeutet, sagt der Hinweis beim Darüberfahren. */
  renderDeckState(parent, card, known) {
    parent.empty();
    /* Nach dem Hinzufuegen kennen wir die Karte schon - dann nicht noch
       einmal nachschlagen, der Speicher haengt einen Wimpernschlag nach. */
    const entry = known
      || (card.language ? this.reader.deck.byKey(card.language).get(card.key) : null);

    if (entry) {
      const state = parent.createDiv({ cls: 'trisent-in-deck' });
      setIcon(state.createSpan({ cls: 'trisent-in-deck-icon' }), 'layers');
      state.createSpan({ cls: 'trisent-in-deck-level', text: String(entry.level) });
      setTooltip(state, 'In your deck · level ' + entry.level);
      return;
    }

    const button = parent.createEl('button', { cls: 'trisent-add-card' });
    setIcon(button.createSpan({ cls: 'trisent-add-card-icon' }), 'layers');
    button.createSpan({ cls: 'trisent-add-card-plus', text: '+' });
    setTooltip(button, 'Add to deck');
    button.setAttr('aria-label', 'Add to deck');
    button.addEventListener('click', async () => {
      button.setAttr('disabled', 'true');
      const added = await this.reader.addToDeck(card);
      if (!added) button.removeAttribute('disabled');
      this.renderDeckState(parent, card, added);
    });
  }

  section(page, title) {
    const section = page.createDiv({ cls: 'trisent-card-section' });
    section.createDiv({ cls: 'trisent-card-section-title', text: title });
    return section;
  }
}

module.exports = { WordCardView, CARD_VIEW_TYPE };
