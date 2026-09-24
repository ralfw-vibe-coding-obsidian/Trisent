"use strict";

/*
 * Der Streak - an wie vielen Tagen hintereinander gelernt wurde.
 *
 * GEMEINSAM für Reader und Translator. Es ist ein Zähler je Sprache, kein
 * Zähler je Werkzeug: Ob man den Text gelesen oder übersetzt hat, ist
 * derselbe Tag Beschäftigung mit derselben Sprache.
 *
 * Deshalb liegt er auch dort, wo die Sprache liegt - im Frontmatter von
 * language.md. Die Person kann ihn sehen und im Zweifel von Hand
 * korrigieren, wie alles andere hier auch.
 *
 * Änderungen an dieser Datei betreffen beide Werkzeuge.
 */

const { TFile } = require('obsidian');

const LANGUAGE_NOTE = 'language.md';

/* Der Kalendertag der Person, nicht der der Weltzeit - siehe
   core/calendar.js. Mit dem Datum der Weltzeit wechselte der Tag in
   Hamburg erst um 2 Uhr nachts, und wer nach Mitternacht las, überbrückte
   damit einen ausgelassenen Tag: Der Streak riss nicht ab. */
const { today, dayBefore } = require('../core/calendar.js');

class Streak {
  constructor(app) {
    this.app = app;
  }

  noteFor(language) {
    const file = language.folder.children.find(
      (child) => child instanceof TFile && child.name === LANGUAGE_NOTE
    );
    return file || null;
  }

  /* Was zu dieser Sprache gespeichert ist. */
  read(language) {
    const file = this.noteFor(language);
    if (!file) return { days: 0, best: 0, lastDay: null };

    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    return {
      days: Number(fm.streak) || 0,
      best: Number(fm.bestStreak) || 0,
      lastDay: typeof fm.lastDay === 'string' ? fm.lastDay : null
    };
  }

  /* Was davon anzuzeigen ist: ein Streak, der gestern endete, läuft noch -
     der Tag ist ja noch nicht vorbei. Ein älterer ist vorbei. */
  current(language) {
    const state = this.read(language);
    if (!state.lastDay) return 0;

    const now = today();
    if (state.lastDay === now || state.lastDay === dayBefore(now)) return state.days;
    return 0;
  }

  /* Heute wurde mit dieser Sprache gearbeitet. Mehrmals am Tag zählt
     einmal. Liefert den neuen Stand, oder null wenn sich nichts geändert
     hat - dann muss auch nichts neu gezeichnet werden. */
  async touch(language) {
    const file = this.noteFor(language);
    if (!file) return null;

    const state = this.read(language);
    const now = today();
    if (state.lastDay === now) return null;

    const days = state.lastDay === dayBefore(now) ? state.days + 1 : 1;
    const best = Math.max(state.best, days);

    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.streak = days;
      fm.bestStreak = best;
      fm.lastDay = now;
    });

    return { days: days, best: best, lastDay: now };
  }
}

module.exports = { Streak, today, dayBefore };
