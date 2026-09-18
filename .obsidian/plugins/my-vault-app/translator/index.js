"use strict";

/*
 * Der Translator als Modul.
 *
 * Gehört zur Learning-Seite und arbeitet im selben Datenbereich wie der
 * Reader: dieselben Pakete, daneben sein eigenes Satzwissen.
 */

const { Setting, Notice } = require('obsidian');
const { Library } = require('../core/library.js');
const { SentenceKnowledge } = require('./sentences.js');
const { TranslatorView, VIEW_TYPE, RIBBON_ICON } = require('./view.js');

const DEFAULTS = {
  /* In welche Richtung geübt wird. Die schwerere ist die Vorgabe. */
  direction: 'intoForeign',
  lastLanguage: null,
  /* Der Schlüssel der Person für die Prüfung - getrennt von dem, mit dem
     der Packager vertont. Der eine bezahlt das Üben, der andere das
     Herstellen. */
  openRouterKey: '',
  model: 'anthropic/claude-sonnet-5',
  /* Für das Einsprechen - dieselbe Anmeldung, anderes Modell. */
  speechModel: 'openai/whisper-large-v3'
};

class Translator {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.library = new Library(plugin.app, plugin, 'learning');
    this.knowledge = new SentenceKnowledge(plugin.app, this.library);

    plugin.registerView(VIEW_TYPE, (leaf) => new TranslatorView(leaf, this));
    plugin.addRibbonIcon(RIBBON_ICON, 'Translate with Trisent', () => this.open());
    plugin.addCommand({
      id: 'open-translator',
      name: 'Translate with Trisent',
      callback: () => this.open()
    });
  }

  get settings() {
    return this.plugin.settings.translator;
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
      if (leaf.view instanceof TranslatorView && leaf.view.screen !== 'text') leaf.view.render();
    });
  }

  addSettings(containerEl) {
    new Setting(containerEl)
      .setName('OpenRouter key')
      .setDesc('Checks your translations. Only used while you practise; it never goes into a package.')
      .addText((text) => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('sk-or-…')
          .setValue(this.settings.openRouterKey || '')
          .onChange(async (value) => {
            this.settings.openRouterKey = value.trim();
            await this.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Model')
      .setDesc('Checks your translations. Any model id from OpenRouter.')
      .addText((text) =>
        text
          .setPlaceholder(DEFAULTS.model)
          .setValue(this.settings.model || DEFAULTS.model)
          .onChange(async (value) => {
            this.settings.model = value.trim() || DEFAULTS.model;
            await this.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Speech model')
      .setDesc('Turns what you say into text. Any transcription model from OpenRouter.')
      .addText((text) =>
        text
          .setPlaceholder(DEFAULTS.speechModel)
          .setValue(this.settings.speechModel || DEFAULTS.speechModel)
          .onChange(async (value) => {
            this.settings.speechModel = value.trim() || DEFAULTS.speechModel;
            await this.saveSettings();
          })
      );
  }
}

module.exports = { Translator, DEFAULTS, VIEW_TYPE, RIBBON_ICON };
