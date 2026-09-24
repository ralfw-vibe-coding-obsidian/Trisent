"use strict";

/*
 * Die Frage beim Import: Sollen neuere Erklärungen die vorhandenen
 * ersetzen?
 *
 * Gestellt wird sie nur, wenn ein Paket Erklärungen mitbringt, die nach
 * einem neueren Bauplan geschrieben sind als die, die schon im Wörterbuch
 * der Person stehen. Neue Wörter kommen ohne Frage dazu - ohne sie hätte
 * der Text Lücken, und es gibt nichts zu ersetzen.
 *
 * Wird das Fenster ohne Antwort geschlossen, gilt nein: Im Zweifel bleibt,
 * was die Person schon hat.
 */

const { Modal } = require('obsidian');

/* Wie viele Wörter das Fenster einzeln zeigt. Bei hundert Wörtern hilft
   keine Liste mehr beim Entscheiden, ein paar Beispiele schon. */
const SHOWN = 8;

/* Was sich an einem Wort ändert, in ein paar Worten. */
function changeOf(upgrade) {
  const before = upgrade.before || {};
  const after = upgrade.after || {};
  if ((before.gloss || '') !== (after.gloss || '')) return null;
  if ((before.grammar || '') !== (after.grammar || '')) return 'description reworded';
  if (JSON.stringify(before.forms || []) !== JSON.stringify(after.forms || [])) return 'forms changed';
  return 'same content, newer recipe';
}

class UpgradeModal extends Modal {
  constructor(app, question, resolve) {
    super(app);
    this.question = question;
    this.resolve = resolve;
    this.answered = false;
  }

  onOpen() {
    const upgrades = this.question.upgrades || [];
    const count = upgrades.length;

    /* titleEl statt setTitle(): Das eine gibt es in jeder Fassung von
       Obsidian, das andere erst in neueren. */
    this.titleEl.setText(count === 1
      ? 'A better explanation for one word'
      : 'Better explanations for ' + count + ' words');

    const body = this.contentEl;
    body.addClass('trisent-upgrade');

    /* Die Nummern des Bauplans - einmal oben, wenn sie überall gleich
       sind, sonst an jedem Wort. */
    const froms = new Set(upgrades.map((u) => u.from));
    const tos = new Set(upgrades.map((u) => u.to));
    const uniform = froms.size === 1 && tos.size === 1;

    body.createEl('p', {
      cls: 'trisent-upgrade-lead',
      text: '"' + this.question.title + '" (' + this.question.language + ') brings '
        + (count === 1 ? 'an explanation' : 'explanations')
        + ' written with a newer recipe'
        + (uniform ? ' (' + [...froms][0] + ' → ' + [...tos][0] + ')' : '')
        + '. Take ' + (count === 1 ? 'it' : 'them') + ' over?'
    });

    const list = body.createDiv({ cls: 'trisent-upgrade-list' });
    for (const upgrade of upgrades.slice(0, SHOWN)) {
      const row = list.createDiv({ cls: 'trisent-upgrade-row' });
      row.createSpan({
        cls: 'trisent-upgrade-word',
        text: (upgrade.after && upgrade.after.lemma) || upgrade.key.split(':')[1] || upgrade.key
      });

      const what = row.createSpan({ cls: 'trisent-upgrade-change' });
      const note = changeOf(upgrade);
      if (note) {
        what.setText(note);
      } else {
        what.createSpan({ cls: 'trisent-upgrade-before', text: upgrade.before.gloss || '—' });
        what.createSpan({ cls: 'trisent-upgrade-arrow', text: ' → ' });
        what.createSpan({ cls: 'trisent-upgrade-after', text: upgrade.after.gloss || '—' });
      }

      if (!uniform) {
        row.createSpan({ cls: 'trisent-upgrade-recipe', text: upgrade.from + ' → ' + upgrade.to });
      }
    }
    if (count > SHOWN) {
      list.createDiv({ cls: 'trisent-upgrade-more', text: 'and ' + (count - SHOWN) + ' more' });
    }

    body.createEl('p', {
      cls: 'trisent-upgrade-note',
      text: 'New words come in either way. This is only about words already in your dictionary.'
    });

    const buttons = body.createDiv({ cls: 'modal-button-container' });
    const keep = buttons.createEl('button', { text: 'Keep mine' });
    keep.addEventListener('click', () => this.answer(false));
    const take = buttons.createEl('button', { cls: 'mod-cta', text: 'Take them over' });
    take.addEventListener('click', () => this.answer(true));
  }

  answer(yes) {
    if (this.answered) return;
    this.answered = true;
    this.resolve(yes);
    this.close();
  }

  onClose() {
    this.contentEl.empty();
    /* Weggeklickt, ohne zu antworten: dann bleibt es, wie es ist. */
    if (!this.answered) {
      this.answered = true;
      this.resolve(false);
    }
  }
}

/* Die Frage stellen und auf die Antwort warten. */
function askForUpgrades(app, question) {
  return new Promise((resolve) => new UpgradeModal(app, question, resolve).open());
}

module.exports = { askForUpgrades };
