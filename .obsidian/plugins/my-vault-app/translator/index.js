"use strict";

/*
 * Der Translator als Modul.
 *
 * Gehört zur Learning-Seite und arbeitet im selben Datenbereich wie der
 * Reader: dieselben Pakete, daneben sein eigenes Satzwissen.
 */

const { Setting, Notice } = require('obsidian');
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
  speechModel: 'openai/whisper-large-v3',
  /* Was das Üben bisher gekostet hat, in Dollar. OpenRouter legt die
     tatsächlichen Kosten jeder Anfrage bei; hier werden sie addiert. */
  spent: 0,
  spentSince: null
};

class Translator {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.library = plugin.learning.library;
    this.knowledge = new SentenceKnowledge(plugin.app, this.library);
    /* Derselbe Zähler wie im Reader - ein Tag Beschäftigung mit der
       Sprache, egal mit welchem Werkzeug. */
    this.streak = plugin.learning.streak;

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

  /* Die Kosten einer Anfrage dazuzählen. Geschrieben wird verzögert -
     beim Üben fällt das im Sekundentakt an. */
  addCost(amount) {
    if (typeof amount !== 'number' || !(amount > 0)) return;
    if (!this.settings.spentSince) {
      this.settings.spentSince = new Date().toISOString().slice(0, 10);
    }
    this.settings.spent = (Number(this.settings.spent) || 0) + amount;
    this.plugin.saveSettingsSoon();
  }

  /* Was bisher zusammengekommen ist, als Text. Unter einem Cent mit vier
     Stellen - sonst stünde da für die erste Übungsstunde "$0.00", und das
     wäre so falsch wie nutzlos. */
  spentSoFar() {
    const spent = Number(this.settings.spent) || 0;
    if (spent <= 0) return 'Nothing spent yet.';

    const amount = '$' + (spent < 0.01 ? spent.toFixed(4) : spent.toFixed(2));
    return this.settings.spentSince
      ? amount + ' since ' + this.settings.spentSince
      : amount;
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

    /* Direkt unter dem Schlüssel: Hier sieht man nach, wenn man an die
       Rechnung denkt. Beim Üben soll keine Zahl hochticken - das bremst. */
    const spent = new Setting(containerEl)
      .setName('Spent so far')
      .setDesc(this.spentSoFar())
      .addButton((button) =>
        button.setButtonText('Reset').onClick(async () => {
          this.settings.spent = 0;
          this.settings.spentSince = new Date().toISOString().slice(0, 10);
          await this.saveSettings();
          spent.setDesc(this.spentSoFar());
        })
      );

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
