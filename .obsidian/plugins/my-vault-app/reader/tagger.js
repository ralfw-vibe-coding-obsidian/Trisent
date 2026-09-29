"use strict";

/*
 * Tags an einen Text vergeben.
 *
 * Ein kleines Fenster statt eines Feldes auf der Karte: Die Karte ist
 * selbst ein Knopf, der den Text öffnet, und auf dem Handy träfe man
 * sonst ständig das Falsche.
 *
 * Oben ALLE Tags der Sprache als Chips; die dieses Textes sind markiert.
 * Antippen wählt an oder ab. Darunter ein kleines Feld für einen neuen
 * Tag - mit Enter steht er in der Liste und ist gewählt. Das "x" an einem
 * Chip löscht den Tag aus allen Texten, nach einer Rückfrage am Chip
 * selbst.
 *
 * Jeder Tipp wird sofort gespeichert - es gibt nichts zu bestätigen und
 * nichts zu verlieren, wenn man das Fenster einfach schließt.
 */

const { Modal, Notice, setIcon } = require('obsidian');
const { toggleTag, hasTag, allTags, cleanTag, tagKey } = require('../learning/tags.js');

class TagModal extends Modal {
  /* options: {
       title, tags, known,
       save(tags) -> Promise<tags>,
       usage(tag) -> Zahl der Texte,
       remove(tag) -> Promise<Zahl>,
       done()
     } */
  constructor(app, options) {
    super(app);
    this.options = options;
    this.tags = options.tags || [];
    /* Die Liste merkt sich jeden Tag, der einmal darin stand - ein neuer,
       den man gleich wieder abwählt, soll nicht verschwinden. */
    this.known = allTags([options.known || [], this.tags]);
    /* Der Tag, dessen Löschen gerade nachgefragt wird. */
    this.asking = null;
  }

  onOpen() {
    /* titleEl statt setTitle(): Das eine gibt es in jeder Fassung von
       Obsidian, das andere erst in neueren. */
    this.titleEl.setText('Tags');
    this.modalEl.addClass('trisent-modal');
    const body = this.contentEl;
    body.addClass('trisent-tagger');

    body.createDiv({ cls: 'trisent-tagger-title', text: this.options.title || '' });
    this.chipsEl = body.createDiv({ cls: 'trisent-tagger-chips' });

    const add = body.createDiv({ cls: 'trisent-tagger-add' });
    const input = add.createEl('input', {
      cls: 'trisent-tagger-input',
      attr: { type: 'text', placeholder: 'New tag', enterkeyhint: 'done' }
    });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const tag = cleanTag(input.value);
      input.value = '';
      if (!tag) return;

      this.known = allTags([this.known, [tag]]);
      if (hasTag(this.tags, tag)) {
        this.paint();
        return;
      }
      this.change(toggleTag(this.tags, tag));
    });

    const buttons = body.createDiv({ cls: 'modal-button-container' });
    const done = buttons.createEl('button', { cls: 'mod-cta', text: 'Done' });
    done.addEventListener('click', () => this.close());

    this.paint();
  }

  paint() {
    const row = this.chipsEl;
    row.empty();

    if (this.known.length === 0) {
      row.createDiv({ cls: 'trisent-tagger-empty', text: 'No tags yet. Type one below.' });
      return;
    }

    for (const tag of this.known) {
      if (this.asking && tagKey(this.asking) === tagKey(tag)) {
        this.paintQuestion(row, tag);
        continue;
      }

      const on = hasTag(this.tags, tag);
      const chip = row.createDiv({ cls: 'trisent-tagger-chip' + (on ? ' is-on' : '') });

      const pick = chip.createEl('button', { cls: 'trisent-tagger-pick', text: '#' + tag });
      pick.addEventListener('click', () => this.change(toggleTag(this.tags, tag)));

      const drop = chip.createEl('button', {
        cls: 'trisent-tagger-drop',
        attr: { 'aria-label': 'Delete #' + tag + ' everywhere' }
      });
      setIcon(drop, 'x');
      drop.addEventListener('click', () => {
        /* Ein Tag, der an keinem Text hängt (eben getippt und wieder
           abgewählt), braucht keine Rückfrage - er verschwindet einfach. */
        const used = this.options.usage ? this.options.usage(tag) : 1;
        if (used === 0 && !hasTag(this.tags, tag)) {
          this.remove(tag);
          return;
        }
        this.asking = tag;
        this.paint();
      });
    }
  }

  /* Löschen trifft alle Texte - deshalb eine Rückfrage, und zwar am Chip
     selbst: Man sieht, worum es geht, und nichts poppt auf. */
  paintQuestion(row, tag) {
    const count = this.options.usage ? this.options.usage(tag) : 0;
    const chip = row.createDiv({ cls: 'trisent-tagger-chip is-asking' });
    chip.createSpan({
      cls: 'trisent-tagger-ask',
      text: 'Delete #' + tag + (count > 0
        ? ' from ' + count + (count === 1 ? ' text' : ' texts') + '?'
        : '?')
    });

    const yes = chip.createEl('button', { cls: 'trisent-tagger-yes', text: 'Delete' });
    yes.addEventListener('click', () => this.remove(tag));

    const no = chip.createEl('button', { cls: 'trisent-tagger-no', text: 'Keep' });
    no.addEventListener('click', () => {
      this.asking = null;
      this.paint();
    });
  }

  async remove(tag) {
    this.asking = null;
    const key = tagKey(tag);
    try {
      if (this.options.remove) await this.options.remove(tag);
    } catch (error) {
      new Notice('Could not delete the tag: ' + String(error.message || error));
      this.paint();
      return;
    }
    this.known = this.known.filter((own) => tagKey(own) !== key);
    this.tags = this.tags.filter((own) => tagKey(own) !== key);
    this.paint();
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
