"use strict";

/*
 * Der Reader als Modul.
 *
 * Das ist die einzige Stelle, an der main.js den Reader anfasst: anmelden,
 * öffnen, Einstellungen beisteuern. Was darunter passiert, geht nur diese
 * Sitzung etwas an.
 */

const { Setting, Notice, TFile } = require('obsidian');
const { TrisentView, VIEW_TYPE, RIBBON_ICON } = require('./view.js');
const { WordCardView, CARD_VIEW_TYPE } = require('./card.js');
const { searchPackages, lookupWord } = require('../learning/occurrences.js');

/* Alles, was der Reader sich merkt. Liegt in data.json unter "reader",
   damit der Packager daneben seinen eigenen Bereich hat. */
const DEFAULTS = {
  /* Wonach die Textliste geordnet ist. */
  sort: 'easiest',
  /* Wie ein Wort zeigt, wie gut es sitzt: 'none', 'underline', 'fill'. */
  highlight: 'underline',
  /* Abspielgeschwindigkeit: 1, 0.75 oder 0.5. */
  speed: 1,
  lastLanguage: null,
  lastPackage: null,
  reading: {},
  levels: { source: true, gloss: true, fluent: true }
};

class Reader {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    /* Bibliothek und Streak gehören der Learning-Seite, nicht dem Reader -
       der Translator arbeitet mit denselben. */
    this.library = plugin.learning.library;
    this.streak = plugin.learning.streak;
    this.deck = plugin.learning.deck;
    this.dictionary = plugin.learning.dictionary;

    plugin.registerView(VIEW_TYPE, (leaf) => new TrisentView(leaf, this));
    plugin.registerView(CARD_VIEW_TYPE, (leaf) => new WordCardView(leaf, this));

    /* Wer eine Wortnotiz öffnet, will wissen, was das Wort bedeutet -
       und das steht nicht in der Notiz, sondern im Paket. Also legt die
       App die Erklärung daneben, ohne dass man danach suchen muss. */
    plugin.registerEvent(
      plugin.app.workspace.on('file-open', (file) => this.onFileOpen(file))
    );

    plugin.addRibbonIcon(RIBBON_ICON, 'Trisent: Reading', () => this.open());
    plugin.addCommand({
      id: 'open-reader',
      name: 'Reading',
      callback: () => this.open()
    });
  }

  /* Die Einstellungen des Readers, nicht die der ganzen App. */
  get settings() {
    return this.plugin.settings.reader;
  }

  saveSettings() {
    return this.plugin.saveSettings();
  }

  saveSettingsSoon() {
    this.plugin.saveSettingsSoon();
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
      if (!(leaf.view instanceof TrisentView)) return;
      /* Der Text zeichnet sich nicht neu, während man darin liest - jedes
         angetippte Wort schreibt eine Notiz, und das würde sonst bei jedem
         Klick die Leseposition verlieren. Beim Verlassen wird ohnehin neu
         gelesen. */
      if (leaf.view.screen === 'text') return;
      leaf.view.render();
    });
  }

  /* ---------------------------------------------------------------- */
  /* Die Wortkarte                                                     */
  /* ---------------------------------------------------------------- */

  async showCard(card) {
    const workspace = this.app.workspace;

    let leaf = workspace.getLeavesOfType(CARD_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: CARD_VIEW_TYPE, active: true });
    }

    await workspace.revealLeaf(leaf);
    if (leaf.view instanceof WordCardView) leaf.view.show(card);
  }

  /* Nachgereichte Fundstellen in die offene Karte nachtragen, ohne sie
     erneut in den Vordergrund zu holen. */
  updateCard(card) {
    const leaf = this.app.workspace.getLeavesOfType(CARD_VIEW_TYPE)[0];
    if (!leaf || !(leaf.view instanceof WordCardView)) return;
    if (!leaf.view.card || leaf.view.card.key !== card.key) return;
    leaf.view.show(card);
  }

  /* Zu einer Fundstelle in einem anderen Text springen. */
  goTo(languageCode, path, sentenceId) {
    const view = this.mainView();
    if (!view) return;
    view.goTo(languageCode, path, sentenceId);
  }

  /* Von woanders her zu einer Stelle springen - der Reader muss dafür
     nicht offen sein. Wird von der Lernkartei gerufen. */
  async showSentence(languageCode, path, sentenceId, key) {
    await this.open();
    const view = this.mainView();
    if (!view) return false;
    view.goTo(languageCode, path, sentenceId, key);
    return true;
  }

  mainView() {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    return leaf && leaf.view instanceof TrisentView ? leaf.view : null;
  }

  /* Von der Wortkarte aus zu einer Wendung springen, in der das Wort steckt. */
  openCardFor(key) {
    const reader = this.readerView();
    if (reader) reader.openCard(key, null);
  }

  /* Ein Stand, der auf der Karte gesetzt wird, muss sofort auch im Text
     ankommen - und umgekehrt. */
  setStatusEverywhere(key, status, entry) {
    const reader = this.readerView();
    if (reader) {
      reader.setStatus(key, status, entry);
      return;
    }

    /* Kein Text offen - dann wird der Stand eben nur geschrieben. Die
       Karte kann auch aus einer Wortnotiz heraus offen sein, und dort
       ist das Weiterschalten genauso sinnvoll. */
    const card = this.cardView();
    const language = card && card.card ? card.card.language : null;
    if (!language) return;

    this.library.setWordStatus(language, key, status, entry).catch((error) => {
      new Notice('Could not save this word: ' + String(error.message || error));
    });
  }

  cardView() {
    const leaf = this.app.workspace.getLeavesOfType(CARD_VIEW_TYPE)[0];
    return leaf && leaf.view instanceof WordCardView ? leaf.view : null;
  }

  /* ---------------------------------------------------------------- */
  /* Die Wortkarte ohne offenen Text                                   */
  /* ---------------------------------------------------------------- */

  /* Eine Wortnotiz wurde geöffnet: Steht ein Trisent-Wort darin, kommt
     seine Erklärung in die Seitenleiste. */
  onFileOpen(file) {
    if (!(file instanceof TFile) || file.extension !== 'md') return;

    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm || fm.type !== 'word' || !fm.key || !fm.language) return;

    const language = this.library.languageByCode(String(fm.language));
    if (!language) return;

    this.showWord(language, String(fm.key), file).catch((error) => {
      console.error('Trisent: could not show this word', error);
    });
  }

  /* Die Wortkarte zu einem Schlüssel, ohne dass ein Text offen sein
     muss. Alles, was sie zeigt, wird aus den Paketen zusammengesucht -
     die Notiz selbst weiß ja nur, wie weit die Person ist. */
  async showWord(language, key, file) {
    const entry = (await this.dictionary.lookup(language, key)) || {};
    const status = this.library.wordStatusMap(language).get(key) || 'unknown';

    const card = {
      key: key,
      language: language,
      entry: entry,
      lemma: entry.lemma || key.split(':')[1] || key,
      partOfSpeech: entry.partOfSpeech || key.split(':')[2] || '',
      gloss: entry.gloss || '',
      grammar: entry.grammar || '',
      forms: Array.isArray(entry.forms) ? entry.forms : [],
      surface: '',
      status: status,
      phrases: [],
      occurrences: [],
      searching: true,
      file: file || this.library.wordFileFor(language, key)
    };

    await this.showCard(card);

    card.occurrences = await searchPackages(this.library, language, key, {});
    card.searching = false;
    this.updateCard(card);
  }

  readerView() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof TrisentView && leaf.view.screen === 'text') return leaf.view;
    }
    return null;
  }

  /* Ein Wort in die Lernkartei legen. Mehrfach drücken schadet nicht -
     die Kartei legt nichts doppelt an. */
  async addToDeck(card) {
    /* Ein Wort, das in die Kartei wandert, bekommt seine Wortnotiz -
       sonst kann die Karte nicht darauf verweisen. Angelegt wird sie mit
       dem Stand, den das Wort ohnehin hat; sichtbar ändert sich also
       nichts, es steht nur fest, wo es steht. */
    if (!card.file) {
      try {
        card.file = await this.library.setWordStatus(
          card.language, card.key, card.status, card.entry
        );
      } catch (error) {
        card.file = null;
      }
    }

    let entry;
    try {
      entry = await this.deck.add(card.language, {
        key: card.key,
        front: card.lemma,
        back: card.gloss,
        note: card.file
      });
    } catch (error) {
      new Notice('Could not add this card: ' + String(error.message || error));
      return null;
    }
    const view = this.readerView();
    if (view) view.markDeck(card.key);
    return entry;
  }

  /* Eine Karte ist aus der Kartei verschwunden - die Ecke am Wort auch.
     Wird von der Lernkartei gerufen; der Text muss dafür nicht offen
     sein. */
  forgetCard(key) {
    const view = this.readerView();
    if (view) view.unmarkDeck(key);
  }

  /* Die Wortnotiz öffnen. Gibt es sie noch nicht, entsteht sie jetzt -
     der Stand bleibt dabei, wie er ist. */
  async openWordNote(card) {
    let file = card.file;
    if (!file) {
      try {
        file = await this.library.setWordStatus(
          card.language, card.key, card.status, card.entry
        );
      } catch (error) {
        new Notice('Could not create the note: ' + String(error.message || error));
        return;
      }
      card.file = file;
      /* Die Karte neu zeichnen: Aus "Create" wird "Open" - sonst stünde
         dort weiter ein Knopf, der etwas anlegen will, das es nun gibt. */
      this.updateCard(card);
    }
    if (!file) return;

    /* Liegt die Notiz schon in einem Reiter, wird der geholt - sonst
       sammeln sich bei jedem Klick neue an. */
    const open = this.app.workspace
      .getLeavesOfType('markdown')
      .find((leaf) => leaf.view && leaf.view.file === file);

    if (open) {
      this.app.workspace.revealLeaf(open);
      return;
    }
    await this.app.workspace.getLeaf('tab').openFile(file);
  }

  /* Was der Reader zu den Einstellungen der App beisteuert. */
  addSettings(containerEl) {
    new Setting(containerEl)
      .setName('Word marking')
      .setDesc('How a word shows what you know about it while reading.')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('none', 'None')
          .addOption('underline', 'Underlined')
          .addOption('fill', 'Filled')
          .setValue(this.settings.highlight || 'underline')
          .onChange(async (value) => {
            this.settings.highlight = value;
            await this.saveSettings();
            this.refresh();
          })
      );
  }
}

module.exports = { Reader, DEFAULTS, VIEW_TYPE, CARD_VIEW_TYPE, RIBBON_ICON };
