"use strict";

/*
 * Ein winziger Testläufer. Kein Framework, keine Abhängigkeiten - die App
 * soll ja ohne installiertes Zeug auskommen, und das gilt auch hier.
 *
 * Diese Tests sind für die Agenten, nicht für die Person: Sie laufen nicht
 * in Obsidian, und die App braucht sie nicht zum Funktionieren. Sie prüfen
 * die Rechnungen, die man von Hand kaum nachvollziehen kann.
 *
 * Aufruf:  node tests/run.js
 */

const results = [];
const pending = [];
let current = null;

function test(name, fn) {
  current = { name: name, failures: [] };
  results.push(current);
  try {
    fn();
  } catch (error) {
    current.failures.push('threw: ' + (error && error.stack ? error.stack : error));
  }
  current = null;
}

/* Ein Test, der warten muss - etwa auf den Packer des Browsers.

   Seine Prüfungen bekommt er mitgereicht, statt sie sich aus einem
   gemeinsamen "gerade laufenden Test" zu nehmen: Zwischen zwei
   Wartepunkten kann ein anderer Test laufen, und dann landeten die
   Fehler beim falschen. */
function testAsync(name, fn) {
  const mine = { name: name, failures: [] };
  results.push(mine);
  pending.push(
    Promise.resolve()
      .then(() => fn({ is: (a, b, what) => compare(mine, a, b, what), ok: (v, what) => truth(mine, v, what) }))
      .catch((error) => {
        mine.failures.push('threw: ' + (error && error.stack ? error.stack : error));
      })
  );
}

function compare(into, actual, expected, what) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) return;
  into.failures.push((what || 'value') + '\n      expected ' + b + '\n      but got  ' + a);
}

function truth(into, value, what) {
  if (value) return;
  into.failures.push((what || 'condition') + ' was not true');
}

function is(actual, expected, what) {
  compare(current, actual, expected, what);
}

function ok(value, what) {
  truth(current, value, what);
}

function report() {
  let failed = 0;
  for (const result of results) {
    if (result.failures.length === 0) {
      console.log('  ok   ' + result.name);
      continue;
    }
    failed += 1;
    console.log('  FAIL ' + result.name);
    for (const failure of result.failures) console.log('    - ' + failure);
  }
  console.log('');
  console.log(results.length - failed + ' of ' + results.length + ' passed');
  process.exitCode = failed > 0 ? 1 : 0;
}

/* Eine Datei des Plugins laden, ohne Obsidian. Ein relatives require
   zwischen Plugin-Dateien wird aufgelöst - ein require('obsidian') nicht,
   und genau das ist der Grund, warum die Rechnungen getrennt liegen. */
const loaded = new Map();

function pluginRoot() {
  const path = require('path');
  return path.join(__dirname, '..', '.obsidian', 'plugins', 'my-vault-app');
}

function loadFile(file, label) {
  if (loaded.has(file)) return loaded.get(file).exports;

  const fs = require('fs');
  const path = require('path');
  const unit = { exports: {} };
  loaded.set(file, unit);

  new Function('module', 'exports', 'require', fs.readFileSync(file, 'utf8'))(
    unit, unit.exports,
    (name) => {
      if (name.charAt(0) === '.') {
        return loadFile(path.resolve(path.dirname(file), name), name);
      }
      throw new Error(label + ' should not require "' + name + '" - keep it free of Obsidian');
    }
  );

  return unit.exports;
}

function load(relative) {
  const path = require('path');
  return loadFile(path.join(pluginRoot(), relative), relative);
}

module.exports = { test, testAsync, is, ok, report, load };

/* Direkt aufgerufen: alle Testdateien nacheinander. */
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const files = fs.readdirSync(__dirname).filter((name) => name.endsWith('.test.js')).sort();
  for (const name of files) {
    console.log(name);
    require(path.join(__dirname, name));
    console.log('');
  }
  /* Erst berichten, wenn auch die wartenden Tests fertig sind. */
  Promise.all(pending).then(report);
}
