#!/usr/bin/env node
'use strict';
/**
 * env-saaf CLI
 *   env-saaf check [dir] [--file name] [--schema file] [--values file] [--json] [--json-schema] [--watch] — scan code for process.env usage, compare with
 *                           .env.example (or the --file given); exit 1 if anything
 *                           used is not documented. --schema also validates the values
 *                           of the real .env file against the schema the file exports
 *                           (issue #90); --json emits machine-readable output. --json-schema
 *                           prints the schema file as a draft 2020-12 JSON Schema
 *                           document instead of running the check (issue #268). A scaffold
 *                           with no code usage yet passes with a single note instead of
 *                           one UNUSED line per key (issue #170).
 *   env-saaf scan  [dir | --stdin] [--file name] [--json] [--watch]: just list the env vars your code uses; keys in
 *                           .env.example (or the --file given) that no code reads are reported
 *                           as UNUSED warnings (stderr; `unused` in --json), never an exit code
 *   env-saaf print [dir] [--schema file] [--file name] [--json] — load and validate the env file, then print the coerced values with sensitive rules masked
 *   env-saaf example [dir] [--write[=file]] [--force] [--schema file] — print a .env.example draft from code
 *                           usage (v1.0.0); --write saves it to .env.example (or the file
 *                           named) instead, refusing to overwrite unless --force is given
 *   env-saaf init  [dir] [--schema file] [--force] — write a starter env.schema.js
 *                           (commented examples of the main types) and a matching
 *                           .env.example generated from it; refuses to overwrite
 *                           either file unless --force is passed (issue #60). Keys
 *                           the code already reads are folded into the scaffold as
 *                           string entries and listed on stdout (issue #171). In a
 *                           "type": "module" project the starter is env.schema.cjs
 *                           instead, so it still loads with require() (issue #184)
 *   env-saaf init  [dir] --from-example[=file] [--schema file] [--force] [--groups] — like the
 *                           above, but the starter schema is inferred from an
 *                           existing example file (default .env.example): each key's
 *                           sample value picks the rule type (port-looking number ->
 *                           port, true/false -> boolean, http(s) URL -> url, email ->
 *                           email, integer -> int, decimal -> number, else string),
 *                           every inferred rule is commented as inferred, and the
 *                           example file itself is left untouched (issue #232).
 *                           With --groups, keys sharing a common prefix (e.g. DB_HOST,
 *                           DB_PORT) are folded into a grouped schema (issue #263)
 */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { types: { isModuleNamespaceObject } } = require('node:util');
const { scanCode, scanCodeLocations, scanDir, scanDirLocations, parseEnvFile, diffEnv, validateEnv, EnvSaafError, generateExample, toJsonSchema, maskValue } = require('./index');

const argv = process.argv.slice(2);
// --version / -v is global: report the installed version wherever it appears, before anything else runs
if (argv.includes('--version') || argv.includes('-v')) {
  console.log(`env-saaf ${require('./package.json').version}`);
  process.exit(0);
}
// Output is already plain in every mode, including when NO_COLOR is set.
while (argv[0] === '--no-color') argv.shift();
const cmd = argv[0];
const USAGE = 'Usage: env-saaf check [dir] [--file name] [--schema file] [--values file] [--exclude pattern] [--json] [--json-schema] [--watch] | env-saaf scan [dir | --stdin] [--file name] [--exclude pattern] [--json] [--watch] | env-saaf print [dir] [--schema file] [--file name] [--json] | env-saaf example [dir] [--write[=file]] [--force] [--schema file] | env-saaf init [dir] [--schema file] [--force] [--from-example[=file]]\n'
  + 'Global options: --no-color, --version / -v (before or after the command).';
// --help / -h / help: print usage and exit 0 (asking for help is not an error — this used to exit 2)
if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
  console.log(USAGE);
  process.exit(0);
}
// --file <name> or --file=<name> ('check' and 'scan'): which template file to compare against
// --schema <file> or --schema=<file> ('check' only): validate the env values against the
// schema the file exports (issue #90). Opt-in: without it the check is presence-only.
// --json: machine-readable output for check and scan
// --json-schema ('check' only): print the --schema file as a draft 2020-12
// JSON Schema document to stdout instead of running the check (issue #268).
// Without --schema there is nothing to convert, so the flag errors out.
// --write / --write=<file> ('example' only): save the draft to .env.example (or the file
// named) instead of printing it; --force allows overwriting an existing file
// --watch ('check' and 'scan' only): run once, then re-run (debounced) whenever the scanned
// tree, the env template or the schema file changes (issue #230)
let fileOpt = '.env.example';
let fileExplicit = false;
let schemaOpt = null;
let jsonMode = false;
let jsonSchemaOpt = false;
let writeOpt = null;
let forceOpt = false;
// Issue #230: --watch ('check' and 'scan' only) re-runs the command when watched inputs change.
let watchOpt = false;
let stdinOpt = false;
// Issue #352: check --schema --values validates another file's values.
let valuesOpt = null;
// Issue #355: repeatable --exclude patterns for scan and check.
const excludeOpts = [];

// Issue #230: in watch mode an error exit must not kill the watcher — fatalExit
// throws WatchExit instead, so watchLoop's runOnce can log the exit code and
// keep watching. Outside watch mode fatalExit is exactly process.exit.
let watchActive = false;
class WatchExit extends Error {
  constructor(code) { super(`exit ${code}`); this.code = code; }
}
function fatalExit(code) {
  if (watchActive) throw new WatchExit(code);
  process.exit(code);
}
let fromExampleOpt = null; // null = off; true = bare flag; string = --from-example=file
let groupsOpt = false;
// Issue #278: tokens starting with `--` that match no known flag, and
// value-taking flags left without a value, are collected here and rejected
// after parsing — they used to fall into `positional` and vanish silently.
const unknownFlags = [];
const valuelessFlags = [];
const positional = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  // --help / -h anywhere after the command: asking for help is never a directory
  if (a === '--help' || a === '-h') {
    console.log(USAGE);
    process.exit(0);
  }
  if (a === '--file' && argv[i + 1]) { fileOpt = argv[++i]; fileExplicit = true; }
  else if (a.startsWith('--file=')) { fileOpt = a.slice('--file='.length); fileExplicit = true; }
  else if (a === '--schema' && argv[i + 1]) schemaOpt = argv[++i];
  else if (a.startsWith('--schema=')) schemaOpt = a.slice('--schema='.length);
  else if (a === '--values' && argv[i + 1]) valuesOpt = argv[++i];
  else if (a.startsWith('--values=')) valuesOpt = a.slice('--values='.length);
  else if (a === '--exclude' && argv[i + 1]) excludeOpts.push(argv[++i]);
  else if (a.startsWith('--exclude=')) excludeOpts.push(a.slice('--exclude='.length));
  else if (a === '--json') jsonMode = true;
  else if (a === '--json-schema') jsonSchemaOpt = true;
  else if (a === '--write') writeOpt = '.env.example';
  else if (a.startsWith('--write=')) writeOpt = a.slice('--write='.length) || '.env.example';
  else if (a === '--force') forceOpt = true;
  else if (a === '--watch') watchOpt = true;
  else if (a === '--stdin') stdinOpt = true;
  else if (a === '--from-example') fromExampleOpt = true;
  else if (a.startsWith('--from-example=')) fromExampleOpt = a.slice('--from-example='.length) || '.env.example';
  else if (a === '--groups') groupsOpt = true;
  else if (a === '--no-color') { /* global flag, allowed on every command */ }
  else if (a === '--file' || a === '--schema' || a === '--values' || a === '--exclude') valuelessFlags.push(a);
  else if (a.startsWith('--')) unknownFlags.push(a);
  else positional.push(a);
}
let dir = positional[0] || process.cwd();
// Issue #354: project config — the CLI reads defaults from the `env-saaf` key
// in the project's package.json, so `check` / `scan` / `print` / `example` /
// `init` do not repeat the same --schema / --file on every invocation.
// Precedence: an explicit flag (or directory argument) always wins over the
// config; the config wins over the built-in defaults. Config paths are
// resolved relative to the directory the command runs on, exactly like the
// flags are. Unknown keys are a usage error (exit 2), like the library's
// unknown-option errors, so a typo'd key cannot silently do nothing. A
// missing package.json simply means "no config"; a malformed one is an
// error, because a config the user meant to apply must not be skipped.
const CONFIG_KEYS = ['schema', 'file', 'dir'];
if (['check', 'scan', 'print', 'example', 'init'].includes(cmd)) {
  const configDir = positional[0] || process.cwd();
  const pkgPath = path.join(configDir, 'package.json');
  let pkg = null;
  // existsSync first: a missing package.json means "no config", and a
  // directory argument that is actually a file (scan accepts one — issue
  // #418) has no package.json to read either.
  if (fs.existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch (e) {
      // A malformed package.json is an error: a config the user meant to
      // apply must not be silently skipped. A file that vanished between the
      // check and the read is treated as no config; any other read failure
      // names the directory.
      if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') {
        const message = `env-saaf: cannot read project config in ${configDir}: ${e.message}`;
        if (jsonMode) console.log(JSON.stringify({ ok: false, error: message }));
        else console.error(message);
        process.exit(2);
      }
    }
  }
  const config = pkg && pkg['env-saaf'];
  if (config !== undefined && config !== null) {
    let configError = null;
    if (typeof config !== 'object' || Array.isArray(config)) {
      configError = 'the "env-saaf" key in package.json must be an object, e.g. { "schema": "config/env.schema.js" }';
    } else {
      const unknown = Object.keys(config).filter(k => !CONFIG_KEYS.includes(k));
      if (unknown.length) {
        configError = `unknown key${unknown.length === 1 ? '' : 's'} in the "env-saaf" config of package.json: ${unknown.join(', ')} (supported: ${CONFIG_KEYS.join(', ')})`;
      } else {
        const bad = Object.entries(config).find(([, v]) => typeof v !== 'string' || v === '');
        if (bad) configError = `the "env-saaf.${bad[0]}" value in package.json must be a non-empty string`;
      }
    }
    if (configError) {
      const message = `env-saaf: ${configError}`;
      if (jsonMode) console.log(JSON.stringify({ ok: false, error: message }));
      else console.error(message);
      process.exit(2);
    }
    if (positional[0] === undefined && config.dir !== undefined) dir = path.resolve(configDir, config.dir);
    if (schemaOpt === null && config.schema !== undefined) schemaOpt = config.schema;
    if (!fileExplicit && config.file !== undefined) { fileOpt = config.file; fileExplicit = true; }
  }
}
// Issue #232: with a bare `--from-example`, a second positional names the
// example file instead of being mistaken for the directory.
let exampleOpt = null;
if (fromExampleOpt !== null) {
  if (fromExampleOpt === true) exampleOpt = positional[1] || '.env.example';
  else exampleOpt = fromExampleOpt;
}

// Issue #278: flags are per-command. A flag the parser recognised but the
// command does not support — or one it does not recognise at all — used to
// be silently ignored, so `scan --json-schema` ran a plain scan and a typo
// like `--jsoon` in CI produced text output where JSON was expected. Fail
// fast with exit 2, in the same message shape as other usage errors.
const COMMAND_FLAGS = {
  check: ['--file', '--schema', '--values', '--exclude', '--json', '--json-schema', '--watch'],
  scan: ['--file', '--exclude', '--json', '--watch', '--stdin'],
  print: ['--schema', '--file', '--json'],
  example: ['--write', '--force', '--schema'],
  init: ['--schema', '--force', '--from-example', '--groups'],
};
if (COMMAND_FLAGS[cmd]) {
  const seenFlags = new Set();
  if (fileExplicit) seenFlags.add('--file');
  if (schemaOpt !== null) seenFlags.add('--schema');
  if (jsonMode) seenFlags.add('--json');
  if (jsonSchemaOpt) seenFlags.add('--json-schema');
  if (writeOpt !== null) seenFlags.add('--write');
  if (forceOpt) seenFlags.add('--force');
  if (watchOpt) seenFlags.add('--watch');
  if (stdinOpt) seenFlags.add('--stdin');
  if (valuesOpt !== null) seenFlags.add('--values');
  if (excludeOpts.length) seenFlags.add('--exclude');
  if (fromExampleOpt !== null) seenFlags.add('--from-example');
  if (groupsOpt) seenFlags.add('--groups');
  let flagError = null;
  if (valuelessFlags.length) flagError = `${valuelessFlags[0]} needs a value`;
  else if (unknownFlags.length) flagError = `unknown flag ${unknownFlags[0]} for ${cmd}`;
  else {
    const bad = [...seenFlags].find(f => !COMMAND_FLAGS[cmd].includes(f));
    if (bad) flagError = `flag ${bad} is not supported for ${cmd}`;
    else if (stdinOpt && positional.length > 0) flagError = '--stdin cannot be combined with a directory argument';
    else if (stdinOpt && watchOpt) flagError = '--stdin cannot be combined with --watch';
    else if (valuesOpt !== null && !schemaOpt) flagError = '--values needs --schema <file>';
  }
  if (flagError) {
    const message = `env-saaf: ${flagError}`;
    if (jsonMode) console.log(JSON.stringify({ ok: false, error: message }));
    else console.error(message);
    process.exit(2);
  }
}

// Issue #60: the scaffold `init` writes. Commented examples of the main types
// so a new user sees what is available at a glance; the .env.example that
// accompanies it is generated from this same object, so the two cannot drift.
// Issue #171: `scannedKeys` are keys the project's code already reads (the
// same scan `check`/`example` use). They are folded into the scaffold as
// string rules under a comment saying where they came from, so the generated
// .env.example covers them and the first `check` after `init` reports no
// MISSING lines to merge by hand.
const starterSchema = (validationHint, scannedKeys = []) => {
  const scanned = scannedKeys.length
    ? `\n  // Found by scanning this project's code (process.env reads) — typed as\n  // string for now; tighten the type, or delete, as needed.\n`
      + scannedKeys.map(k => `  ${k}: { type: 'string' },\n`).join('')
    : '';
  return `// Starter schema generated by env-saaf init — edit freely.
// ${validationHint}
module.exports = {
  // free-form text
  APP_NAME: { type: 'string', required: true },
  // whole numbers, coerced from the string in .env
  RETRIES: { type: 'int', default: 3 },
  // true/false (also yes/no, on/off, 1/0)
  DEBUG: { type: 'boolean', default: false },
  // TCP port 0-65535
  PORT: { type: 'port', default: 3000 },
  // full URL with a scheme
  API_URL: { type: 'url', required: true },
  // email address
  SUPPORT_EMAIL: { type: 'email' },
  // human duration parsed to milliseconds ('500ms', '30s', '15m', '2h')
  SHUTDOWN_TIMEOUT: { type: 'duration', default: '15m' },
  // hostname or IP address, no scheme or port
  DB_HOST: { type: 'host', default: 'localhost' },
${scanned}};
`;
};

// Issue #171: the keys the fixed part of the scaffold always declares. Scanned
// keys matching any of these are skipped, so code reading PORT (say) does not
// produce a duplicate entry in the generated schema. The test pinning a fresh
// scaffold to exactly these keys keeps this list from drifting off the template.
const starterKeys = ['APP_NAME', 'RETRIES', 'DEBUG', 'PORT', 'API_URL', 'SUPPORT_EMAIL', 'SHUTDOWN_TIMEOUT', 'DB_HOST'];

// Issue #232: infer a starter rule type from a sample value found in an
// existing example file. Priority order (first match wins): a port-looking
// number -> 'port', true/false -> 'boolean', an http(s) URL -> 'url', an
// email -> 'email', then the unambiguous shapes uuid/date/duration/semver/
// json/hex (issue #356), an integer -> 'int', a decimal -> 'number', anything
// else -> 'string' (including empty values). "Port-looking" means a whole
// number in 1024-65535 — the range app servers actually listen on; smaller
// whole numbers are more often counts or flags, so they infer as 'int'.
function inferTypeFromSample(sample) {
  const v = String(sample).trim();
  if (v === '') return 'string';
  // Issue #356: shapes that are unambiguous once seen. Each candidate is
  // confirmed with the real validator, so an inferred rule always accepts the
  // sample it came from (an impossible date or a padded UUID stays 'string').
  const accepts = (type) => {
    try {
      validateEnv({ SAMPLE: { type } }, { SAMPLE: v });
      return true;
    } catch {
      return false;
    }
  };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) && accepts('uuid')) return 'uuid';
  if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(v) && accepts('date')) return 'date';
  if (/^(?:\d+(?:\.\d+)?(?:ms|s|m|h|d|w))+$/i.test(v) && accepts('duration')) return 'duration';
  if (/^v?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(v) && accepts('semver')) return 'semver';
  if ((v.startsWith('{') || v.startsWith('[')) && accepts('json')) return 'json';
  // Even-length hex of at least four bytes: 'deadbeef', not 'cafe' or 'face'.
  if (/^(?:[0-9a-fA-F]{2}){4,}$/.test(v) && accepts('hex')) return 'hex';
  if (/^-?\d+$/.test(v)) {
    const n = Number(v);
    return n >= 1024 && n <= 65535 ? 'port' : 'int';
  }
  if (/^(true|false)$/i.test(v)) return 'boolean';
  if (/^https?:\/\//i.test(v)) {
    // Match the 'url' validator: new URL() must parse the value and the scheme
    // must be http(s) — 'http://host:abc' has an invalid port, check rejects it,
    // so it must not infer as 'url' (falls through to 'string').
    try {
      const parsed = new URL(v);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return 'url';
    } catch { /* not a parseable URL — fall through */ }
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    // Match the 'email' validator: the domain must not start or end with a
    // dot — 'a@.b.com' fails check ("domain may not start with a dot"), so it
    // must not infer as 'email' (falls through to 'string').
    const domain = v.slice(v.indexOf('@') + 1);
    if (!domain.startsWith('.') && !domain.endsWith('.')) return 'email';
  }
  if (Number.isFinite(Number(v))) return 'number';
  return 'string';
}

// Issue #232: build the starter schema text from parsed example entries
// ([[key, sample], ...]). Every inferred rule carries a comment saying it was
// inferred and should be reviewed — the sample value itself is deliberately
// NOT echoed into the comment, so a password in .env.example cannot leak into
// the committed schema. Keys the code scan already found are folded in as
// string rules (same as the fixed scaffold does) unless the example already
// lists them, so nothing is duplicated.
// Issue #263: with --groups, keys sharing a common prefix (at least two
// characters before the first '_', shared by at least two keys) fold into
// a grouped schema (prefix: 'PREFIX_') keeping the same per-key type inference.
function schemaFromExample(hint, exampleName, entries, scannedKeys = [], groups = false) {
  const jsKey = k => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k));
  const seen = new Set(entries.map(([k]) => k));
  let inferred;
  if (!groups) {
    inferred = entries.map(([k, sample]) => {
      const type = inferTypeFromSample(sample);
      return `  // inferred as '${type}' from the sample value in ${exampleName} — review this rule\n  ${jsKey(k)}: { type: '${type}' },`;
    });
  } else {
    const groupCounts = new Map();
    for (const [k] of entries) {
      const idx = k.indexOf('_');
      if (idx >= 2) {
        const group = k.slice(0, idx);
        const innerKey = k.slice(idx + 1);
        if (innerKey.length > 0 && !seen.has(group)) {
          groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
        }
      }
    }
    inferred = [];
    const emittedGroups = new Set();
    for (const [k, sample] of entries) {
      const idx = k.indexOf('_');
      const group = idx >= 2 ? k.slice(0, idx) : null;
      const isGrouped = group !== null && (groupCounts.get(group) || 0) >= 2;
      if (!isGrouped) {
        const type = inferTypeFromSample(sample);
        inferred.push(`  // inferred as '${type}' from the sample value in ${exampleName} — review this rule\n  ${jsKey(k)}: { type: '${type}' },`);
      } else if (!emittedGroups.has(group)) {
        emittedGroups.add(group);
        const prefix = group + '_';
        const groupEntries = entries.filter(([key]) => key.startsWith(prefix) && key.length > prefix.length);
        const innerRules = groupEntries.map(([key, s]) => {
          const innerKey = key.slice(prefix.length);
          const type = inferTypeFromSample(s);
          return `      // inferred as '${type}' from the sample value in ${exampleName} — review this rule\n      ${jsKey(innerKey)}: { type: '${type}' },`;
        });
        inferred.push(`  ${jsKey(group)}: {\n    prefix: '${prefix}',\n    schema: {\n${innerRules.join('\n')}\n    },\n  },`);
      }
    }
  }
  const extra = scannedKeys.filter(k => !seen.has(k));
  const scanned = extra.length
    ? `\n  // Found by scanning this project's code (process.env reads) — not in ${exampleName};\n  // typed as string for now; tighten the type, or delete, as needed.\n`
      + extra.map(k => `  ${jsKey(k)}: { type: 'string' },\n`).join('')
    : '';
  return `// Starter schema inferred by env-saaf init --from-example from ${exampleName} — review every rule.\n// ${hint}\nmodule.exports = {\n${inferred.join('\n')}\n${scanned}};\n`;
}

// Issue #133: validate the directory argument before any command uses it.
// scanDir's readdirSync otherwise throws a raw Node stack trace for a file
// path or a missing directory. Report a clear message and exit 2 instead.
if (cmd === 'scan' || cmd === 'check' || cmd === 'example' || cmd === 'init' || cmd === 'print') {
  const invalidDir = !fs.existsSync(dir)
    ? `${dir} does not exist`
    : !fs.statSync(dir).isDirectory() ? `${dir} is not a directory` : null;
  if (invalidDir) {
    const message = `env-saaf: ${invalidDir}`;
    if (jsonMode) {
      console.log(JSON.stringify({ ok: false, error: message }));
    } else {
      console.error(message);
    }
    process.exit(2);
  }
}

// Issue #358: the env names a schema declares, groups flattened to DB_HOST.
function flattenedSchemaKeys(schema, prefix = '') {
  const keys = [];
  for (const [key, rule] of Object.entries(schema)) {
    if (rule && typeof rule === 'object' && rule.schema && typeof rule.prefix === 'string') {
      keys.push(...flattenedSchemaKeys(rule.schema, prefix + rule.prefix));
    } else {
      keys.push(prefix + key);
    }
  }
  return keys;
}

function readEnvFile(filePath) {
  const input = fs.readFileSync(filePath, 'utf8');
  try {
    return parseEnvFile(input);
  } catch (error) {
    // Issue #160: parseEnvFile's own errors already carry the `env-saaf: `
    // prefix (e.g. the duplicate-key error), so strip it before wrapping —
    // otherwise the CLI prints the prefix twice, in text and --json output.
    const detail = error.message.replace(/^env-saaf: /, '');
    const message = `${path.relative(dir, filePath)}: ${detail}`;
    if (jsonMode) console.log(JSON.stringify({ ok: false, error: message }));
    else console.error(`env-saaf: ${message}`);
    fatalExit(2);
  }
}


// Issue #416: catch credentials copied into the committed template. These
// checks intentionally report keys and reason codes only; template values
// must never be echoed to text output or the --json result.
const PLACEHOLDER_VALUE_RE = /^(?:<[^>]+>|x{3,}|xxx+|your(?:[-_ ]|$)|replace(?:[-_ ]|$)|change(?:[-_ ]|$)|changeme$|example(?:[-_ ]|$)|placeholder(?:[-_ ]|$)|dummy(?:[-_ ]|$)|todo$|redacted$|none$|null$|undefined$)/i;

function isPlaceholderValue(value) {
  return PLACEHOLDER_VALUE_RE.test(value)
    || /^(?:pass|password|passwd|secret|changeme|change-me|example|placeholder|redacted|xxx+)$/i.test(value);
}

function stringEntropy(value) {
  const counts = new Map();
  for (const char of value) counts.set(char, (counts.get(char) || 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function detectExampleSecrets(values) {
  const findings = [];
  for (const [key, raw] of Object.entries(values)) {
    if (typeof raw !== 'string') continue;
    const value = raw.trim();
    if (!value || isPlaceholderValue(value)) continue;

    let reason;
    if (/^sk-[A-Za-z0-9_-]{16,}$/.test(value) && !isPlaceholderValue(value.slice(3))) {
      reason = 'provider key';
    } else if (/^AKIA[0-9A-Z]{16}$/.test(value)) {
      reason = 'AWS access key';
    } else {
      const databaseUrl = /^postgres(?:ql)?:\/\/[^\s/:@]+:([^\s/@]+)@/i.exec(value);
      if (databaseUrl && !isPlaceholderValue(databaseUrl[1])) {
        reason = 'database URL with password';
      }
    }
    if (!reason && /^[A-Fa-f0-9]{40}$/.test(value)) {
      reason = '40-character hex token';
    } else if (!reason && value.length >= 32 && stringEntropy(value) >= 3.8) {
      reason = 'high-entropy string';
    }
    /*
    */

    if (reason) findings.push({ key, reason, value: '[REDACTED]' });
  }
  return findings;
}

// Issue #184: would Node treat this schema file as an ES module? A .js file
// is ESM when the nearest package.json above it says "type": "module"
// (a .mjs file always is, a .cjs file never is). A schema Node treats as ESM
// cannot be loaded with require() — the generated `module.exports` starter
// throws `ReferenceError: module is not defined` — so callers check this
// before writing or loading anything.
function schemaIsEsm(schemaPath) {
  const ext = path.extname(schemaPath);
  if (ext === '.mjs') return true;
  if (ext === '.cjs') return false;
  // Callers pass an already-resolved path; resolve it again would break
  // callers that stub path.resolve (see the #169 Windows-path test).
  let d = path.dirname(schemaPath);
  for (;;) {
    const pkgPath = path.join(d, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).type === 'module';
      } catch {
        return false;
      }
    }
    const parent = path.dirname(d);
    if (parent === d) return false;
    d = parent;
  }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

// Issue #353: print the effective configuration, masking sensitive rules.
function maskBySchema(schema, values) {
  const out = Array.isArray(values) ? [...values] : { ...values };
  for (const [key, rule] of Object.entries(schema)) {
    if (!Object.prototype.hasOwnProperty.call(out, key)) continue;
    if (rule && typeof rule === 'object' && rule.schema && typeof rule.prefix === 'string') {
      out[key] = maskBySchema(rule.schema, out[key]);
    } else if (rule && rule.sensitive === true) {
      out[key] = typeof out[key] === 'string' ? maskValue(out[key]) : '[REDACTED]';
    }
  }
  return out;
}

function printEffective(schema, values, prefix = '', lines = []) {
  for (const [key, rule] of Object.entries(schema)) {
    if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
    if (rule && typeof rule === 'object' && rule.schema && typeof rule.prefix === 'string') {
      printEffective(rule.schema, values[key], prefix + rule.prefix, lines);
    } else {
      const value = values[key];
      const shown = value instanceof Date ? value.toISOString()
        : value !== null && typeof value === 'object' ? JSON.stringify(value)
          : String(value);
      lines.push(`${prefix}${key}=${shown}`);
    }
  }
  return lines;
}

// Issue #353: async so the schema can be loaded with the ESM-aware loader.
async function runPrint() {
  // Issue #353: an answer to "what did my app load?", with sensitive values
  // masked. Validation failures use the same messages and exit code as check.
  if (!schemaOpt) {
    const message = 'env-saaf: print needs --schema <file>';
    if (jsonMode) console.log(JSON.stringify({ ok: false, error: message }));
    else console.error(message);
    process.exit(2);
  }
  const valuesName = fileExplicit ? fileOpt : '.env';
  const valuesPath = path.join(dir, valuesName);
  if (!fs.existsSync(valuesPath)) {
    const message = `env-saaf: ${valuesName} not found in ${dir}`;
    if (jsonMode) console.log(JSON.stringify({ ok: false, error: message }));
    else console.error(message);
    process.exit(2);
  }
  const schema = await loadSchemaFile();
  let env;
  try {
    env = validateEnv(schema, readEnvFile(valuesPath));
  } catch (error) {
    if (!(error instanceof EnvSaafError)) throw error;
    if (jsonMode) console.log(JSON.stringify({ ok: false, errors: error.errors }));
    else error.errors.forEach((line) => console.error(line));
    process.exit(1);
  }
  const masked = maskBySchema(schema, env);
  if (jsonMode) {
    console.log(JSON.stringify(masked, null, 2));
  } else {
    printEffective(schema, masked).forEach((line) => console.log(line));
  }
  return 0;
}

function printScanResult(vars, locations) {
  // Issue #63: the reverse drift — keys declared in the template that no code reads any more.
  // Only a warning: stdout stays the plain list of used vars and the exit code is unchanged.
  // Without a template file there is nothing to compare, so the output is exactly as before.
  // Issue #359: in --stdin mode there is no scanned directory, so only compare when --file is explicit.
  let unused = null;
  if (!stdinOpt || fileExplicit) {
    const templatePath = path.join(dir, fileOpt);
    if (fs.existsSync(templatePath) && fs.statSync(templatePath).isFile()) {
      const declared = Object.keys(readEnvFile(templatePath));
      unused = diffEnv(vars, declared).documentedNotUsed;
    }
  }
  if (jsonMode) {
    // Issue #335: locations map sits beside unchanged vars/unused; plain output ignores it.
    const result = { ok: true, vars, locations: locations || {} };
    if (unused) result.unused = unused;
    console.log(JSON.stringify(result));
  } else {
    if (vars.length) console.log(vars.join('\n'));
    else console.error('No process.env usage found.');
    if (unused) unused.forEach(k => console.error(`UNUSED: ${k} (in ${fileOpt}, never used in code)`));
  }
  return 0;
}

// Issue #230: the scan/check bodies are plain functions so watch mode can
// re-run them; the non-watch path below calls them exactly once, keeping
// output and exit codes byte-for-byte unchanged.
function runScan() {
  // Issue #335: JSON mode reuses scanDirLocations so the CLI does not re-walk.
  if (jsonMode) {
    const { vars, locations } = scanDirLocations(dir, { exclude: excludeOpts });
    return printScanResult(vars, locations);
  }
  return printScanResult(scanDir(dir, { exclude: excludeOpts }));
}

const esmWatchPaths = new Set();
let watchLoadSeq = 0;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function unwrapSchemaModule(mod, loadedViaRequire) {
  if (!isModuleNamespaceObject(mod)) return mod;
  // Node's require(esm) attaches a synthetic __esModule: true alongside default;
  // ignore that marker only on require-loaded namespaces so explicit ESM named
  // exports are never silently dropped.
  const exportKeys = Object.keys(mod).filter(
    key => !(loadedViaRequire && key === '__esModule' && mod[key] === true)
  );
  if (exportKeys.length === 1 && exportKeys[0] === 'default') {
    return mod.default;
  }
  return mod;
}

async function loadSchemaModule(schemaPath) {
  const importFresh = async () => {
    const url = pathToFileURL(schemaPath);
    if (watchActive) url.searchParams.set('watch', String(++watchLoadSeq));
    return { mod: await import(url.href), loadedViaRequire: false };
  };
  if (schemaIsEsm(schemaPath) || (watchActive && esmWatchPaths.has(schemaPath))) {
    return importFresh();
  }
  try {
    // Issue #230: require() caches modules, so in watch mode a schema edit
    // would otherwise re-run against the stale cached schema — drop the
    // cache entry before loading (the init command uses the same pattern).
    if (watchActive) {
      try { delete require.cache[require.resolve(schemaPath)]; } catch { /* not loaded yet */ }
    }
    const mod = require(schemaPath);
    if (watchActive && isModuleNamespaceObject(mod)) {
      esmWatchPaths.add(schemaPath);
    }
    return { mod, loadedViaRequire: true };
  } catch (e) {
    if (e && (e.code === 'ERR_REQUIRE_ESM' || e.code === 'ERR_REQUIRE_ASYNC_MODULE')) {
      if (watchActive) esmWatchPaths.add(schemaPath);
      return importFresh();
    }
    throw e;
  }
}

// Load the --schema file (relative to the checked directory, like --file)
// and check it exports a schema object. Shared by the --schema validation
// step in runCheck, --json-schema (issue #268), and example --schema
// (issue #206). A load failure or a non-object export reports a plain message
// and exits 2.
async function loadSchemaFile() {
  const schemaPath = path.resolve(dir, schemaOpt);
  let loaded;
  try {
    loaded = await loadSchemaModule(schemaPath);
  } catch (e) {
    // Issue #184: when the schema file is one Node treats as an ES module,
    // say so plainly and name the fix instead of surfacing the raw
    // `ReferenceError: module is not defined` text.
    let detail = e && typeof e.message === 'string' ? e.message : String(e);
    if (/ES module|module is not defined/.test(detail)) {
      detail += ' — in a "type": "module" project the schema must be a .cjs file (e.g. env.schema.cjs)';
    }
    const message = `env-saaf: cannot load schema ${schemaOpt}: ${detail}`;
    if (jsonMode) console.log(JSON.stringify({ ok: false, error: message }));
    else console.error(message);
    fatalExit(2);
  }
  const schema = unwrapSchemaModule(loaded.mod, loaded.loadedViaRequire);
  if (!isPlainObject(schema)) {
    const message = `env-saaf: schema ${schemaOpt} must export a schema object (module.exports = { KEY: { type: 'port', ... } })`;
    if (jsonMode) console.log(JSON.stringify({ ok: false, error: message }));
    else console.error(message);
    fatalExit(2);
  }
  return schema;
}

async function runCheck() {
  // Issue #268: --json-schema prints the --schema file as a draft 2020-12
  // JSON Schema document to stdout instead of running the check. The
  // .env.example is never read here, so a schema can be converted even
  // before any example file exists. Without --schema there is nothing to
  // convert; an invalid schema reports its error and exits 2 like the
  // --schema validation path below, never a raw stack trace.
  if (jsonSchemaOpt) {
    if (!schemaOpt) {
      const message = 'env-saaf: --json-schema needs --schema <file>';
      if (jsonMode) console.log(JSON.stringify({ ok: false, error: message }));
      else console.error(message);
      fatalExit(2);
    }
    const schema = await loadSchemaFile();
    let document;
    try {
      document = toJsonSchema(schema);
    } catch (e) {
      if (e instanceof EnvSaafError) {
        const message = `env-saaf: invalid schema ${schemaOpt}: ${e.message}`;
        if (jsonMode) console.log(JSON.stringify({ ok: false, error: message }));
        else console.error(message);
        fatalExit(2);
      }
      throw e;
    }
    console.log(JSON.stringify(document, null, 2));
    return 0;
  }
  const examplePath = path.join(dir, fileOpt);
  if (!fs.existsSync(examplePath)) {
    // Issue #89: point at the command that drafts the file instead of dead-ending
    // a new user. --json keeps stdout parseable, so the hint travels as a field.
    const hint = `run \`env-saaf example\` to draft one, or generate it from your schema with generateExample()`;
    if (jsonMode) {
      console.log(JSON.stringify({ ok: false, error: `${fileOpt} not found in ${dir}`, hint }));
    } else {
      console.error(`env-saaf: ${fileOpt} not found in ${dir} — ${hint}`);
    }
    fatalExit(2);
  }
  const exampleValues = readEnvFile(examplePath);
  const documented = Object.keys(exampleValues);
  const exampleSecrets = detectExampleSecrets(exampleValues);
  const used = scanDir(dir, { exclude: excludeOpts });
  const { usedNotDocumented, documentedNotUsed } = diffEnv(used, documented);
  // The real .env is not committed, so only compare keys when it is actually present
  const envPath = path.join(dir, '.env');
  const envFileFound = fs.existsSync(envPath);
  let envExtra = [];
  let envMissing = [];
  if (envFileFound) {
    const envKeys = Object.keys(readEnvFile(envPath));
    const envDiff = diffEnv(envKeys, documented);
    envExtra = envDiff.usedNotDocumented;
    envMissing = envDiff.documentedNotUsed;
  }
  // Issue #90: --schema validates the values of the real env file against the
  // schema the file exports (module.exports = { PORT: { type: 'port', ... } }).
  // An explicit --file names the file to validate; otherwise the real .env wins
  // when present — the template's placeholders are not real values, so with no
  // .env and no explicit --file there is nothing real to validate and the step
  // is skipped. Failures land in the existing `invalid` field (the library's
  // errors already name the key) and fail the check like a missing key.
  let invalid = [];
  // Issue #358: the schema is a third source of truth; report both directions
  // against the example file, using flattened group names.
  let schemaNotDocumented = [];
  let documentedNotInSchema = [];
  if (schemaOpt) {
    const schema = await loadSchemaFile();
    const declared = flattenedSchemaKeys(schema);
    schemaNotDocumented = declared.filter((key) => !documented.includes(key));
    documentedNotInSchema = documented.filter((key) => !declared.includes(key));
    // Issue #352: --values names another file to validate (for example
    // .env.production); an explicit --file still names the template.
    let targetName = fileExplicit ? fileOpt : (envFileFound ? '.env' : null);
    if (valuesOpt !== null) {
      const valuesPath = path.join(dir, valuesOpt);
      if (!fs.existsSync(valuesPath) || !fs.statSync(valuesPath).isFile()) {
        const message = `env-saaf: --values ${valuesOpt} not found in ${dir}`;
        if (jsonMode) console.log(JSON.stringify({ ok: false, error: message }));
        else console.error(message);
        fatalExit(2);
      }
      targetName = valuesOpt;
    }
    if (targetName) {
      const values = readEnvFile(path.join(dir, targetName));
      try {
        validateEnv(schema, values);
      } catch (e) {
        if (e instanceof EnvSaafError) invalid = e.errors;
        else throw e;
      }
    }
  }
  // Issue #170: a fresh scaffold has no code using any variable yet, so every
  // documented key looks UNUSED. That is the scaffold waiting for code, not
  // drift in an established project — report it as one plain note and pass
  // instead of failing on one UNUSED line per key. The exception only fires
  // when UNUSED is the *only* finding: any MISSING, EXTRA or INVALID still
  // fails the check exactly as before (#113 is unchanged for a project that
  // already reads at least one variable).
  const scaffoldAhead = used.length === 0 && documentedNotUsed.length > 0
    && usedNotDocumented.length === 0 && envExtra.length === 0 && envMissing.length === 0 && invalid.length === 0
    && schemaNotDocumented.length === 0 && documentedNotInSchema.length === 0 && exampleSecrets.length === 0;
  const scaffoldNote = `no process.env usage found in code yet — ${documentedNotUsed.length} ${documentedNotUsed.length === 1 ? 'key' : 'keys'} in ${fileOpt} ${documentedNotUsed.length === 1 ? 'is' : 'are'} not used by any code yet`;
  const ok = scaffoldAhead || (usedNotDocumented.length === 0 && documentedNotUsed.length === 0
    && envExtra.length === 0 && envMissing.length === 0 && invalid.length === 0
    && schemaNotDocumented.length === 0 && documentedNotInSchema.length === 0 && exampleSecrets.length === 0);
  // Issue #352: --values validates its own file, so a missing .env is not a skip then.
  const skippedValues = schemaOpt && !fileExplicit && !envFileFound && valuesOpt === null;
  if (skippedValues && !jsonMode) {
    console.log('env-saaf: no .env file found — values were not validated.');
  }
  if (jsonMode) {
    // Issue #187: `scan --json` names the documented-but-unused keys `unused`,
    // so `check --json` now exposes the same list under the same name. `extra`
    // keeps its identical value so existing consumers are unaffected.
    const result = {
      ok,
      missing: usedNotDocumented,
      extra: scaffoldAhead ? [] : documentedNotUsed,
      unused: scaffoldAhead ? [] : documentedNotUsed,
      invalid,
      envExtra,
      envMissing,
      exampleSecrets,
    };
    if (valuesOpt !== null) result.valuesFile = valuesOpt;
    if (schemaOpt) {
      result.schemaNotDocumented = schemaNotDocumented;
      result.documentedNotInSchema = documentedNotInSchema;
    }
    if (skippedValues) result.envFileFound = false;
    if (scaffoldAhead) result.note = scaffoldNote;
    console.log(JSON.stringify(result));
  } else if (scaffoldAhead) {
    console.log(`env-saaf: ${scaffoldNote}.`);
  } else {
    usedNotDocumented.forEach(k => console.log(`MISSING in ${fileOpt}: ${k} (used in code)`));
    documentedNotUsed.forEach(k => console.log(`UNUSED: ${k} (in ${fileOpt}, never used in code)`));
    envExtra.forEach(k => console.log(`EXTRA in .env: ${k} (not in ${fileOpt})`));
    envMissing.forEach(k => console.log(`MISSING in .env: ${k} (in ${fileOpt}, not set locally)`));
    invalid.forEach(e => console.log(`INVALID${valuesOpt !== null ? ` in ${valuesOpt}` : ''}: ${e}`));
    schemaNotDocumented.forEach(k => console.log(`NOT DOCUMENTED: ${k} (in schema, missing from ${fileOpt})`));
    documentedNotInSchema.forEach(k => console.log(`NOT IN SCHEMA: ${k} (in ${fileOpt}, not declared in the schema)`));
    exampleSecrets.forEach(({ key, reason }) => {
      console.log(`SECRET-LIKE VALUE in ${fileOpt}: ${key} (suspected ${reason}; value redacted)`);
    });
    if (!usedNotDocumented.length && !documentedNotUsed.length && !envExtra.length && !envMissing.length && !invalid.length
      && !schemaNotDocumented.length && !documentedNotInSchema.length && !exampleSecrets.length) {
      console.log(`env-saaf: all clean — code and ${fileOpt} match.`);
    }
  }
  // Issue #113: the exit code follows the same `ok` the JSON output reports, so a
  // typo'd key in .env (EXTRA / MISSING), or a documented-but-unused key, can no
  // longer print a finding and still pass a CI job. UNUSED counts as a finding.
  return ok ? 0 : 1;
}

// Issue #230: watch mode. Runs the command once, then re-runs it (debounced
// ~150ms) whenever a watched file changes. Watched inputs: the whole scanned
// tree (each subdirectory individually, since recursive fs.watch is not
// available on Linux) plus the directory of the --schema file when it lives
// outside the scanned tree. Ctrl-C exits cleanly with code 0.
function watchLoop() {
  watchActive = true;
  let running = false;
  let rerunPending = false;
  const runOnce = async () => {
    if (running) {
      rerunPending = true;
      return;
    }
    running = true;
    try {
      do {
        rerunPending = false;
        let code;
        try {
          code = cmd === 'scan' ? runScan() : await runCheck();
        } catch (e) {
          // Issue #230: error paths report their exit code and the loop survives.
          if (e instanceof WatchExit) code = e.code;
          else throw e;
        }
        console.error(`env-saaf: [${new Date().toISOString()}] ${cmd} finished, exit ${code}`);
      } while (rerunPending);
    } finally {
      running = false;
    }
  };
  const triggerRun = () => {
    runOnce().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  };
  console.error(`env-saaf: watching ${dir} (${cmd}) — press Ctrl-C to stop`);
  triggerRun();

  const watchDirs = new Set();
  const collect = (d) => {
    const abs = path.resolve(d);
    if (watchDirs.has(abs)) return;
    watchDirs.add(abs);
    let entries;
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.git')) collect(path.join(abs, e.name));
    }
  };
  collect(dir);
  if (schemaOpt) {
    const schemaDir = path.dirname(path.resolve(dir, schemaOpt));
    const inside = [...watchDirs].some(w => schemaDir === w || schemaDir.startsWith(w + path.sep));
    if (!inside) collect(schemaDir);
  }

  const watchers = [];
  let scheduled = null;
  const onChange = () => {
    if (scheduled) clearTimeout(scheduled);
    scheduled = setTimeout(() => { scheduled = null; triggerRun(); }, 150);
  };
  for (const d of watchDirs) {
    try { watchers.push(fs.watch(d, onChange)); } catch { /* removed mid-watch */ }
  }
  process.on('SIGINT', () => {
    if (scheduled) clearTimeout(scheduled);
    for (const w of watchers) { try { w.close(); } catch { /* already closed */ } }
    console.error('env-saaf: stopped watching');
    process.exit(0);
  });
}

if (cmd === 'scan' || cmd === 'check') {
  if (watchOpt) {
    watchLoop(); // runs until Ctrl-C
  } else if (stdinOpt) {
    readStdin().then(
      (text) => {
        // Issue #335: piped --json uses the same library locations helper (`file: "-"`).
        if (jsonMode) {
          const { vars, locations } = scanCodeLocations(text, '-');
          process.exitCode = printScanResult(vars, locations);
        } else {
          process.exitCode = printScanResult(scanCode(text));
        }
      },
      (err) => { console.error(err); process.exitCode = 1; }
    );
  } else if (cmd === 'scan') {
    process.exit(runScan());
  } else {
    runCheck().then(
      code => process.exit(code),
      (err) => { console.error(err); process.exit(1); }
    );
  }
} else if (cmd === 'print') {
  runPrint().then(
    (code) => process.exit(code),
    (error) => { console.error(error); process.exit(1); },
  );
} else if (cmd === 'example') {
  // Issue #206: with --schema <file>, generate the example from the schema
  // (type placeholders plus alias/requiredIf annotations) instead of the code
  // scan, which cannot know them. Without --schema the scan draft is unchanged.
  if (schemaOpt) {
    loadSchemaFile().then((schema) => {
      const text = generateExample(schema);
      if (writeOpt === null) {
        process.stdout.write(text);
      } else {
        const target = path.join(dir, writeOpt);
        if (fs.existsSync(target) && !forceOpt) {
          console.error(`env-saaf: ${writeOpt} already exists in ${dir} — pass --force to overwrite it`);
          process.exit(1);
        }
        fs.writeFileSync(target, text);
        const count = Object.keys(schema).length;
        console.log(`env-saaf: wrote ${writeOpt} (${count} variable${count === 1 ? '' : 's'})`);
      }
    }, (err) => {
      console.error(err);
      process.exit(1);
    });
  } else {
  // v1.0.0: draft a .env.example from a code scan (placeholder values only)
  const used = scanDir(dir);
  const lines = ['# Generated by env-saaf from code scan — fill real values in .env'];
  used.forEach(k => lines.push(`${k}=`));
  if (writeOpt === null) {
    console.log(lines.join('\n'));
  } else {
    // Issue #116: refuse to write a header-only file. A scan that finds
    // nothing usually means a mistyped directory, and a useless file plus
    // exit 0 hides that. Plain `example` (stdout) is unchanged.
    if (used.length === 0) {
      console.error(`env-saaf: no process.env usage found in ${dir} — nothing to write; check the directory and try again`);
      process.exit(1);
    }
    const target = path.join(dir, writeOpt);
    if (fs.existsSync(target) && !forceOpt) {
      console.error(`env-saaf: ${writeOpt} already exists in ${dir} — pass --force to overwrite it`);
      process.exit(1);
    }
    fs.writeFileSync(target, lines.join('\n') + '\n');
    console.log(`env-saaf: wrote ${writeOpt} (${used.length} variable${used.length === 1 ? '' : 's'})`);
  }
  }
} else if (cmd === 'init') {
  // Issue #60: scaffold a starter schema and a matching .env.example so a new
  // project starts from a working baseline instead of a blank file. Both
  // files are checked before either is written, so a refusal never leaves a
  // half-written pair behind, and --force is required to overwrite either.
  // Issue #184: in an ES module project the default starter is env.schema.cjs
  // — a .js starter there would be treated as ESM and the require() below
  // would throw a raw stack trace. An explicit --schema name that Node would
  // treat as ESM is refused up front, before anything is written.
  let schemaName = schemaOpt || 'env.schema.js';
  if (!schemaOpt && schemaIsEsm(path.resolve(dir, schemaName))) schemaName = 'env.schema.cjs';
  const schemaPath = path.resolve(dir, schemaName);
  if (schemaOpt && schemaIsEsm(schemaPath)) {
    console.error(`env-saaf: schema ${schemaName} would be treated as an ES module in this project — use a .cjs file instead (e.g. --schema env.schema.cjs)`);
    process.exit(2);
  }
  // Issue #232: with --from-example the example file already exists and is
  // left untouched, so only the schema file participates in the refusal.
  const existing = exampleOpt
    ? [schemaName].filter(n => fs.existsSync(path.join(dir, n)))
    : [schemaName, '.env.example'].filter(n => fs.existsSync(path.join(dir, n)));
  if (existing.length && !forceOpt) {
    const verb = existing.length === 1 ? 'already exists' : 'already exist';
    const them = existing.length === 1 ? 'it' : 'them';
    console.error(`env-saaf: ${existing.join(' and ')} ${verb} in ${dir} — pass --force to overwrite ${them}`);
    process.exit(1);
  }

  // Issue #232: --from-example infers the starter from an existing example
  // file instead of the fixed template. The example is parsed with the same
  // parser `check` uses, so quotes/comments/interpolation behave identically.
  let entries = null;
  if (exampleOpt) {
    const examplePath = path.join(dir, exampleOpt);
    if (!fs.existsSync(examplePath) || !fs.statSync(examplePath).isFile()) {
      console.error(`env-saaf: ${exampleOpt} not found in ${dir} — nothing to infer a schema from`);
      process.exit(2);
    }
    entries = Object.entries(readEnvFile(examplePath));
  }

  // The example runs from the project root, even when init received a directory.
  const relativePath = path.isAbsolute(schemaName) ? schemaPath : path.relative(dir, schemaPath);
  const examplePath = path.isAbsolute(relativePath) ? relativePath : `./${relativePath}`;
  const shellPath = examplePath.split(path.sep).join('/');
  const check = 'npx env-saaf check . --schema';
  let hint = `Validate the real .env against it: ${check} ${shellPath}`;
  if (!/^[\w./:-]+$/.test(shellPath)) {
    if (process.platform === 'win32') {
      if (/^[\w./: '()-]+$/.test(shellPath)) {
        hint = `Validate the real .env against it (cmd.exe): ${check} "${shellPath}"`;
      } else {
        const displayPath = JSON.stringify(examplePath).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
        hint = `To validate the real .env from the project root, run env-saaf check with --schema set to this path (JSON): ${displayPath}`;
      }
    } else {
      let schemaArg = `'${shellPath.replace(/'/g, `'"'"'`)}'`;
      if (/[\r\n\u2028\u2029]/u.test(shellPath)) {
        // Bash/zsh escapes keep literal line breaks inside the generated JS comment.
        const escapes = { '\r': '\\r', '\n': '\\n', '\u2028': '\\342\\200\\250', '\u2029': '\\342\\200\\251' };
        schemaArg = `$'${shellPath.replace(/[\\']/g, '\\$&').replace(/[\r\n\u2028\u2029]/gu, ch => escapes[ch])}'`;
      }
      hint = `Validate the real .env against it (Bash/zsh): ${check} ${schemaArg}`;
    }
  }
  // Issue #171: scan the directory first (the same scan `check`/`example` use)
  // and fold keys the code already reads into the scaffold, so the generated
  // .env.example covers them and the first `check` after `init` reports no
  // MISSING lines to merge by hand. Keys the fixed scaffold already declares
  // are not duplicated; a directory with no code yet scans to nothing and the
  // scaffold is exactly as before.
  const discovered = exampleOpt
    ? scanDir(dir) // schemaFromExample drops the ones the example already lists
    : scanDir(dir).filter(k => !starterKeys.includes(k));
  if (exampleOpt) {
    fs.writeFileSync(schemaPath, schemaFromExample(hint, exampleOpt, entries, discovered, groupsOpt));
  } else {
    fs.writeFileSync(schemaPath, starterSchema(hint, discovered));
  }
  // Load the file just written and generate the example from it: the scaffold
  // goes through the same require a user's schema would take, so a broken
  // starter fails loudly here instead of shipping. The cache entry is dropped
  // so a --force re-run in the same process reads the new content.
  delete require.cache[require.resolve(schemaPath)];
  const starter = require(schemaPath);
  const keys = Object.keys(starter).length;
  if (exampleOpt) {
    // The example file already exists — it is the input, not an output, so it
    // is never written (or overwritten) here.
    console.log(`env-saaf: wrote ${schemaName} inferred from ${exampleOpt} (${keys} variable${keys === 1 ? '' : 's'}) — ${exampleOpt} left untouched`);
  } else {
    fs.writeFileSync(path.join(dir, '.env.example'), generateExample(starter));
    console.log(`env-saaf: wrote ${schemaName} and .env.example (${keys} variable${keys === 1 ? '' : 's'})`);
  }
  if (discovered.length) {
    const folded = exampleOpt ? discovered.filter(k => !entries.some(([ek]) => ek === k)) : discovered;
    if (folded.length) {
      console.log(`env-saaf: folded in ${folded.length} key${folded.length === 1 ? '' : 's'} found by scanning the code: ${folded.join(', ')}`);
    }
  }
} else {
  console.log(USAGE);
  process.exit(cmd ? 2 : 0);
}
