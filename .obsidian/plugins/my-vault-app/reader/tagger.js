"use strict";

/*
 * Tags an einen Text vergeben.
 *
 * Ein kleines Fenster statt eines Feldes auf der Karte: Die Karte ist
 * selbst ein Knopf, der den Text öffnet, und auf dem Handy träfe man
 * sonst ständig das Falsche. Hier stehen alle Tags der Sprache zum
 * Antippen, darunter ein Feld für einen neuen.
 *
 * Jeder Tipp wird sofort gespeichert - es gibt nichts zu bestätigen und
 * nichts zu verlieren, wenn man das Fenster einfach schließt.
 */

const { Modal, Notice } = require('obsidian');
const { toggleTag, hasTag, allTags, cleanTag } = require('../learning/tags.js');

class TagModal extends Modal {
  /* options: { title, tags, known, save(tags) -> Promise, done() } */
  constructor(app, options) {
    super(app);
    this.options = options;
    this.tags = options.tags || [];
  }

  onOpen() {
    /* titleEl statt setTitle(): Das eine gibt es in jeder Fassung von
       Obsidian, das andere erst in neueren. */
    this.titleEl.setText('Tags');
    const body = this.contentEl;
    body.addClass('trisent-tagger');

    body.createDiv({ cls: 'trisent-tagger-title', text: this.options.title || '' });
    this.chipsEl = body.createDiv({ cls: 'trisent-tagger-chips' });

    const input = body.createEl('input', {
      cls: 'trisent-tagger-input',
      attr: { type: 'text', placeholder: 'New tag, then Enter', enterkeyhint: 'done' }
    });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const tag = cleanTag(input.value);
      input.value = '';
      if (!tag || hasTag(this.tags, tag)) return;
      this.change(toggleTag(this.tags, tag));
    });

    const buttons = body.createDiv({ cls: 'modal-button-container' });
    const done = buttons.createEl('button', { cls: 'mod-cta', text: 'Done' });
    done.addEventListener('click', () => this.close());

    this.paint();
  }

  /* Alle Tags der Sprache, dazu die eigenen - auch ein eben neu
     getippter steht dann gleich zwischen den anderen. */
  paint() {
    const row = this.chipsEl;
    row.empty();

    const shown = allTags([this.options.known || [], this.tags]);
    if (shown.length === 0) {
      row.createDiv({ cls: 'trisent-tagger-empty', text: 'No tags yet. Type one below.' });
      return;
    }

    for (const tag of shown) {
      const on = hasTag(this.tags, tag);
      const chip = row.createEl('button', {
        cls: 'trisent-tagger-chip' + (on ? ' is-on' : ''),
        text: '#' + tag
      });
      chip.addEventListener('click', () => this.change(toggleTag(this.tags, tag)));
    }
  }

  async change(tags) {
    const before = this.tags;
    this.tags = tags;
    this.paint();
    try {
      this.tags = await this.options.save(tags);
      this.paint();
    } catch (error) {
      this.tags = before;
      this.paint();
      new Notice('Could not save the tags: ' + String(error.message || error));
    }
  }

  onClose() {
    this.contentEl.empty();
    if (this.options.done) this.options.done(this.tags);
  }
}

function editTags(app, options) {
  new TagModal(app, options).open();
}

module.exports = { editTags };
