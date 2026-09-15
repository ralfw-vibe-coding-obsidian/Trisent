"use strict";

/*
 * Der Packager - macht aus beliebigen Texten Lernpakete.
 *
 * Noch leer. Dieses Verzeichnis gehört der anderen Sitzung; der Reader
 * fasst es nicht an.
 *
 * Was schon feststeht:
 *   - Das Paketformat steht in konzept/paketformat.md und als Code in
 *     core/package.js. Dort liegt auch validatePackage() - damit lässt
 *     sich jedes gebaute Paket prüfen, bevor es ausgeliefert wird.
 *   - Geschrieben wird über core/library.js, damit Pakete an derselben
 *     Stelle und nach denselben Regeln landen wie beim Import.
 *   - Eigene Styles gehören nach packager/packager.css. Die lädt die App
 *     beim Start von selbst.
 *   - Eigene Einstellungen stehen in data.json unter "packager".
 */

const { ItemView, Setting } = require('obsidian');
const { Library } = require('../core/library.js');

const VIEW_TYPE = 'trisent-packager-view';
const RIBBON_ICON = 'package-plus';

/* Was der Packager sich merkt. Liegt in data.json unter "packager". */
const DEFAULTS = {};

class PackagerView extends ItemView {
  constructor(leaf, packager) {
    super(leaf);
    this.packager = packager;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return 'Packager';
  }

  getIcon() {
    return RIBBON_ICON;
  }

  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass('trisent-view');

    const scroll = root.createDiv({ cls: 'trisent-scroll' });
    const page = scroll.createDiv({ cls: 'trisent-page' });

    page.createEl('h1', { text: 'Packager' });
    page.createEl('p', {
      cls: 'trisent-lead',
      text: 'This is where texts become learning packages. Nothing here yet.'
    });
  }
}

class Packager {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    /* Der eigene Bereich. Der Reader sieht ihn nie - fertige Pakete
       wandern über den Import zu ihm hinüber. */
    this.library = new Library(plugin.app, plugin, 'packager');

    plugin.registerView(VIEW_TYPE, (leaf) => new PackagerView(leaf, this));
    plugin.addCommand({
      id: 'open-packager',
      name: 'Open packager',
      callback: () => this.open()
    });
  }

  get settings() {
    return this.plugin.settings.packager;
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

  /* Was der Packager zu den Einstellungen der App beisteuert.
     Noch nichts. */
  addSettings(containerEl) {
    void containerEl;
  }
}

module.exports = { Packager, DEFAULTS, VIEW_TYPE, RIBBON_ICON };
