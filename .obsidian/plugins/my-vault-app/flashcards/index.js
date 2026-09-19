"use strict";

/*
 * Die Lernkartei als Modul.
 *
 * Gehört zur Learning-Seite, liegt aber in einem eigenen Verzeichnis,
 * damit daran getrennt gearbeitet werden kann.
 */

const { DeckView, VIEW_TYPE, RIBBON_ICON } = require('./view.js');
const { SOURCES } = require('./schedule.js');

const DEFAULTS = {
  lastLanguage: null,
  /* Was eine Sitzung zieht und wie groß sie ist. */
  source: 'due',
  size: 20,
  /* Welche Seite gefragt wird: 'front' zeigt die Fremdsprache und fragt
     die Übersetzung, 'back' zeigt die Übersetzung und fragt das Wort. */
  ask: 'front',
  /* Wonach die Kartei geordnet ist. */
  sort: 'alphabetical'
};

class Flashcards {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.library = plugin.learning.library;
    this.deck = plugin.learning.deck;
    this.streak = plugin.learning.streak;

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
    void containerEl;
  }
}

module.exports = { Flashcards, DEFAULTS, SOURCES, VIEW_TYPE, RIBBON_ICON };
