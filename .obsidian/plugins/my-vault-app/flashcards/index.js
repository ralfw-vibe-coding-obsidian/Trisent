"use strict";

/*
 * Die Lernkartei als Modul.
 *
 * Gehört zur Learning-Seite, liegt aber in einem eigenen Verzeichnis,
 * damit daran getrennt gearbeitet werden kann.
 */

const { Setting } = require('obsidian');
const { DeckView, VIEW_TYPE, RIBBON_ICON } = require('./view.js');
const {
  SOURCES, DEFAULT_RHYTHM, rhythm, parseRhythm, formatRhythm, configure
} = require('./schedule.js');

const DEFAULTS = {
  lastLanguage: null,
  /* Was eine Sitzung zieht und wie groß sie ist. */
  source: 'due',
  size: 20,
  /* Welche Seite gefragt wird: 'front' zeigt die Fremdsprache und fragt
     die Übersetzung, 'back' zeigt die Übersetzung und fragt das Wort. */
  ask: 'front',
  /* Wonach die Kartei geordnet ist. */
  sort: 'alphabetical',
  /* Der Wiedervorlagerhythmus in Tagen, eine Zahl je Stufe. */
  rhythm: formatRhythm(DEFAULT_RHYTHM)
};

class Flashcards {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.library = plugin.learning.library;
    this.deck = plugin.learning.deck;
    this.streak = plugin.learning.streak;

    /* Der eingestellte Rhythmus gilt ab jetzt für alles, was rechnet. */
    if (!configure(this.settings.rhythm)) configure(DEFAULT_RHYTHM);

    plugin.registerView(VIEW_TYPE, (leaf) => new DeckView(leaf, this));
    plugin.addRibbonIcon(RIBBON_ICON, 'Trisent: Flashcards', () => this.open());
    plugin.addCommand({
      id: 'open-flashcards',
      name: 'Flashcards',
      callback: () => this.open()
    });
  }

  get settings() {
    return this.plugin.settings.flashcards;
  }

  saveSettings() {
    return this.plugin.saveSettings();
  }

  async open() {
    const workspace = this.app.workspace;

    const already = workspace.getLeavesOfType(VIEW_TYPE);
    if (already.length > 0) {
      workspace.revealLeaf(already[0]);
      return;
    }

    const leaf = workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }

  refresh() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof DeckView) leaf.view.render();
    });
  }

  addSettings(containerEl) {
    /* Der Rhythmus als eine Liste, nicht als zehn Felder: Man will ihn
       im Ganzen sehen, weil erst die Folge etwas bedeutet. */
    let field = null;

    const setting = new Setting(containerEl)
      .setName('Rhythm')
      .setDesc(this.rhythmDesc());

    const apply = async (days) => {
      this.settings.rhythm = formatRhythm(days);
      configure(days);
      await this.saveSettings();
      setting.setDesc(this.rhythmDesc());
      this.refresh();
    };

    setting.addText((text) => {
      field = text;
      text
        .setPlaceholder(formatRhythm(DEFAULT_RHYTHM))
        .setValue(this.settings.rhythm || formatRhythm(DEFAULT_RHYTHM))
        .onChange(async (value) => {
          const days = parseRhythm(value);
          if (!days) {
            /* Nichts speichern, aber sagen, warum. Ein Feld, das stumm
               nichts tut, sieht aus wie ein kaputtes Feld. */
            setting.setDesc('Not a rhythm yet: at least two whole numbers, '
              + 'one per level, separated by commas.');
            return;
          }
          await apply(days);
        });
    });

    setting.addExtraButton((button) =>
      button
        .setIcon('rotate-ccw')
        .setTooltip('Back to Fibonacci')
        .onClick(async () => {
          await apply(DEFAULT_RHYTHM);
          if (field) field.setValue(formatRhythm(DEFAULT_RHYTHM));
        })
    );
  }

  rhythmDesc() {
    const days = rhythm();
    const last = days[days.length - 1];
    const lines = [
      'Days until a card comes back, one number per level. '
        + days.length + ' levels; the last one'
        + (last > 1000 ? ' means "practically never".' : ' is ' + last + ' days.'),
      'Separate the numbers with commas. A shorter list means fewer levels — '
        + 'cards that were higher come down to the new top.'
    ];
    return lines.join(' ');
  }
}

module.exports = { Flashcards, DEFAULTS, SOURCES, VIEW_TYPE, RIBBON_ICON };
