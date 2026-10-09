"use strict";

/*
 * Der Index als Modul - die Sammlung der Wörter, die der Person beim
 * Lesen und Übersetzen aufgefallen sind.
 *
 * Gehört zur Learning-Seite, liegt aber in einem eigenen Verzeichnis,
 * damit daran getrennt gearbeitet werden kann. Er ersetzt in der
 * Oberfläche die Lernkartei (flashcards/, abgeschaltet).
 *
 * Seine Einstellungen (Reihenfolge, Reiter, zuletzt gewählte Sprache)
 * stehen in data.json unter `index`.
 */

const { IndexView, VIEW_TYPE, RIBBON_ICON } = require('./view.js');

const DEFAULTS = {
  lastLanguage: null,
  /* 'recent', 'alphabetical', 'stumbled', 'frequent' - siehe marks.js. */
  sort: 'recent',
  /* 'active' oder 'archived'. */
  show: 'active'
};

class Index {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.library = plugin.learning.library;
    this.words = plugin.learning.wordIndex;
    this.dictionary = plugin.learning.dictionary;

    /* Ein eigener Bereich in den Einstellungen, ergänzt um, was fehlt. */
    plugin.settings.index = Object.assign({}, DEFAULTS, plugin.settings.index || {});

    plugin.registerView(VIEW_TYPE, (leaf) => new IndexView(leaf, this));
    plugin.addRibbonIcon(RIBBON_ICON, 'Trisent: Index', () => this.open());
    plugin.addCommand({
      id: 'open-index',
      name: 'Index',
      callback: () => this.open()
    });
  }

  get settings() {
    return this.plugin.settings.index;
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

  /* Die Word card zu einem Wort - dieselbe wie im Reader. */
  async showWord(language, key) {
    const reader = this.plugin.reader;
    if (!reader) return;
    try {
      await reader.showWord(language, key);
    } catch (error) {
      console.error('Trisent: could not show this word', error);
    }
  }

  /* Ein Wort ist archiviert, zurückgeholt oder gelöscht - das Zeichen im
     offenen Text nachziehen. */
  changed(language, key) {
    const reader = this.plugin.reader;
    const view = reader && reader.readerView ? reader.readerView() : null;
    if (!view) return;
    const mark = this.words.markFor(language, key);
    view.setIndexMark(key, Boolean(mark) && !mark.archived);
  }

  refresh() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof IndexView) leaf.view.render();
    });
  }
}

module.exports = { Index, DEFAULTS, VIEW_TYPE };
