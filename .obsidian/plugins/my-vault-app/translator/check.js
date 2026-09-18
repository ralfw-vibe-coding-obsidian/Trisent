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
  'Answer with JSON only, no code fence, in this shape:',
  '{"correct": true|false, "note": "...", "issues": ["..."]}',
  '',
  '"note" is one or two short sentences addressed to the learner: what was',
  'good, or what went wrong and why. Never just repeat the reference.',
  '"issues" lists small flaws that did not make it wrong. May be empty.'
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

/* Modelle packen JSON gern in einen Codeblock, auch wenn man es verbietet. */
function readVerdict(text) {
  const cleaned = String(text).replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();

  let data;
  try {
    data = JSON.parse(cleaned);
  } catch (error) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new Error('Could not read the answer from the model.');
    }
    data = JSON.parse(cleaned.slice(start, end + 1));
  }

  return {
    correct: data.correct === true,
    note: typeof data.note === 'string' ? data.note : '',
    issues: Array.isArray(data.issues) ? data.issues.filter((i) => typeof i === 'string') : []
  };
}

module.exports = { checkTranslation, readVerdict };
