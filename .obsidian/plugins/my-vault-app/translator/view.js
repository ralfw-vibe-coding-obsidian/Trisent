"use strict";

/*
 * Der Translator - dieselben Texte, aber aktiv übersetzt.
 *
 * Gehört der Learning-Seite, liegt aber in einem eigenen Verzeichnis,
 * damit daran getrennt gearbeitet werden kann.
 */

const { ItemView, TFolder, Notice, setIcon } = require('obsidian');
const { DIRECTIONS } = require('./sentences.js');
const { checkTranslation } = require('./check.js');

const VIEW_TYPE = 'trisent-translator-view';
const RIBBON_ICON = 'pen-line';

class TranslatorView extends ItemView {
  constructor(leaf, translator) {
    super(leaf);
    this.translator = translator;
    this.library = translator.library;
    this.knowledge = translator.knowledge;
    this.screen = 'languages';
    this.languageCode = null;
    this.packagePath = null;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return 'Translate';
  }

  getIcon() {
    return RIBBON_ICON;
  }

  async onOpen() {
    const last = this.translator.settings.lastLanguage;
    if (last && this.library.languageByCode(last)) {
      this.screen = 'packages';
      this.languageCode = last;
    }
    this.render();
  }

  async onClose() {
    /* nichts aufzuräumen */
  }

  get direction() {
    const stored = this.translator.settings.direction;
    return DIRECTIONS.some((d) => d.id === stored) ? stored : 'intoForeign';
  }

  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('trisent-view');

    this.barEl = root.createDiv({ cls: 'trisent-topbar is-hidden' });
    this.barInner = this.barEl.createDiv({ cls: 'trisent-page' });
    this.scrollEl = root.createDiv({ cls: 'trisent-scroll' });
    const page = this.scrollEl.createDiv({ cls: 'trisent-page' });

    const language = this.library.languageByCode(this.languageCode);

    if (this.screen === 'text' && language && this.packagePath) {
      this.renderText(page, language);
      return;
    }
    if (this.screen === 'packages' && language) {
      this.renderPackages(page, language);
      return;
    }
    this.renderLanguages(page);
  }

  useBar() {
    this.barEl.removeClass('is-hidden');
    this.barInner.empty();
    return this.barInner;
  }

  header(container, title, onBack, backLabel) {
    const head = container.createDiv({ cls: 'trisent-header' });
    if (onBack) {
      const back = head.createEl('button', { cls: 'trisent-back' });
      setIcon(back.createSpan(), 'chevron-left');
      back.createSpan({ text: backLabel });
      back.addEventListener('click', onBack);
    }
    head.createDiv({ cls: 'trisent-header-title', text: title });
    return head;
  }

  /* ---------------------------------------------------------------- */
  /* Sprache und Text wählen                                           */
  /* ---------------------------------------------------------------- */

  renderLanguages(page) {
    page.createEl('h1', { text: 'Translate' });

    const languages = this.library.languages();
    if (languages.length === 0) {
      page.createEl('p', {
        cls: 'trisent-lead',
        text: 'No languages yet. Add one in the reader first.'
      });
      return;
    }

    page.createEl('p', {
      cls: 'trisent-lead',
      text: 'Write the sentences you have been reading — in either direction.'
    });

    const grid = page.createDiv({ cls: 'trisent-language-grid' });
    for (const language of languages) {
      const card = grid.createEl('button', { cls: 'trisent-tile' });
      const top = card.createDiv({ cls: 'trisent-tile-top' });
      top.createSpan({ cls: 'trisent-flag', text: language.flag || '🏳️' });
      top.createSpan({ cls: 'trisent-tile-name', text: language.name });
      card.addEventListener('click', () => {
        this.languageCode = language.code;
        this.screen = 'packages';
        this.translator.settings.lastLanguage = language.code;
        this.translator.saveSettings();
        this.render();
      });
    }
  }

  renderPackages(page, language) {
    this.header(this.useBar(), language.flag + ' ' + language.name, () => {
      this.screen = 'languages';
      this.render();
    }, 'Languages');

    const list = page.createDiv({ cls: 'trisent-package-list' });
    list.createDiv({ cls: 'trisent-loading', text: '…' });

    this.library.loadPackages(language).then((entries) => {
      if (!this.contentEl.contains(list)) return;
      list.empty();

      if (entries.length === 0) {
        page.createEl('p', { cls: 'trisent-muted', text: 'No texts in this language yet.' });
        return;
      }

      for (const entry of entries) {
        if (!entry.ok) continue;
        this.renderPackageRow(list, language, entry);
      }
    });
  }

  renderPackageRow(list, language, entry) {
    const data = entry.data;
    const total = this.sentencesOf(data).length;
    const row = list.createEl('button', { cls: 'trisent-text-row' });

    const left = row.createDiv({ cls: 'trisent-t-left' });
    left.createDiv({ cls: 'trisent-t-title', text: data.title || entry.folder.name });
    if (data.titleTranslation) {
      left.createDiv({ cls: 'trisent-t-sub', text: data.titleTranslation });
    }

    /* Zwei Zahlen: wie viele Sätze du in welche Richtung schon konntest. */
    const right = row.createDiv({ cls: 'trisent-t-right' });
    for (const direction of DIRECTIONS) {
      const done = this.knowledge.solved(language, entry.folder, direction.id);
      const line = right.createDiv({ cls: 'trisent-score' });
      line.createSpan({ cls: 'trisent-score-value', text: done + '/' + total });
      line.createSpan({ cls: 'trisent-score-label', text: this.label(language, direction.id) });
    }

    row.addEventListener('click', () => {
      this.screen = 'text';
      this.packagePath = entry.folder.path;
      this.render();
    });
  }

  label(language, directionId) {
    return directionId === 'intoForeign' ? '→ ' + language.name : '→ yours';
  }

  sentencesOf(data) {
    const all = [];
    for (const paragraph of data.paragraphs || []) {
      for (const sentence of paragraph.sentences || []) all.push(sentence);
    }
    return all;
  }

  /* ---------------------------------------------------------------- */
  /* Übersetzen                                                        */
  /* ---------------------------------------------------------------- */

  renderText(page, language) {
    const folder = this.app.vault.getAbstractFileByPath(this.packagePath);
    if (!(folder instanceof TFolder)) {
      this.screen = 'packages';
      this.render();
      return;
    }

    const slot = page.createDiv();
    slot.createDiv({ cls: 'trisent-loading', text: '…' });

    this.library.loadPackage(folder).then((entry) => {
      if (!this.contentEl.contains(slot) || !entry || !entry.ok) return;
      page.empty();

      const data = entry.data;
      this.folder = folder;
      this.data = data;
      this.language = language;

      const bar = this.useBar();
      this.header(bar, data.title || folder.name, () => {
        this.screen = 'packages';
        this.render();
      }, language.name);
      this.renderDirectionSwitch(bar, language);

      this.known = this.knowledge.counts(language, folder)[this.direction] || {};

      const text = page.createDiv({ cls: 'trisent-write' });
      for (const sentence of this.sentencesOf(data)) {
        this.renderTask(text, sentence);
      }
    });
  }

  renderDirectionSwitch(container, language) {
    const row = container.createDiv({ cls: 'trisent-directions' });
    for (const direction of DIRECTIONS) {
      const on = direction.id === this.direction;
      const button = row.createEl('button', {
        cls: 'trisent-direction' + (on ? ' is-on' : ''),
        text: this.label(language, direction.id)
      });
      button.addEventListener('click', async () => {
        if (on) return;
        this.translator.settings.direction = direction.id;
        await this.translator.saveSettings();
        this.render();
      });
    }
  }

  /* Ein Satz: die Vorlage, ein Feld, ein Knopf - die Lösung bleibt weg,
     bis geprüft wurde. */
  renderTask(parent, sentence) {
    const intoForeign = this.direction === 'intoForeign';
    const prompt = intoForeign ? sentence.fluent : sentence.source;
    const reference = intoForeign ? sentence.source : sentence.fluent;
    if (!prompt || !reference) return;

    const block = parent.createDiv({ cls: 'trisent-task' });
    block.dataset.sentence = sentence.id || '';

    const badge = block.createDiv({ cls: 'trisent-tally' });
    this.showTally(badge, (this.known || {})[sentence.id]);

    block.createDiv({ cls: 'trisent-task-prompt', text: prompt });

    const field = block.createEl('textarea', {
      cls: 'trisent-task-input',
      attr: { rows: '2', placeholder: 'Your translation' }
    });

    const row = block.createDiv({ cls: 'trisent-task-row' });
    const check = row.createEl('button', { cls: 'trisent-check', text: 'Check' });
    const verdict = block.createDiv({ cls: 'trisent-verdict' });

    const run = async () => {
      const answer = field.value.trim();
      if (!answer) {
        field.focus();
        return;
      }

      check.setAttr('disabled', 'true');
      check.setText('Checking…');
      verdict.empty();

      try {
        const result = await checkTranslation(this.translator.settings, {
          prompt: prompt,
          reference: reference,
          answer: answer,
          fromLanguage: intoForeign ? this.data.fluentLanguage : this.data.language,
          toLanguage: intoForeign ? this.data.language : this.data.fluentLanguage,
          feedbackLanguage: this.data.glossLanguage || this.data.fluentLanguage
        });
        this.showVerdict(verdict, result, reference, sentence, badge);
      } catch (error) {
        verdict.createDiv({ cls: 'trisent-verdict-line is-bad', text: String(error.message || error) });
      }

      check.removeAttribute('disabled');
      check.setText('Check');
    };

    check.addEventListener('click', run);
    field.addEventListener('keydown', (event) => {
      /* Absatz im Feld braucht niemand - Enter prüft. */
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        run();
      }
    });
  }

  /* Wie der Satz in dieser Richtung bisher lief: Haken für richtig,
     Kreuz für daneben. Ohne Versuch steht da nichts. */
  showTally(badge, tally) {
    badge.empty();
    const correct = (tally && tally.correct) || 0;
    const wrong = ((tally && tally.tries) || 0) - correct;
    if (correct <= 0 && wrong <= 0) return;

    if (correct > 0) {
      const ok = badge.createSpan({ cls: 'trisent-tally-part is-good' });
      setIcon(ok.createSpan(), 'check');
      ok.createSpan({ text: String(correct) });
    }
    if (wrong > 0) {
      const no = badge.createSpan({ cls: 'trisent-tally-part is-bad' });
      setIcon(no.createSpan(), 'x');
      no.createSpan({ text: String(wrong) });
    }
  }

  showVerdict(verdict, result, reference, sentence, badge) {
    verdict.empty();

    /* Drei Fälle, nicht zwei: Wenn sich das Urteil nicht lesen ließ, ist
       das kein "falsch" - die Person hat nichts verkehrt gemacht. */
    const state = result.unclear ? 'is-unclear' : result.correct ? 'is-good' : 'is-bad';
    const icon = result.unclear ? 'help-circle' : result.correct ? 'check' : 'x';

    const line = verdict.createDiv({ cls: 'trisent-verdict-line ' + state });
    setIcon(line.createSpan({ cls: 'trisent-verdict-icon' }), icon);
    line.createSpan({
      text: result.unclear
        ? 'The model did not answer in the expected form. It said:'
        : result.note || (result.correct ? 'Correct.' : 'Not quite.')
    });

    if (result.unclear) {
      verdict.createDiv({ cls: 'trisent-verdict-raw', text: result.note });
    }

    for (const issue of result.issues) {
      verdict.createDiv({ cls: 'trisent-verdict-issue', text: issue });
    }

    /* Die Musterlösung erst jetzt - vorher wäre sie die Antwort. */
    const shown = verdict.createDiv({ cls: 'trisent-verdict-reference' });
    shown.createSpan({ cls: 'trisent-verdict-label', text: 'One correct version' });
    shown.createDiv({ text: reference });

    /* Ein unlesbares Urteil geht nicht auf das Konto der Person - weder
       als Erfolg noch als Fehlversuch. */
    if (result.unclear) return;

    this.knowledge
      .record(this.language, this.folder, this.data, this.direction, sentence.id, result.correct)
      .then((tally) => {
        if (!tally) return;
        this.known[sentence.id] = tally;
        this.showTally(badge, tally);
      })
      .catch((error) => new Notice('Could not save this: ' + String(error.message || error)));
  }
}

module.exports = { TranslatorView, VIEW_TYPE, RIBBON_ICON };
