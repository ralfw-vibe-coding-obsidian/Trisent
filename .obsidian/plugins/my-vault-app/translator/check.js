"use strict";

/*
 * Die Übersetzung prüfen lassen - in zwei Anfragen.
 *
 * 1. Das URTEIL: bedeutungsgleich oder nicht. Ein einziges Wort als
 *    Antwort, ohne Nachdenken - das dauert um eine Sekunde. Danach dreht
 *    sich die Karte.
 * 2. Die ERKLÄRUNG: was gut war, was fehlt, welche Formen richtig wären.
 *    Läuft, während die Person schon das Original liest. Sie bekommt das
 *    Urteil als feststehend mit und erklärt es nur - so können sich die
 *    beiden nicht widersprechen.
 *
 * Wortgleiche Antworten brauchen keins von beiden; das entscheidet die
 * Ansicht selbst (practice.js, isExact).
 *
 * Gesprochen oder getippt: Wer spricht, dem gehen Akzente, Endungen
 * und Schreibung im Erkenner verloren - "habit" und "habite" klingen
 * gleich. Wer tippt, zeigt, was er schreiben kann. Deshalb zwei Regeln:
 * gesprochen zählt nur der Sinn, getippt auch die Grammatik (falsche
 * Endung, Angleichung, Artikel, Präposition). Akzente, Groß und klein
 * und Satzzeichen zählen in beiden Fällen nicht; ein bloßer Vertipper
 * auch nicht.
 *
 * Geprüft wird auf SINN, nicht auf Wortlaut. Die Musterlösung ist eine
 * richtige Antwort, nicht die richtige - eine Prüfung, die auf ihr
 * besteht, lehnt ständig Gutes ab, und dann übt niemand mehr.
 *
 * Die Modelle stehen fest und sind keine Einstellung. Ausgesucht im
 * Oktober 2026 an echten Versuchen der Person, zweimal je 13 Sätze mit
 * Grenzfällen (Tippfehler, falsche Endung, fehlende Verneinung, andere
 * Zeit, Synonym):
 *   - Urteil: qwen3.8-flash - 26 von 26, knapp eine Sekunde. Das zuvor
 *     eingestellte gemini-flash traf genauso, brauchte aber 3 bis 15
 *     Sekunden, weil es vor jeder Antwort nachdenkt - für "bedeutet das
 *     dasselbe?" bei einem Satz braucht es das nicht.
 *   - Erklärung: gpt-6-luna - nannte die Fehler genauer als qwen (das
 *     einen fehlenden Buchstaben erfand, wo einer zu viel war), in ein bis
 *     drei Sekunden.
 * Beide kosten je Satz Bruchteile eines Hundertstelcents.
 */

const { requestUrl } = require('obsidian');

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const JUDGE_MODEL = 'qwen/qwen3.8-flash';
const EXPLAIN_MODEL = 'openai/gpt-6-luna';

/* Gesprochen: nur der Sinn. */
const JUDGE_SPOKEN = [
  'You judge a language learner\'s translation of one sentence. The',
  'learner SPOKE it and speech recognition wrote it down, so spelling,',
  'endings and accents may be lost - only the meaning counts.',
  '',
  'Judge MEANING only. The reference is one correct translation, not the',
  'only one: accept other word order, synonyms that fit the situation,',
  'contractions and any phrasing a native speaker would consider equivalent.',
  '',
  'Ignore capitalisation, accents, punctuation, quotation marks and spelling',
  'slips. A misspelled word counts as the word the learner clearly meant,',
  'even if the slip happens to spell a different word ("mois" for "moi").',
  'A grammar slip that leaves the meaning intact (a wrong adjective ending,',
  'a wrong article) is not wrong either.',
  '',
  'It is wrong only if the meaning differs: something missing, added, or',
  'changed - a different tense, number, person, or a negation that changes',
  'what is said.',
  '',
  'Answer with exactly one word: correct or wrong.'
].join('\n');

/* Getippt: Sinn UND Grammatik. Ausgesucht an echten Versuchen - qwen
   traf mit dieser Fassung 20 von 20, auch "j'habit" (falsch) gegen
   "aves" für "avec" (Vertipper, richtig). */
const JUDGE_TYPED = [
  'You judge a language learner\'s translation of one sentence. The',
  'learner TYPED it, so grammar counts.',
  '',
  'It is correct only if the meaning is the same AND the grammar is right.',
  'The reference is one correct translation, not the only one: accept other',
  'word order, synonyms that fit the situation, contractions and any',
  'phrasing a native speaker would consider equivalent.',
  '',
  'Always ignore capitalisation, accents, punctuation and quotation marks.',
  'Tolerate a plain typing slip: a letter swapped, doubled or missing in a',
  'word that is otherwise clearly right and where the slip is not itself a',
  'grammar mistake ("aves" for "avec").',
  '',
  'It is wrong if the meaning differs (something missing, added, changed;',
  'another tense, number, person; a negation) OR if there is a grammar',
  'mistake: a wrong or missing verb ending ("j\'habit" for "j\'habite"),',
  'wrong agreement of adjective or participle ("elle est content"), wrong',
  'gender or number of an article, a wrong preposition.',
  '',
  'Answer with exactly one word: correct or wrong.'
].join('\n');

const EXPLAIN = [
  'A language learner translated one sentence. Whether it counts as correct',
  'has already been decided; it is given below. Do not change it - explain it.',
  '',
  'Answer in plain lines, exactly in this shape:',
  'NOTE: one or two short sentences addressed to the learner',
  'ISSUE: one concrete flaw, with the right form',
  'ISSUE: the next flaw',
  '',
  'Exactly ONE flaw per ISSUE line - never several in one line. For a',
  'grammar mistake add a few words on why ("j\'habite: with je the verb',
  'ends in -e"). Spelling slips and accents need no explanation.',
  '',
  'If it was judged correct: praise briefly and sincerely. If there are',
  'flaws, do not gloss over them - say they are worth a look.',
  'If it was judged wrong: say what is missing or changes the meaning, and',
  'keep them going ("almost there", "the hard part is right"). ISSUE lines',
  'name each problem with the right form.',
  '',
  'Say nothing about capitalisation, punctuation or quotation marks.',
  'Be warm and appreciative, never condescending, never gushing, no',
  'exclamation-mark spam. No JSON, no markdown, no code fence.'
].join('\n');

/* Sprachnamen, damit das Modell weiß, worum es geht. */
function nameOf(code) {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'language' });
    return names.of(code) || code;
  } catch (error) {
    return code;
  }
}

function describeTask(task) {
  const from = nameOf(task.fromLanguage);
  const to = nameOf(task.toLanguage);
  return [
    'Task: translate from ' + from + ' into ' + to + '.',
    from + ' sentence: ' + task.prompt,
    'Reference translation in ' + to + ': ' + task.reference,
    'The learner wrote: ' + task.answer
  ].join('\n');
}

/* Eine Anfrage an OpenRouter. Ohne Nachdenken - schaltet ein Anbieter
   das nicht ab, wird es eben ohne diesen Wunsch noch einmal versucht. */
async function ask(settings, model, system, user, maxTokens, onCost) {
  const key = (settings.openRouterKey || '').trim();
  if (!key) throw new Error('No OpenRouter key yet. Put one in the Trisent settings.');

  const send = (withoutThinking) => {
    const body = {
      model: model,
      temperature: 0,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    };
    if (withoutThinking) body.reasoning = { enabled: false };
    return requestUrl({
      url: ENDPOINT,
      method: 'POST',
      throw: false,
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://obsidian.md',
        'X-Title': 'Trisent'
      },
      body: JSON.stringify(body)
    });
  };

  let response;
  try {
    response = await send(true);
    if (response.status === 400 && /reasoning/i.test(JSON.stringify(response.json || {}))) {
      response = await send(false);
    }
  } catch (error) {
    throw new Error('Could not reach OpenRouter: ' + String(error.message || error));
  }

  if (response.status === 401) throw new Error('OpenRouter refused the key.');
  if (response.status >= 400) {
    const detail = (response.json && response.json.error && response.json.error.message) || '';
    throw new Error('OpenRouter answered ' + response.status + (detail ? ': ' + detail : ''));
  }

  const body = response.json || {};
  /* OpenRouter legt die tatsächlichen Kosten jeder Anfrage bei. */
  if (onCost && body.usage && typeof body.usage.cost === 'number') onCost(body.usage.cost);

  const text = body.choices && body.choices[0] && body.choices[0].message
    ? body.choices[0].message.content
    : '';
  if (!text) throw new Error('OpenRouter sent an empty answer.');
  return String(text);
}

/* Das Urteil: true, wenn die Bedeutung erhalten ist. */
async function judgeTranslation(settings, task, onCost) {
  const rule = task.spoken ? JUDGE_SPOKEN : JUDGE_TYPED;
  const text = await ask(settings, JUDGE_MODEL, rule, describeTask(task), 10, onCost);
  const word = text.trim().toLowerCase();
  if (/^correct\b/.test(word)) return true;
  if (/^wrong\b/.test(word)) return false;
  /* Etwas anderes als die beiden Wörter: nicht als richtig zählen, aber
     auch nicht stumm - dann steht in der Erklärung, was los war. */
  return /\bcorrect\b/.test(word) && !/\bwrong\b/.test(word);
}

/* Die Erklärung zu einem feststehenden Urteil. */
async function explainTranslation(settings, task, correct, onCost) {
  const user = describeTask(task) + '\n'
    + 'The learner ' + (task.spoken ? 'spoke it (speech recognition wrote it down)' : 'typed it') + '.\n'
    + 'Judged: ' + (correct ? 'correct' : 'wrong') + '\n'
    + 'Write NOTE and ISSUE lines in ' + nameOf(task.feedbackLanguage) + '.';
  const text = await ask(settings, EXPLAIN_MODEL, EXPLAIN, user, 400, onCost);
  return readExplanation(text);
}

/* Zeilen statt JSON, und zwar aus einem konkreten Grund: Sobald in der
   Rückmeldung Anführungszeichen vorkommen - und beim Übersetzen kommen sie
   vor -, schreiben Modelle sie ungeschützt mitten in die Zeichenkette,
   und das JSON ist kaputt. Bei Zeilen gibt es nichts zu schützen. */
function readExplanation(text) {
  const cleaned = String(text)
    .replace(/^\s*```(?:json|text)?/i, '')
    .replace(/```\s*$/, '')
    .trim();

  let note = '';
  const issues = [];
  let last = null;

  for (const raw of cleaned.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    const match = line.match(/^(NOTE|ISSUE)\s*:\s*(.*)$/i);
    if (match) {
      const field = match[1].toUpperCase();
      const value = match[2].trim();
      if (field === 'NOTE') note = value;
      else if (value) issues.push(value);
      last = field;
      continue;
    }

    /* Eine Fortsetzungszeile gehört zu dem, was davor stand. */
    if (last === 'NOTE') note = note ? note + ' ' + line : line;
    else if (last === 'ISSUE' && issues.length > 0) issues[issues.length - 1] += ' ' + line;
    else note = note ? note + ' ' + line : line;
  }

  return { note: note, issues: issues };
}

module.exports = { judgeTranslation, explainTranslation, readExplanation, JUDGE_MODEL, EXPLAIN_MODEL };
