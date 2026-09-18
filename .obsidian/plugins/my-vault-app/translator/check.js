"use strict";

/*
 * Die Übersetzung prüfen lassen.
 *
 * Der entscheidende Punkt: Es wird auf SINN verglichen, nicht auf Wortlaut.
 * Zu jedem Satz gibt es eine Musterlösung - aber sie ist eine richtige
 * Antwort, nicht die richtige. Eine Prüfung, die auf ihr besteht, lehnt
 * ständig Gutes ab, und dann übt niemand mehr.
 *
 * Deshalb bekommt das Modell die Musterlösung ausdrücklich als Beispiel
 * und die Anweisung, gleichwertige Formulierungen gelten zu lassen.
 */

const { requestUrl } = require('obsidian');

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const SYSTEM = [
  'You judge a language learner\'s translation of a single sentence.',
  '',
  'You are given the sentence they had to translate, one correct reference',
  'translation, and what they wrote.',
  '',
  'Judge MEANING, not wording. The reference is ONE correct translation, not',
  'the only one. Accept different word order, synonyms, a different register,',
  'a contraction instead of a full form, and any other phrasing a native',
  'speaker would consider equivalent.',
  '',
  'Count it as wrong only when the meaning differs, something essential is',
  'missing, or something was added that is not in the original.',
  '',
  'Spelling slips, missing accents, and punctuation do NOT make it wrong.',
  'Mention them under "issues" instead. A wrong tense, wrong number or wrong',
  'gender that changes the meaning DOES make it wrong.',
  '',
  'Answer in plain lines, nothing else, exactly in this shape:',
  '',
  'VERDICT: correct',
  'NOTE: one or two short sentences addressed to the learner',
  'ISSUE: a small flaw that did not make it wrong',
  'ISSUE: another one',
  '',
  'VERDICT is either "correct" or "wrong". NOTE says what was good, or what',
  'went wrong and why - never just repeat the reference. ISSUE lines are',
  'optional; leave them out when there is nothing to mention.',
  '',
  'Do not use JSON, quotes around the values, markdown, or a code fence.'
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

async function checkTranslation(settings, task) {
  const key = (settings.openRouterKey || '').trim();
  if (!key) {
    throw new Error('No OpenRouter key yet. Put one in the Trisent settings.');
  }

  const from = nameOf(task.fromLanguage);
  const to = nameOf(task.toLanguage);

  const user = [
    'Task: translate from ' + from + ' into ' + to + '.',
    '',
    from + ' sentence: ' + task.prompt,
    'Reference translation in ' + to + ': ' + task.reference,
    'The learner wrote: ' + task.answer,
    '',
    'Write "note" and "issues" in ' + nameOf(task.feedbackLanguage) + '.'
  ].join('\n');

  let response;
  try {
    response = await requestUrl({
      url: ENDPOINT,
      method: 'POST',
      throw: false,
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://obsidian.md',
        'X-Title': 'Trisent'
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user }
        ]
      })
    });
  } catch (error) {
    throw new Error('Could not reach OpenRouter: ' + String(error.message || error));
  }

  if (response.status === 401) throw new Error('OpenRouter refused the key.');
  if (response.status >= 400) {
    const detail = (response.json && response.json.error && response.json.error.message) || '';
    throw new Error('OpenRouter answered ' + response.status + (detail ? ': ' + detail : ''));
  }

  const body = response.json || {};
  const text = body.choices && body.choices[0] && body.choices[0].message
    ? body.choices[0].message.content
    : '';
  if (!text) throw new Error('OpenRouter sent an empty answer.');

  return readVerdict(text);
}

/* Die Antwort lesen.

   Zeilen statt JSON, und zwar aus einem konkreten Grund: Sobald in der
   Rückmeldung Anführungszeichen vorkommen - und beim Übersetzen kommen sie
   vor, es geht ja oft genau um « » gegen " " -, schreiben Modelle sie
   ungeschützt mitten in die Zeichenkette und das JSON ist kaputt. Bei
   Zeilen gibt es nichts zu schützen.

   Schickt ein Modell trotzdem JSON, wird auch das noch gelesen. */
function readVerdict(text) {
  const cleaned = String(text)
    .replace(/^\s*```(?:json|text)?/i, '')
    .replace(/```\s*$/, '')
    .trim();

  const lines = readLines(cleaned);
  if (lines) return lines;

  const json = readJson(cleaned);
  if (json) return json;

  /* Immer noch etwas anderes? Dann wenigstens den Text zeigen, statt der
     Person eine Fehlermeldung vorzusetzen, mit der sie nichts anfangen
     kann. Als "richtig" gilt es dabei nicht. */
  return { correct: false, note: cleaned, issues: [], unclear: true };
}

function readLines(text) {
  let verdict = null;
  let note = '';
  const issues = [];
  let last = null;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    const match = line.match(/^(VERDICT|NOTE|ISSUE)\s*:\s*(.*)$/i);
    if (match) {
      const field = match[1].toUpperCase();
      const value = match[2].trim();
      if (field === 'VERDICT') verdict = /^correct\b/i.test(value);
      else if (field === 'NOTE') note = value;
      else if (value) issues.push(value);
      last = field;
      continue;
    }

    /* Eine Fortsetzungszeile gehört zu dem, was davor stand. */
    if (last === 'NOTE') note = note ? note + ' ' + line : line;
    else if (last === 'ISSUE' && issues.length > 0) {
      issues[issues.length - 1] += ' ' + line;
    }
  }

  if (verdict === null) return null;
  return { correct: verdict, note: note, issues: issues };
}

function readJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  let data;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch (error) {
    return null;
  }
  if (typeof data.correct !== 'boolean') return null;

  return {
    correct: data.correct,
    note: typeof data.note === 'string' ? data.note : '',
    issues: Array.isArray(data.issues) ? data.issues.filter((i) => typeof i === 'string') : []
  };
}

module.exports = { checkTranslation, readVerdict };
