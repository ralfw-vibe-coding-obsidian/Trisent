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

function is(actual, expected, what) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) return;
  current.failures.push((what || 'value') + '\n      expected ' + b + '\n      but got  ' + a);
}

function ok(value, what) {
  if (value) return;
  current.failures.push((what || 'condition') + ' was not true');
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

/* Eine Datei des Plugins laden, ohne Obsidian. Geht nur für Dateien, die
   nichts aus 'obsidian' brauchen - und genau das ist der Grund, warum die
   Rechnungen dort getrennt liegen. */
function load(relative) {
  const fs = require('fs');
  const path = require('path');
  const file = path.join(__dirname, '..', '.obsidian', 'plugins', 'my-vault-app', relative);
  const unit = { exports: {} };
  new Function('module', 'exports', 'require', fs.readFileSync(file, 'utf8'))(
    unit, unit.exports,
    (name) => {
      throw new Error(relative + ' should not require "' + name + '" - keep it free of Obsidian');
    }
  );
  return unit.exports;
}

module.exports = { test, is, ok, report, load };

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
  report();
}
