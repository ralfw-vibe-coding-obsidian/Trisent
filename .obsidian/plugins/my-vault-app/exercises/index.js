"use strict";

/*
 * Exercises als Modul - Übungen, die zum Übersetzen hinführen.
 *
 * Gehört zur Learning-Seite, liegt aber in einem eigenen Verzeichnis.
 * Liest dieselben Geschichten wie Reader und Translator und, für "The
 * hardest", die Versuche aus dem Translator. Schreibt nichts: Hier wird
 * nur geübt.
 *
 * Seine Einstellungen (Übungsart, Zahl der Sätze, zuletzt gewählte
 * Sprache) stehen in data.json unter `exercises`.
 */

const { ExercisesView, VIEW_TYPE, RIBBON_ICON } = require('./view.js');

const DEFAULTS = {
  lastLanguage: null,
  type: 'puzzle',
  size: 5,
  /* Bei "Build": ob die Bausteine zu sehen sind. */
  buildBlocks: true,
  /* Beim Diktat: wie schnell vorgespielt wird - dieselben Stufen wie im
     Reader. */
  speed: 1
};

class Exercises {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.library = plugin.learning.library;

    plugin.settings.exercises = Object.assign({}, DEFAULTS, plugin.settings.exercises || {});

    plugin.registerView(VIEW_TYPE, (leaf) => new ExercisesView(leaf, this));
    plugin.addRibbonIcon(RIBBON_ICON, 'Trisent: Exercises', () => this.open());
    plugin.addCommand({
      id: 'open-exercises',
      name: 'Exercises',
      callback: () => this.open()
    });
  }

  get settings() {
    return this.plugin.settings.exercises;
  }

  saveSettings() {
    return this.plugin.saveSettings();
  }

  /* Die Versuche aus dem Translator - nur gelesen, für "The hardest". */
  records() {
    return this.plugin.translator ? this.plugin.translator.records : null;
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

  /* Während einer Übung wird nicht neu gezeichnet - sonst wäre das
     halbe Puzzle weg. */
  refresh() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof ExercisesView && leaf.view.screen !== 'session') leaf.view.render();
    });
  }
}

module.exports = { Exercises, DEFAULTS, VIEW_TYPE };
