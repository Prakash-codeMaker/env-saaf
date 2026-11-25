'use strict';
// Issue #237: CLI integration tests. These run `cli.js` as a real subprocess
// (spawnSync) in throwaway projects under the OS temp dir, because the
// behaviours users depend on — exit codes, stdout vs stderr, --json shape,
// "type": "module" handling, missing-directory errors — are process-level
// and cannot be pinned by calling into the internals from test.js.
//
// Conventions match test.js: plain node:assert, no framework. Every project
// is created fresh and removed afterwards, and the child process gets a
// scrubbed environment so the developer's real env vars and cwd cannot leak
// into the results.
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, 'cli.js');

/** A minimal environment for the child: enough for Node to start, nothing else. */
function cleanEnv() {
  const env = { PATH: process.env.PATH || '' };
  if (process.platform === 'win32') {
    if (process.env.SYSTEMROOT) env.SYSTEMROOT = process.env.SYSTEMROOT;
    if (process.env.TEMP) env.TEMP = process.env.TEMP;
  } else if (process.env.HOME) {
    env.HOME = process.env.HOME;
  }
  return env;
}

/** Run the CLI in `cwd` and return { status, stdout, stderr }. */
function run(args, cwd, input) {
  const opts = {
    cwd,
    encoding: 'utf8',
    env: cleanEnv(),
  };
  if (input !== undefined) opts.input = input;
  const r = spawnSync(process.execPath, [CLI, ...args], opts);
  assert.ifError(r.error);
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Create a throwaway project directory; registered for cleanup. */
const tempDirs = [];
function mkProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-saaf-cli-test-'));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const p = path.join(dir, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
}

function cleanup() {
  for (const d of tempDirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

const SRC_WITH_USAGE = 'const port = process.env.PORT;\nconst db = process.env.DATABASE_URL;\nconsole.log(port, db);\n';
const EXAMPLE_BOTH = 'PORT=\nDATABASE_URL=\n';
const SCHEMA = "module.exports = { PORT: { type: 'port', required: true } };\n";
const asyncChecks = [];

try {
  // --- check: clean project exits 0 and says so on stdout -------------------
  {
    const dir = mkProject({ 'src/app.js': SRC_WITH_USAGE, '.env.example': EXAMPLE_BOTH });
    const r = run(['check', dir], dir);
    assert.strictEqual(r.status, 0, `clean check should exit 0, got ${r.status}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /all clean/);
  }

  // --- check: code reads a key the example does not document -> exit 1, MISSING on stdout
  {
    const dir = mkProject({ 'src/app.js': 'console.log(process.env.SECRET_TOKEN);\n', '.env.example': 'PORT=\n' });
    const r = run(['check', dir], dir);
    assert.strictEqual(r.status, 1, 'missing key must exit 1');
    assert.match(r.stdout, /MISSING in \.env\.example: SECRET_TOKEN/);
  }

  // --- check --json: stdout is one parseable JSON line, findings are fields -
  {
    const dir = mkProject({ 'src/app.js': 'console.log(process.env.SECRET_TOKEN);\n', '.env.example': 'PORT=\n' });
    const r = run(['check', dir, '--json'], dir);
    assert.strictEqual(r.status, 1);
    const parsed = JSON.parse(r.stdout); // must not throw
    assert.strictEqual(parsed.ok, false);
    assert.deepStrictEqual(parsed.missing, ['SECRET_TOKEN']);
    assert.strictEqual(r.stderr, '', 'findings belong on stdout in --json mode');
  }

  // --- --json is a public contract: pin every field and its type (issue #367) --
  {
    const dir = mkProject({ 'src/app.js': 'console.log(process.env.PORT);\n', '.env.example': 'PORT=\n' });
    const parsed = JSON.parse(run(['check', dir, '--json'], dir).stdout);
    assert.deepStrictEqual(parsed, {
      ok: true, missing: [], extra: [], unused: [], invalid: [], envExtra: [], envMissing: [],
    });
    assert.strictEqual(typeof parsed.ok, 'boolean');
    for (const field of ['missing', 'extra', 'unused', 'invalid', 'envExtra', 'envMissing']) {
      assert.ok(Array.isArray(parsed[field]), `${field} must be an array`);
    }
  }

  {
    // One finding of each kind, so no field can be dropped or renamed unnoticed.
    const dir = mkProject({
      'src/app.js': 'console.log(process.env.PORT, process.env.DOCUMENTED_USED, process.env.UNDOCUMENTED);\n',
      '.env.example': 'PORT=\nDOCUMENTED_USED=\nDOCUMENTED_UNUSED=\nMISSING_IN_ENV=\n',
      '.env': 'DOCUMENTED_USED=1\nPORT=not-a-port\nEXTRA_IN_ENV=2\n',
      'env.schema.js': "module.exports = { PORT: { type: 'port' } };\n",
    });
    const parsed = JSON.parse(run(['check', dir, '--schema', 'env.schema.js', '--json'], dir).stdout);
    assert.deepStrictEqual(Object.keys(parsed).sort(), [
      'envExtra', 'envMissing', 'extra', 'invalid', 'missing', 'ok', 'unused',
    ]);
    assert.strictEqual(parsed.ok, false);
    assert.deepStrictEqual(parsed.missing, ['UNDOCUMENTED']);
    assert.deepStrictEqual(parsed.extra, ['DOCUMENTED_UNUSED', 'MISSING_IN_ENV']);
    assert.deepStrictEqual(parsed.unused, ['DOCUMENTED_UNUSED', 'MISSING_IN_ENV']);
    assert.deepStrictEqual(parsed.envExtra, ['EXTRA_IN_ENV']);
    assert.deepStrictEqual(parsed.envMissing, ['DOCUMENTED_UNUSED', 'MISSING_IN_ENV']);
    assert.strictEqual(parsed.invalid.length, 1);
    assert.match(parsed.invalid[0], /PORT/);
    for (const field of ['missing', 'extra', 'unused', 'invalid', 'envExtra', 'envMissing']) {
      for (const item of parsed[field]) assert.strictEqual(typeof item, 'string', `${field} holds strings`);
    }
  }

  {
    const dir = mkProject({
      'src/app.js': 'console.log(process.env.USED_KEY);\n',
      '.env.example': 'USED_KEY=\nOLD_KEY=\n',
    });
    const parsed = JSON.parse(run(['scan', dir, '--json'], dir).stdout);
    assert.deepStrictEqual(parsed, {
      ok: true,
      vars: ['USED_KEY'],
      unused: ['OLD_KEY'],
      locations: { USED_KEY: [{ file: 'src/app.js', line: 1 }] },
    });
  }

  {
    // Without a template there is nothing to compare: no unused field at all.
    const dir = mkProject({ 'src/app.js': 'console.log(process.env.ONLY);\n' });
    assert.deepStrictEqual(JSON.parse(run(['scan', dir, '--json'], dir).stdout), {
      ok: true,
      vars: ['ONLY'],
      locations: { ONLY: [{ file: 'src/app.js', line: 1 }] },
    });
  }

  // --- check --schema: an invalid value in the real .env fails the check ----
  {
    const dir = mkProject({
      'src/app.js': SRC_WITH_USAGE,
      '.env.example': EXAMPLE_BOTH,
      '.env': 'PORT=not-a-port\nDATABASE_URL=x\n',
      'env.schema.js': SCHEMA,
    });
    const r = run(['check', dir, '--schema', 'env.schema.js'], dir);
    assert.strictEqual(r.status, 1);
    assert.match(r.stdout, /INVALID: PORT/);
    const rj = run(['check', dir, '--schema', 'env.schema.js', '--json'], dir);
    const parsed = JSON.parse(rj.stdout);
    assert.strictEqual(parsed.ok, false);
    assert.ok(Array.isArray(parsed.invalid) && parsed.invalid.length === 1 && /PORT/.test(parsed.invalid[0]));
  }

  // --- issue #358: --schema compares flattened schema keys with the example file ---
  {
    const dir = mkProject({
      'src/app.js': 'void process.env.PORT; void process.env.DB_HOST; void process.env.EXAMPLE_ONLY;\n',
      '.env.example': 'PORT=\nDB_HOST=\nEXAMPLE_ONLY=\n',
      'env.schema.js': "module.exports = { PORT: { type: 'port' }, DB: { prefix: 'DB_', schema: { HOST: { type: 'host' }, PORT: { type: 'port' } } }, SCHEMA_ONLY: { type: 'string' } };\n",
    });
    const text = run(['check', dir, '--schema', 'env.schema.js'], dir);
    assert.strictEqual(text.status, 1);
    assert.match(text.stdout, /NOT DOCUMENTED: DB_PORT/);
    assert.match(text.stdout, /NOT DOCUMENTED: SCHEMA_ONLY/);
    assert.match(text.stdout, /NOT IN SCHEMA: EXAMPLE_ONLY/);

    const json = run(['check', dir, '--schema', 'env.schema.js', '--json'], dir);
    assert.strictEqual(json.status, 1);
    const parsed = JSON.parse(json.stdout);
    assert.deepStrictEqual(parsed.schemaMissingFromExample, ['DB_PORT', 'SCHEMA_ONLY']);
    assert.deepStrictEqual(parsed.exampleMissingFromSchema, ['EXAMPLE_ONLY']);
    assert.deepStrictEqual(parsed.missing, []);
    assert.deepStrictEqual(parsed.unused, []);

    // The new arrays stay empty for a matching schema, including grouped prefixes.
    const cleanDir = mkProject({
      'src/app.js': 'void process.env.PORT; void process.env.DB_HOST;\n',
      '.env.example': 'PORT=\nDB_HOST=\n',
      'env.schema.js': "module.exports = { PORT: { type: 'port' }, DB: { prefix: 'DB_', schema: { HOST: { type: 'host' } } } };\n",
    });
    const clean = run(['check', cleanDir, '--schema', 'env.schema.js', '--json'], cleanDir);
    assert.strictEqual(clean.status, 0, `${clean.stdout}${clean.stderr}`);
    const cleanParsed = JSON.parse(clean.stdout);
    assert.deepStrictEqual(cleanParsed.schemaMissingFromExample, []);
    assert.deepStrictEqual(cleanParsed.exampleMissingFromSchema, []);
  }

  // --- check --json-schema: stdout is the draft 2020-12 JSON Schema for the --schema file (issue #268)
  {
    const { toJsonSchema } = require('./index');
    const schemaText = "module.exports = {\n"
      + "  PORT: { type: 'port', required: true },\n"
      + "  MODE: { type: 'string', choices: ['dev', 'prod'], default: 'dev' },\n"
      + "  DB: { prefix: 'DB_', schema: { HOST: { type: 'host', required: true }, PORT: { type: 'port', default: 5432 } } },\n"
      + "};\n";
    const dir = mkProject({
      'src/app.js': SRC_WITH_USAGE,
      '.env.example': EXAMPLE_BOTH,
      'env.schema.js': schemaText,
    });
    const expected = toJsonSchema(require(path.join(dir, 'env.schema.js')));
    const r = run(['check', dir, '--schema', 'env.schema.js', '--json-schema'], dir);
    assert.strictEqual(r.status, 0, `check --json-schema should exit 0, got ${r.status}: ${r.stdout}${r.stderr}`);
    assert.strictEqual(r.stderr, '', 'the schema document belongs on stdout, nothing on stderr');
    const parsed = JSON.parse(r.stdout); // must not throw
    assert.deepStrictEqual(parsed, expected);
    assert.strictEqual(parsed.$schema, 'https://json-schema.org/draft/2020-12/schema');
    // The grouped schema nests as an object schema (issue #262).
    assert.strictEqual(parsed.properties.DB.type, 'object');
    assert.deepStrictEqual(parsed.properties.DB.required, ['HOST']);
    // --schema= form and flag order do not matter.
    const r2 = run(['check', '--json-schema', '--schema=env.schema.js', dir], dir);
    assert.strictEqual(r2.status, 0, `${r2.stdout}${r2.stderr}`);
    assert.deepStrictEqual(JSON.parse(r2.stdout), expected);
    // Without the flag the normal check still runs (and passes here).
    const plain = run(['check', dir, '--schema', 'env.schema.js'], dir);
    assert.strictEqual(plain.status, 0, `plain check should still pass, got ${plain.status}: ${plain.stdout}${plain.stderr}`);
    assert.match(plain.stdout, /all clean/);
    // --json-schema without --schema exits 2 with a plain message.
    const noSchema = run(['check', dir, '--json-schema'], dir);
    assert.strictEqual(noSchema.status, 2);
    assert.match(noSchema.stderr, /--json-schema needs --schema/);
    // A missing schema file exits 2, no stack trace.
    const missing = run(['check', dir, '--schema', 'nope.js', '--json-schema'], dir);
    assert.strictEqual(missing.status, 2);
    assert.match(missing.stderr, /cannot load schema nope\.js/);
    assert.ok(!/at Object\.|at Module\./.test(missing.stderr), 'no raw Node stack trace');
  }

  // --- check: missing .env.example exits 2 with a hint ----------------------
  {
    const dir = mkProject({ 'src/app.js': SRC_WITH_USAGE });
    const r = run(['check', dir], dir);
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /\.env\.example not found/);
    assert.match(r.stderr, /env-saaf example/);
  }

  // Issue #321: scanner results and template checks agree on quoted env keys.
  {
    const dir = mkProject({
      'src/app.js': "process.env['DB.PORT']; process.env[`MY-KEY`]; const { 'OTHER.KEY': x } = process.env;",
      '.env.example': 'DB.PORT=5432\nMY-KEY=hello\nOTHER.KEY=value\n',
    });
    const scan = run(['scan', dir, '--json'], dir);
    assert.strictEqual(scan.status, 0);
    assert.deepStrictEqual(JSON.parse(scan.stdout).vars, ['DB.PORT', 'MY-KEY', 'OTHER.KEY']);
    const check = run(['check', dir], dir);
    assert.strictEqual(check.status, 0, check.stdout + check.stderr);
    assert.match(check.stdout, /all clean/);
  }

  // --- scan: lists used vars on stdout, exit 0 -------------------------------
  {
    const dir = mkProject({ 'src/app.js': SRC_WITH_USAGE, 'lib/util.js': 'module.exports = process.env.PORT;\n' });
    const r = run(['scan', dir], dir);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout.trim(), 'DATABASE_URL\nPORT');
  }

  // --- scan --json on an empty project: ok with empty vars, note on stderr --
  {
    const dir = mkProject({ 'README.md': '# nothing here\n' });
    const r = run(['scan', dir, '--json'], dir);
    assert.strictEqual(r.status, 0);
    assert.deepStrictEqual(JSON.parse(r.stdout), { ok: true, vars: [], locations: {} });
    const plain = run(['scan', dir], dir);
    assert.strictEqual(plain.status, 0);
    assert.match(plain.stderr, /No process\.env usage found\./);
  }

  // --- scan: UNUSED warnings go to stderr and never change the exit code -----
  {
    const dir = mkProject({ 'src/app.js': SRC_WITH_USAGE, '.env.example': EXAMPLE_BOTH + 'LEGACY_KEY=\n' });
    const r = run(['scan', dir], dir);
    assert.strictEqual(r.status, 0);
    assert.match(r.stderr, /UNUSED: LEGACY_KEY/);
    assert.strictEqual(r.stdout.trim(), 'DATABASE_URL\nPORT');
  }

  // --- example --write: creates the file, then refuses without --force ------
  {
    const dir = mkProject({ 'src/app.js': SRC_WITH_USAGE });
    const w = run(['example', dir, '--write'], dir);
    assert.strictEqual(w.status, 0);
    const written = fs.readFileSync(path.join(dir, '.env.example'), 'utf8');
    assert.match(written, /^DATABASE_URL=$/m);
    assert.match(written, /^PORT=$/m);
    const again = run(['example', dir, '--write'], dir);
    assert.strictEqual(again.status, 1, 'refuses to overwrite');
    assert.match(again.stderr, /already exist/);
    const forced = run(['example', dir, '--write', '--force'], dir);
    assert.strictEqual(forced.status, 0);
  }

  // --- example --write on a project with no usage: refuses, writes nothing ---
  {
    const dir = mkProject({ 'README.md': 'no code\n' });
    const r = run(['example', dir, '--write'], dir);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /nothing to write/);
    assert.ok(!fs.existsSync(path.join(dir, '.env.example')));
  }

  // --- init -> check round-trip in a CommonJS project ------------------------
  {
    const dir = mkProject({ 'src/app.js': SRC_WITH_USAGE, 'package.json': '{"name":"tmp-cjs"}\n' });
    const init = run(['init', dir], dir);
    assert.strictEqual(init.status, 0, init.stderr);
    assert.ok(fs.existsSync(path.join(dir, 'env.schema.js')), 'CJS project gets env.schema.js');
    assert.ok(fs.existsSync(path.join(dir, '.env.example')));
    // The scanned keys are folded into the scaffold (issue #171), so the
    // post-init check reports no MISSING lines; the scaffold's own fixed keys
    // are still UNUSED until code reads them, which fails the check per #113.
    const example = fs.readFileSync(path.join(dir, '.env.example'), 'utf8');
    assert.match(example, /^PORT=/m);
    assert.match(example, /^DATABASE_URL=/m);
    const check = run(['check', dir, '--schema', 'env.schema.js'], dir);
    assert.ok(!/MISSING/.test(check.stdout), `no MISSING after init: ${check.stdout}`);
    assert.match(check.stdout, /UNUSED: APP_NAME/);
    // init refuses to overwrite without --force
    const again = run(['init', dir], dir);
    assert.strictEqual(again.status, 1);
    assert.match(again.stderr, /already exist/);
  }

  // --- init -> check round-trip in a "type": "module" project (issue #184) ---
  {
    const dir = mkProject({
      'package.json': '{"name":"tmp-esm","type":"module"}\n',
      'src/app.js': SRC_WITH_USAGE,
    });
    const init = run(['init', dir], dir);
    assert.strictEqual(init.status, 0, init.stderr);
    assert.ok(fs.existsSync(path.join(dir, 'env.schema.cjs')), 'ESM project gets env.schema.cjs');
    assert.ok(!fs.existsSync(path.join(dir, 'env.schema.js')));
    const check = run(['check', dir, '--schema', 'env.schema.cjs'], dir);
    assert.ok(!/MISSING/.test(check.stdout), `no MISSING after init in ESM project: ${check.stdout}`);
  }

  // --- missing directory: exit 2, clear message, no stack trace --------------
  {
    const dir = mkProject({});
    const missing = path.join(dir, 'nope');
    const r = run(['check', missing], dir);
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /does not exist/);
    assert.ok(!/at Object\.|at Module\./.test(r.stderr), 'no raw Node stack trace');
    const rj = run(['scan', missing, '--json'], dir);
    assert.strictEqual(rj.status, 2);
    assert.strictEqual(JSON.parse(rj.stdout).ok, false);
  }

  // --- global flags: --version exits 0 before any command --------------------
  {
    const dir = mkProject({});
    const v = run(['--version'], dir);
    assert.strictEqual(v.status, 0);
    assert.match(v.stdout, /^env-saaf \d+\.\d+\.\d+/);
    const after = run(['check', dir, '--version'], dir);
    assert.strictEqual(after.status, 0);
    assert.match(after.stdout, /^env-saaf /);
  }

  // --- unknown command prints usage and exits 2 -------------------------------
  {
    const dir = mkProject({});
    const r = run(['frobnicate', dir], dir);
    assert.strictEqual(r.status, 2);
    assert.match(r.stdout, /Usage: env-saaf/);
  }

  // --- the assertions are real: a deliberately wrong exit-code expectation fails
  {
    const dir = mkProject({ 'src/app.js': SRC_WITH_USAGE, '.env.example': EXAMPLE_BOTH });
    const r = run(['check', dir], dir);
    assert.throws(
      () => assert.strictEqual(r.status, 99, 'deliberately wrong expectation'),
      /deliberately wrong expectation/,
    );
  }

  // --- issue #232: init --from-example infers a schema from an existing example
  {
    const example = [
      'APP_NAME=demo-app',
      'PORT=5432',
      'DEBUG=true',
      'API_URL=https://api.example.com/v1',
      'SUPPORT_EMAIL=admin@example.com',
      'RETRIES=3',
      'RATIO=2.5',
      'EMPTY=',
      'DB_HOST=db.internal',
      '',
    ].join('\n');
    const allKeys = 'console.log(' + ['APP_NAME','PORT','DEBUG','API_URL','SUPPORT_EMAIL','RETRIES','RATIO','EMPTY','DB_HOST'].map(k => `process.env.${k}`).join(', ') + ');\n';
    const dir = mkProject({ '.env.example': example, 'src/app.js': allKeys });
    const r = run(['init', dir, '--from-example'], dir);
    assert.strictEqual(r.status, 0, `init --from-example should exit 0, got ${r.status}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /wrote env\.schema\.js inferred from \.env\.example \(9 variables\)/);
    assert.match(r.stdout, /\.env\.example left untouched/);

    const schemaText = fs.readFileSync(path.join(dir, 'env.schema.js'), 'utf8');
    // Each inferred type is present, with an "inferred ... review" comment.
    for (const [key, type] of [['APP_NAME', 'string'], ['PORT', 'port'], ['DEBUG', 'boolean'], ['API_URL', 'url'], ['SUPPORT_EMAIL', 'email'], ['RETRIES', 'int'], ['RATIO', 'number'], ['EMPTY', 'string'], ['DB_HOST', 'string']]) {
      const ci = schemaText.indexOf(`inferred as '${type}' from the sample value in .env.example`);
      const ki = schemaText.indexOf(`${key}: { type: '${type}' }`);
      assert.ok(ci !== -1 && ki !== -1 && ci < ki, `missing inferred rule for ${key}`);
    }
    // The sample values themselves are never echoed into comments (a password
    // in the example must not leak into the committed schema).
    assert.ok(!schemaText.includes('demo-app'), 'sample value leaked into schema comment');
    // PORT is in the example, so the scan did not duplicate it.
    assert.strictEqual(schemaText.match(/PORT: \{ type: 'port' \}/g).length, 1);
    // The example file is byte-for-byte untouched.
    assert.strictEqual(fs.readFileSync(path.join(dir, '.env.example'), 'utf8'), example);
    // Acceptance: the generated schema's check passes against that same example file.
    const c = run(['check', dir, '--file', '.env.example', '--schema', 'env.schema.js'], dir);
    assert.strictEqual(c.status, 0, `check against the example should pass, got ${c.status}: ${c.stdout}${c.stderr}`);
  }

  // --- issue #290: inferred schemas keep dotted and dashed names as usable flat keys
  {
    const dir = mkProject({ '.env.example': 'DB.PORT=5432\nMY-KEY=demo\nA.B-C_D=3\n' });
    const r = run(['init', dir, '--from-example'], dir);
    assert.strictEqual(r.status, 0, `${r.stdout}${r.stderr}`);

    const schema = require(path.join(dir, 'env.schema.js'));
    assert.deepStrictEqual(schema, {
      'DB.PORT': { type: 'port' }, 'MY-KEY': { type: 'string' }, 'A.B-C_D': { type: 'int' },
    });
    const { loadEnv } = require('./index');
    assert.deepStrictEqual(loadEnv(schema, { path: path.join(dir, '.env.example'), env: {} }), {
      'DB.PORT': 5432, 'MY-KEY': 'demo', 'A.B-C_D': 3,
    });
    const c = run(['check', dir, '--file', '.env.example', '--schema', 'env.schema.js'], dir);
    assert.strictEqual(c.status, 0, `${c.stdout}${c.stderr}`);
  }

  // --- issue #232: a scanned key the example lacks is folded in as a string rule
  {
    const dir = mkProject({ '.env.example': 'PORT=8080\n', 'src/app.js': 'console.log(process.env.EXTRA_SCANNED);\n' });
    const r = run(['init', dir, '--from-example'], dir);
    assert.strictEqual(r.status, 0, `${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /folded in 1 key found by scanning the code: EXTRA_SCANNED/);
    const schemaText = fs.readFileSync(path.join(dir, 'env.schema.js'), 'utf8');
    assert.match(schemaText, /EXTRA_SCANNED: \{ type: 'string' \}/);
    assert.strictEqual(schemaText.match(/PORT: \{ type: 'port' \}/g).length, 1);
  }

  // --- issue #232: port-looking threshold — 1024..65535 is a port, smaller ints are int
  {
    const dir = mkProject({ '.env.example': 'A=1024\nB=65535\nC=1023\nD=65536\nE=-5\n' });
    const r = run(['init', dir, '--from-example'], dir);
    assert.strictEqual(r.status, 0, `${r.stdout}${r.stderr}`);
    const schemaText = fs.readFileSync(path.join(dir, 'env.schema.js'), 'utf8');
    assert.match(schemaText, /A: \{ type: 'port' \}/);
    assert.match(schemaText, /B: \{ type: 'port' \}/);
    assert.match(schemaText, /C: \{ type: 'int' \}/);
    assert.match(schemaText, /D: \{ type: 'int' \}/);
    assert.match(schemaText, /E: \{ type: 'int' \}/);
  }

  // --- issue #232 (review fix): malformed samples must not infer 'email'/'url' —
  // the generated schema has to validate against the example's own values.
  {
    const dir = mkProject({ '.env.example': 'BAD_EMAIL=a@.b.com\nBAD_URL=http://host:abc\nGOOD_EMAIL=admin@example.com\nGOOD_URL=https://api.example.com/v1\n' });
    const r = run(['init', dir, '--from-example'], dir);
    assert.strictEqual(r.status, 0, `${r.stdout}${r.stderr}`);
    const schemaText = fs.readFileSync(path.join(dir, 'env.schema.js'), 'utf8');
    // 'a@.b.com' has a domain starting with a dot and 'http://host:abc' has an
    // invalid port — both fail the corresponding validators, so they infer 'string'.
    assert.match(schemaText, /BAD_EMAIL: \{ type: 'string' \}/);
    assert.match(schemaText, /BAD_URL: \{ type: 'string' \}/);
    assert.doesNotMatch(schemaText, /BAD_EMAIL: \{ type: 'email' \}/);
    assert.doesNotMatch(schemaText, /BAD_URL: \{ type: 'url' \}/);
    // Valid samples still infer their types.
    assert.match(schemaText, /GOOD_EMAIL: \{ type: 'email' \}/);
    assert.match(schemaText, /GOOD_URL: \{ type: 'url' \}/);
    // Acceptance: check passes against the example's own values.
    const c = run(['check', dir, '--file', '.env.example', '--schema', 'env.schema.js'], dir);
    assert.strictEqual(c.status, 0, `check against the example should pass, got ${c.status}: ${c.stdout}${c.stderr}`);
  }

  // --- issue #232: --from-example=FILE names a different example file
  {
    const dir = mkProject({ '.env.sample': 'TOKEN=abc123\n' });
    const r = run(['init', dir, '--from-example=.env.sample'], dir);
    assert.strictEqual(r.status, 0, `${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /inferred from \.env\.sample \(1 variable\)/);
    assert.ok(fs.existsSync(path.join(dir, 'env.schema.js')));
    assert.ok(!fs.existsSync(path.join(dir, '.env.example')), 'no .env.example should be created in --from-example mode');
  }

  // --- issue #232: missing example file exits 2 and writes nothing
  {
    const dir = mkProject({ 'src/app.js': 'console.log(process.env.PORT);\n' });
    const r = run(['init', dir, '--from-example'], dir);
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /\.env\.example not found/);
    assert.ok(!fs.existsSync(path.join(dir, 'env.schema.js')));
  }

  // --- issue #232: existing schema without --force refuses (exit 1); --force overwrites schema but not the example
  {
    const example = 'PORT=8080\n';
    const dir = mkProject({ '.env.example': example, 'env.schema.js': 'module.exports = {};\n' });
    const r1 = run(['init', dir, '--from-example'], dir);
    assert.strictEqual(r1.status, 1);
    assert.match(r1.stderr, /env\.schema\.js already exists/);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'env.schema.js'), 'utf8'), 'module.exports = {};\n');
    const r2 = run(['init', dir, '--from-example', '--force'], dir);
    assert.strictEqual(r2.status, 0, `${r2.stdout}${r2.stderr}`);
    assert.match(fs.readFileSync(path.join(dir, 'env.schema.js'), 'utf8'), /PORT: \{ type: 'port' \}/);
    assert.strictEqual(fs.readFileSync(path.join(dir, '.env.example'), 'utf8'), example);
  }

  // --- issue #232: in a "type": "module" project the inferred schema is a .cjs file
  {
    const dir = mkProject({ 'package.json': '{"type":"module"}\n', '.env.example': 'PORT=8080\n' });
    const r = run(['init', dir, '--from-example'], dir);
    assert.strictEqual(r.status, 0, `${r.stdout}${r.stderr}`);
    assert.ok(fs.existsSync(path.join(dir, 'env.schema.cjs')), 'ESM project should get env.schema.cjs');
    assert.match(fs.readFileSync(path.join(dir, 'env.schema.cjs'), 'utf8'), /PORT: \{ type: 'port' \}/);
  }

  // --- issue #232: without --from-example, init behaves exactly as before (writes both files)
  {
    const dir = mkProject({ 'src/app.js': SRC_WITH_USAGE });
    const r = run(['init', dir], dir);
    assert.strictEqual(r.status, 0, `${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /wrote env\.schema\.js and \.env\.example/);
    assert.ok(fs.existsSync(path.join(dir, '.env.example')));
    const schemaText = fs.readFileSync(path.join(dir, 'env.schema.js'), 'utf8');
    for (const k of ['APP_NAME', 'RETRIES', 'DEBUG', 'PORT', 'API_URL', 'SUPPORT_EMAIL', 'SHUTDOWN_TIMEOUT', 'DB_HOST']) {
      assert.match(schemaText, new RegExp(`${k}: \\{`), `fixed scaffold key ${k} missing`);
    }
    assert.match(schemaText, /DATABASE_URL: \{ type: 'string' \}/);
  }

  // --- issue #263: init --from-example --groups folds keys sharing a prefix into a grouped schema
  {
    const example = [
      'DB_HOST=localhost',
      'DB_PORT=5432',
      'DB_USER=app',
      'API_KEY=secret_token',
      '',
    ].join('\n');
    const dir = mkProject({ '.env.example': example });
    const r = run(['init', dir, '--from-example', '--groups'], dir);
    assert.strictEqual(r.status, 0, `init --from-example --groups should exit 0, got ${r.status}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /\.env\.example left untouched/);

    const schemaText = fs.readFileSync(path.join(dir, 'env.schema.js'), 'utf8');
    // Group DB with prefix 'DB_' and inner rules HOST, PORT, USER
    assert.match(schemaText, /DB: \{\s+prefix: 'DB_',\s+schema: \{/);
    assert.match(schemaText, /HOST: \{ type: 'string' \}/);
    assert.match(schemaText, /PORT: \{ type: 'port' \}/);
    assert.match(schemaText, /USER: \{ type: 'string' \}/);
    // API_KEY stays flat
    assert.match(schemaText, /API_KEY: \{ type: 'string' \}/);
    assert.doesNotMatch(schemaText, /API: \{\s+prefix:/);
    // Comments on inferred rules
    assert.ok(schemaText.includes("inferred as 'port' from the sample value in .env.example — review this rule"));
    assert.ok(schemaText.includes("inferred as 'string' from the sample value in .env.example — review this rule"));
    // The example file is byte-for-byte untouched
    assert.strictEqual(fs.readFileSync(path.join(dir, '.env.example'), 'utf8'), example);

    // Acceptance: the generated schema's check passes against that same example file
    const c = run(['check', dir, '--file', '.env.example', '--schema', 'env.schema.js'], dir);
    assert.strictEqual(c.status, 0, `check against the example should pass, got ${c.status}: ${c.stdout}${c.stderr}`);
  }

  // --- issue #263: without --groups, behavior is unchanged (flat rules)
  {
    const example = [
      'DB_HOST=localhost',
      'DB_PORT=5432',
      'DB_USER=app',
      'API_KEY=secret_token',
      '',
    ].join('\n');
    const dir = mkProject({ '.env.example': example });
    const r = run(['init', dir, '--from-example'], dir);
    assert.strictEqual(r.status, 0, `${r.stdout}${r.stderr}`);
    const schemaText = fs.readFileSync(path.join(dir, 'env.schema.js'), 'utf8');
    assert.doesNotMatch(schemaText, /prefix: 'DB_'/);
    assert.match(schemaText, /DB_HOST: \{ type: 'string' \}/);
    assert.match(schemaText, /DB_PORT: \{ type: 'port' \}/);
    assert.match(schemaText, /DB_USER: \{ type: 'string' \}/);
    assert.match(schemaText, /API_KEY: \{ type: 'string' \}/);
  }

  // --- issue #263: a single key with a prefix stays flat even with --groups
  {
    const example = [
      'DB_HOST=localhost',
      'API_KEY=secret_token',
      '',
    ].join('\n');
    const dir = mkProject({ '.env.example': example });
    const r = run(['init', dir, '--from-example', '--groups'], dir);
    assert.strictEqual(r.status, 0, `${r.stdout}${r.stderr}`);
    const schemaText = fs.readFileSync(path.join(dir, 'env.schema.js'), 'utf8');
    assert.doesNotMatch(schemaText, /prefix:/);
    assert.match(schemaText, /DB_HOST: \{ type: 'string' \}/);
    assert.match(schemaText, /API_KEY: \{ type: 'string' \}/);
  }

  // --- issue #263: one-character prefix (A_X, A_Y) does not become a group even with --groups
  {
    const example = [
      'A_X=1024',
      'A_Y=2048',
      '',
    ].join('\n');
    const dir = mkProject({ '.env.example': example });
    const r = run(['init', dir, '--from-example', '--groups'], dir);
    assert.strictEqual(r.status, 0, `${r.stdout}${r.stderr}`);
    const schemaText = fs.readFileSync(path.join(dir, 'env.schema.js'), 'utf8');
    assert.doesNotMatch(schemaText, /prefix:/);
    assert.match(schemaText, /A_X: \{ type: 'port' \}/);
    assert.match(schemaText, /A_Y: \{ type: 'port' \}/);
  }

  // --- issue #278: unknown and misplaced flags fail fast with exit 2
  {
    const dir = mkProject({ 'app.js': 'process.env.PORT;\n', '.env.example': 'PORT=3000\n' });
    const unknown = run(['check', dir, '--bogus'], dir);
    assert.strictEqual(unknown.status, 2);
    assert.match(unknown.stderr, /unknown flag --bogus for check/);
    const misplaced = run(['scan', dir, '--json-schema'], dir);
    assert.strictEqual(misplaced.status, 2);
    assert.match(misplaced.stderr, /flag --json-schema is not supported for scan/);
    const exJson = run(['example', dir, '--json'], dir);
    assert.strictEqual(exJson.status, 2);
    const exWatch = run(['example', dir, '--watch'], dir);
    assert.strictEqual(exWatch.status, 2);
    const initJson = run(['init', dir, '--json'], dir);
    assert.strictEqual(initJson.status, 2);
    const valueless = run(['check', dir, '--file'], dir);
    assert.strictEqual(valueless.status, 2);
    assert.match(valueless.stderr, /--file needs a value/);
    // Valid combinations keep working:
    const okJson = run(['scan', dir, '--json'], dir);
    assert.strictEqual(okJson.status, 0, `${okJson.stdout}${okJson.stderr}`);
    const okCheck = run(['check', dir, '--json'], dir);
    assert.strictEqual(okCheck.status, 0, `${okCheck.stdout}${okCheck.stderr}`);
  }

  // --- issue #285: ESM schema loading (export default, named exports, CJS preservation, true errors)
  {
    const { toJsonSchema } = require('./index');
    const expected = toJsonSchema({ PORT: { type: 'port', required: true }, MODE: { type: 'string', default: 'dev' } });

    // 1. .mjs schema with sole `export default` works across check --json-schema, check, and example --schema.
    const mjsDir = mkProject({
      'src/app.js': 'console.log(process.env.PORT, process.env.MODE);\n',
      '.env.example': 'PORT=\nMODE=\n',
      '.env': 'PORT=3000\nMODE=dev\n',
      'env.schema.mjs': "export default { PORT: { type: 'port', required: true }, MODE: { type: 'string', default: 'dev' } };\n",
    });
    const jsSchemaOut = run(['check', mjsDir, '--schema', 'env.schema.mjs', '--json-schema'], mjsDir);
    assert.strictEqual(jsSchemaOut.status, 0, `${jsSchemaOut.stdout}${jsSchemaOut.stderr}`);
    assert.strictEqual(jsSchemaOut.stderr, '');
    assert.deepStrictEqual(JSON.parse(jsSchemaOut.stdout), expected);

    const okCheck = run(['check', mjsDir, '--schema', 'env.schema.mjs'], mjsDir);
    assert.strictEqual(okCheck.status, 0, `${okCheck.stdout}${okCheck.stderr}`);
    assert.match(okCheck.stdout, /all clean/);

    fs.writeFileSync(path.join(mjsDir, '.env'), 'PORT=not-a-port\nMODE=dev\n');
    const badVal = run(['check', mjsDir, '--schema', 'env.schema.mjs'], mjsDir);
    assert.strictEqual(badVal.status, 1);
    assert.match(badVal.stdout, /INVALID: PORT:/);
    assert.doesNotMatch(badVal.stdout + badVal.stderr, /default: unknown option/);

    const badValJson = run(['check', mjsDir, '--schema', 'env.schema.mjs', '--json'], mjsDir);
    assert.strictEqual(badValJson.status, 1);
    const parsedBad = JSON.parse(badValJson.stdout);
    assert.strictEqual(parsedBad.ok, false);
    assert.ok(parsedBad.invalid.some(e => /^PORT:/.test(e)));

    const exOut = run(['example', mjsDir, '--schema', 'env.schema.mjs'], mjsDir);
    assert.strictEqual(exOut.status, 0, `${exOut.stdout}${exOut.stderr}`);
    assert.match(exOut.stdout, /PORT=3000/);
    assert.match(exOut.stdout, /MODE=dev/);
    assert.doesNotMatch(exOut.stdout, /^default=/m);
    const exWrite = run(['example', mjsDir, '--schema', 'env.schema.mjs', '--write', '--force'], mjsDir);
    assert.strictEqual(exWrite.status, 0, `${exWrite.stdout}${exWrite.stderr}`);
    assert.match(exWrite.stdout, /wrote \.env\.example \(2 variables\)/);

    // 2. .js schema inside a "type": "module" project with `export default`.
    const pkgEsmDir = mkProject({
      'package.json': '{"name":"esm-pkg","type":"module"}\n',
      'src/app.js': 'console.log(process.env.PORT, process.env.MODE);\n',
      '.env.example': 'PORT=\nMODE=\n',
      '.env': 'PORT=8080\nMODE=dev\n',
      'env.schema.js': "export default { PORT: { type: 'port', required: true }, MODE: { type: 'string', default: 'dev' } };\n",
    });
    const pkgJsSchema = run(['check', pkgEsmDir, '--schema', 'env.schema.js', '--json-schema'], pkgEsmDir);
    assert.strictEqual(pkgJsSchema.status, 0, `${pkgJsSchema.stdout}${pkgJsSchema.stderr}`);
    assert.deepStrictEqual(JSON.parse(pkgJsSchema.stdout), expected);
    const pkgCheck = run(['check', pkgEsmDir, '--schema', 'env.schema.js'], pkgEsmDir);
    assert.strictEqual(pkgCheck.status, 0, `${pkgCheck.stdout}${pkgCheck.stderr}`);
    const pkgEx = run(['example', pkgEsmDir, '--schema', 'env.schema.js'], pkgEsmDir);
    assert.strictEqual(pkgEx.status, 0, `${pkgEx.stdout}${pkgEx.stderr}`);
    assert.match(pkgEx.stdout, /PORT=3000/);

    // 3. Top-level await in .mjs (exercises dynamic import() even when require(esm) exists).
    fs.writeFileSync(path.join(mjsDir, 'async.schema.mjs'),
      "const schema = await Promise.resolve({ PORT: { type: 'port', required: true }, MODE: { type: 'string', default: 'dev' } });\nexport default schema;\n");
    const asyncOut = run(['check', mjsDir, '--schema', 'async.schema.mjs', '--json-schema'], mjsDir);
    assert.strictEqual(asyncOut.status, 0, `${asyncOut.stdout}${asyncOut.stderr}`);
    assert.deepStrictEqual(JSON.parse(asyncOut.stdout), expected);

    // 4. Invalid rule inside `export default` still reports the real schema error.
    fs.writeFileSync(path.join(mjsDir, 'bad-rule.mjs'), "export default { PORT: { type: 'bogus' } };\n");
    const badRule = run(['check', mjsDir, '--schema', 'bad-rule.mjs', '--json-schema'], mjsDir);
    assert.strictEqual(badRule.status, 2);
    assert.match(badRule.stderr, /PORT: unknown type "bogus"/);
    assert.doesNotMatch(badRule.stderr, /default: unknown option/);

    // 5. Non-plain default exports in ESM fail with `must export a schema object`.
    for (const [name, src] of [
      ['null.mjs', 'export default null;\n'],
      ['str.mjs', "export default 'nope';\n"],
      ['arr.mjs', "export default ['PORT'];\n"],
      ['date.mjs', 'export default new Date();\n'],
    ]) {
      fs.writeFileSync(path.join(mjsDir, name), src);
      const r = run(['check', mjsDir, '--schema', name, '--json-schema'], mjsDir);
      assert.strictEqual(r.status, 2, `${name}: ${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /must export a schema object/, name);
    }

    // 6. ESM named exports work (single or multiple); mixed default + named or explicit __esModule + default do not unwrap.
    fs.writeFileSync(path.join(mjsDir, 'single-named.mjs'),
      "export const PORT = { type: 'port', required: true };\n");
    const singleNamed = run(['check', mjsDir, '--schema', 'single-named.mjs', '--json-schema'], mjsDir);
    assert.strictEqual(singleNamed.status, 0, `${singleNamed.stdout}${singleNamed.stderr}`);
    assert.deepStrictEqual(JSON.parse(singleNamed.stdout).properties, { PORT: expected.properties.PORT });

    fs.writeFileSync(path.join(mjsDir, 'named.mjs'),
      "export const PORT = { type: 'port', required: true };\nexport const MODE = { type: 'string', default: 'dev' };\n");
    const namedJs = run(['check', mjsDir, '--schema', 'named.mjs', '--json-schema'], mjsDir);
    assert.strictEqual(namedJs.status, 0, `${namedJs.stdout}${namedJs.stderr}`);
    assert.deepStrictEqual(JSON.parse(namedJs.stdout), expected);
    const namedEx = run(['example', mjsDir, '--schema', 'named.mjs'], mjsDir);
    assert.strictEqual(namedEx.status, 0, `${namedEx.stdout}${namedEx.stderr}`);
    assert.match(namedEx.stdout, /PORT=3000/);

    fs.writeFileSync(path.join(mjsDir, 'mixed.mjs'),
      "export default { PORT: { type: 'port', required: true } };\nexport const EXTRA = { type: 'string' };\n");
    const mixed = run(['check', mjsDir, '--schema', 'mixed.mjs', '--json-schema'], mjsDir);
    assert.strictEqual(mixed.status, 2);
    assert.match(mixed.stderr, /default: unknown option "PORT"/);

    fs.writeFileSync(path.join(mjsDir, 'esmod-named.mjs'),
      "export const __esModule = true;\nexport default { PORT: { type: 'port', required: true } };\n");
    const esmodNamed = run(['check', mjsDir, '--schema', 'esmod-named.mjs', '--json-schema'], mjsDir);
    assert.strictEqual(esmodNamed.status, 2);
    assert.match(esmodNamed.stderr, /default: unknown option "PORT"/);

    // 7. CommonJS schemas stay untouched, including an actual key named `default` and CJS `__esModule`.
    const cjsDir = mkProject({
      'src/app.js': 'console.log(process.env.default, process.env.PORT);\n',
      '.env.example': 'default=\nPORT=\n',
      '.env': 'default=hello\nPORT=3000\n',
      'cjs-default.cjs': "module.exports = { default: { type: 'string', required: true }, PORT: { type: 'port', required: true } };\n",
      'cjs-esmod.cjs': "module.exports = { __esModule: true, default: { PORT: { type: 'port', required: true } } };\n",
    });
    const cjsDefJs = run(['check', cjsDir, '--schema', 'cjs-default.cjs', '--json-schema'], cjsDir);
    assert.strictEqual(cjsDefJs.status, 0, `${cjsDefJs.stdout}${cjsDefJs.stderr}`);
    const cjsParsed = JSON.parse(cjsDefJs.stdout);
    assert.deepStrictEqual(cjsParsed.properties.default, { type: 'string' });
    assert.deepStrictEqual(cjsParsed.required, ['default', 'PORT']);

    const cjsDefCheck = run(['check', cjsDir, '--schema', 'cjs-default.cjs'], cjsDir);
    assert.strictEqual(cjsDefCheck.status, 0, `${cjsDefCheck.stdout}${cjsDefCheck.stderr}`);
    fs.writeFileSync(path.join(cjsDir, '.env'), 'PORT=3000\n');
    const cjsDefMissing = run(['check', cjsDir, '--schema', 'cjs-default.cjs'], cjsDir);
    assert.strictEqual(cjsDefMissing.status, 1);
    assert.match(cjsDefMissing.stdout, /INVALID: default: missing required variable/);
    const cjsDefEx = run(['example', cjsDir, '--schema', 'cjs-default.cjs'], cjsDir);
    assert.strictEqual(cjsDefEx.status, 0, `${cjsDefEx.stdout}${cjsDefEx.stderr}`);
    assert.match(cjsDefEx.stdout, /^default=your_value_here$/m);

    const cjsEsmod = run(['check', cjsDir, '--schema', 'cjs-esmod.cjs', '--json-schema'], cjsDir);
    assert.strictEqual(cjsEsmod.status, 2);
    assert.match(cjsEsmod.stderr, /default: unknown option "PORT"/);

    // 7b. Unwrapping sole `default` in ESM happens once, so an ESM schema with an actual `default` key works too.
    fs.writeFileSync(path.join(mjsDir, 'esm-default-key.mjs'),
      "export default { default: { type: 'string', required: true } };\n");
    const esmDefKey = run(['check', mjsDir, '--schema', 'esm-default-key.mjs', '--json-schema'], mjsDir);
    assert.strictEqual(esmDefKey.status, 0, `${esmDefKey.stdout}${esmDefKey.stderr}`);
    assert.deepStrictEqual(JSON.parse(esmDefKey.stdout).properties.default, { type: 'string' });

    // 7c. On Node versions with require(esm), detected-ESM .js files (no "type": "module") and top-level await work too.
    if (process.features && process.features.require_module) {
      fs.writeFileSync(path.join(cjsDir, 'detected-esm.js'),
        "export default { PORT: { type: 'port', required: true }, MODE: { type: 'string', default: 'dev' } };\n");
      const detOut = run(['check', cjsDir, '--schema', 'detected-esm.js', '--json-schema'], cjsDir);
      assert.strictEqual(detOut.status, 0, `${detOut.stdout}${detOut.stderr}`);
      assert.deepStrictEqual(JSON.parse(detOut.stdout), expected);

      fs.writeFileSync(path.join(cjsDir, 'detected-async-esm.js'),
        "const s = await Promise.resolve({ PORT: { type: 'port', required: true }, MODE: { type: 'string', default: 'dev' } });\nexport default s;\n");
      const detAsyncOut = run(['check', cjsDir, '--schema', 'detected-async-esm.js', '--json-schema'], cjsDir);
      assert.strictEqual(detAsyncOut.status, 0, `${detAsyncOut.stdout}${detAsyncOut.stderr}`);
      assert.deepStrictEqual(JSON.parse(detAsyncOut.stdout), expected);
    }

    // 8. True module errors (syntax error, runtime throw, CJS syntax in ESM .js) are preserved.
    fs.writeFileSync(path.join(mjsDir, 'syntax.mjs'), 'export default {{{\n');
    const synErr = run(['check', mjsDir, '--schema', 'syntax.mjs', '--json-schema'], mjsDir);
    assert.strictEqual(synErr.status, 2);
    assert.match(synErr.stderr, /cannot load schema syntax\.mjs/);

    fs.writeFileSync(path.join(mjsDir, 'boom.mjs'), "throw new Error('boom from esm schema');\n");
    const runErr = run(['check', mjsDir, '--schema', 'boom.mjs', '--json-schema'], mjsDir);
    assert.strictEqual(runErr.status, 2);
    assert.match(runErr.stderr, /cannot load schema boom\.mjs/);
    assert.match(runErr.stderr, /boom from esm schema/);

    fs.writeFileSync(path.join(pkgEsmDir, 'cjs-in-esm.js'), "module.exports = { PORT: { type: 'port' } };\n");
    const cjsInEsm = run(['check', pkgEsmDir, '--schema', 'cjs-in-esm.js'], pkgEsmDir);
    assert.strictEqual(cjsInEsm.status, 2);
    assert.match(cjsInEsm.stderr, /\.cjs/);
    assert.ok(!cjsInEsm.stderr.includes('ReferenceError'), cjsInEsm.stderr);

    fs.writeFileSync(path.join(cjsDir, 'throw-null.cjs'), 'throw null;\n');
    const nullThrow = run(['check', cjsDir, '--schema', 'throw-null.cjs', '--json-schema'], cjsDir);
    assert.strictEqual(nullThrow.status, 2);
    assert.match(nullThrow.stderr, /cannot load schema throw-null\.cjs: null/);
  }

  // --- issue #359: scan --stdin reads piped code via scanCode ----------------
  {
    const { scanCode, scanCodeLocations } = require('./index');
    const { spawn } = require('node:child_process');
    const dir = mkProject({
      'src/disk.js': 'console.log(process.env.DISK_ONLY_KEY);\n',
      '.env.example': 'PORT=\nCWD_TEMPLATE_UNUSED=\n',
    });
    const piped = [
      '// process.env.COMMENT_DECOY',
      '/* import.meta.env.BLOCK_DECOY */',
      "const literal = 'process.env.STRING_DECOY';",
      'const port = process.env.PORT;',
      "const host = process.env['DB.HOST'];",
      'const opt = process.env?.OPTIONAL_KEY;',
      'const vite = import.meta.env.VITE_API_URL;',
      "const { SECRET_TOKEN, RETRIES: r = '3' } = process.env;",
      'const env = process.env; const aliased = env.ALIAS_KEY;',
      'const tpl = `plain process.env.TPL_DECOY ${process.env.TPL_READ}`;',
      '',
    ].join('\n');
    const expectedVars = scanCode(piped);
    assert.deepStrictEqual(expectedVars, [
      'ALIAS_KEY', 'DB.HOST', 'OPTIONAL_KEY', 'PORT', 'RETRIES', 'SECRET_TOKEN', 'TPL_READ', 'VITE_API_URL',
    ]);

    // Text mode: prints the exact sorted scanCode keys, ignores disk files and implicit cwd .env.example.
    const plain = run(['scan', '--stdin'], dir, piped);
    assert.strictEqual(plain.status, 0, `${plain.stdout}${plain.stderr}`);
    assert.strictEqual(plain.stderr, '');
    assert.strictEqual(plain.stdout, expectedVars.join('\n') + '\n');

    // JSON mode (both flag orders): vars + locations from scanCodeLocations; no implicit cwd template noise.
    const expectedStdinJson = scanCodeLocations(piped, '-');
    for (const args of [['scan', '--stdin', '--json'], ['scan', '--json', '--stdin']]) {
      const js = run(args, dir, piped);
      assert.strictEqual(js.status, 0, `${js.stdout}${js.stderr}`);
      assert.strictEqual(js.stderr, '');
      assert.deepStrictEqual(JSON.parse(js.stdout), {
        ok: true,
        vars: expectedVars,
        locations: expectedStdinJson.locations,
      });
    }

    // Explicit --file compares stdin keys against the named template file.
    const withFile = run(['scan', '--stdin', '--file', '.env.example', '--json'], dir, 'process.env.PORT;\n');
    assert.strictEqual(withFile.status, 0, `${withFile.stdout}${withFile.stderr}`);
    assert.deepStrictEqual(JSON.parse(withFile.stdout), {
      ok: true,
      vars: ['PORT'],
      unused: ['CWD_TEMPLATE_UNUSED'],
      locations: { PORT: [{ file: '-', line: 1 }] },
    });

    // Empty stdin and comment-only stdin print existing no-usage output rather than hanging or crashing.
    for (const emptyInput of ['', '   \n', '// process.env.IGNORED\nconst x = 1;\n']) {
      const emptyPlain = run(['scan', '--stdin'], dir, emptyInput);
      assert.strictEqual(emptyPlain.status, 0);
      assert.strictEqual(emptyPlain.stdout, '');
      assert.strictEqual(emptyPlain.stderr, 'No process.env usage found.\n');

      const emptyJson = run(['scan', '--stdin', '--json'], dir, emptyInput);
      assert.strictEqual(emptyJson.status, 0);
      assert.strictEqual(emptyJson.stderr, '');
      assert.deepStrictEqual(JSON.parse(emptyJson.stdout), { ok: true, vars: [], locations: {} });
    }

    // Combining --stdin with a directory argument exits 2 with a clear message (text and --json).
    for (const args of [['scan', '--stdin', dir], ['scan', dir, '--stdin'], ['scan', '--stdin', '.']]) {
      const badDir = run(args, dir, piped);
      assert.strictEqual(badDir.status, 2, args.join(' '));
      assert.strictEqual(badDir.stdout, '');
      assert.match(badDir.stderr, /^env-saaf: --stdin cannot be combined with a directory argument\r?\n$/);
    }
    const badDirJson = run(['scan', '--stdin', dir, '--json'], dir, piped);
    assert.strictEqual(badDirJson.status, 2);
    assert.strictEqual(badDirJson.stderr, '');
    assert.deepStrictEqual(JSON.parse(badDirJson.stdout), {
      ok: false,
      error: 'env-saaf: --stdin cannot be combined with a directory argument',
    });

    // Combining --stdin with --watch or passing --stdin to other commands exits 2 cleanly.
    const badWatch = run(['scan', '--stdin', '--watch'], dir, '');
    assert.strictEqual(badWatch.status, 2);
    assert.match(badWatch.stderr, /--stdin cannot be combined with --watch/);
    for (const other of ['check', 'example', 'init']) {
      const badCmd = run([other, '--stdin'], dir, '');
      assert.strictEqual(badCmd.status, 2, other);
      assert.match(badCmd.stderr, new RegExp(`flag --stdin is not supported for ${other}`));
    }

    // Async child-process pipe (chunked writes + multi-byte UTF-8 split across chunks).
    asyncChecks.push(new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [CLI, 'scan', '--stdin', '--json'], {
        cwd: dir,
        env: cleanEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let out = '';
      let err = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', d => { out += d; });
      child.stderr.on('data', d => { err += d; });
      child.on('error', reject);
      child.on('close', code => {
        try {
          assert.strictEqual(code, 0, err);
          assert.strictEqual(err, '');
          assert.deepStrictEqual(JSON.parse(out), {
            ok: true,
            vars: ['PIPE_FIRST', 'PIPE_SECOND'],
            locations: {
              PIPE_FIRST: [{ file: '-', line: 2 }],
              PIPE_SECOND: [{ file: '-', line: 3 }],
            },
          });
          resolve();
        } catch (assertionErr) {
          reject(assertionErr);
        }
      });
      const buf = Buffer.from('const icon = "🚀";\nconst a = process.env.PIPE_FIRST;\nconst b = process.env.PIPE_SECOND;\n', 'utf8');
      const splitAt = buf.indexOf(0xf0) + 2; // split mid-4-byte UTF-8 sequence
      child.stdin.write(buf.subarray(0, splitAt));
      child.stdin.end(buf.subarray(splitAt));
    }));

    // Large piped output (>300 KiB) under delayed stdout drain must flush completely without truncation.
    const largeCount = 15000;
    const largeCode = Array.from(
      { length: largeCount },
      (_, i) => `process.env.LARGE_PIPE_KEY_${String(i).padStart(5, '0')};`
    ).join('\n');
    for (const jsonFlag of [true, false]) {
      asyncChecks.push(new Promise((resolve, reject) => {
        const args = jsonFlag ? [CLI, 'scan', '--stdin', '--json'] : [CLI, 'scan', '--stdin'];
        const child = spawn(process.execPath, args, {
          cwd: dir,
          env: cleanEnv(),
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        let err = '';
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', d => { err += d; });
        child.on('error', reject);
        child.stdin.end(largeCode, () => {
          setTimeout(() => {
            let out = '';
            child.stdout.setEncoding('utf8');
            child.stdout.on('data', d => { out += d; });
            child.on('close', (code) => {
              try {
                assert.strictEqual(code, 0, err);
                assert.strictEqual(err, '');
                if (jsonFlag) {
                  const parsed = JSON.parse(out);
                  assert.strictEqual(parsed.ok, true);
                  assert.strictEqual(parsed.vars.length, largeCount);
                  assert.strictEqual(parsed.vars[0], 'LARGE_PIPE_KEY_00000');
                  assert.strictEqual(parsed.vars[largeCount - 1], 'LARGE_PIPE_KEY_14999');
                } else {
                  const lines = out.trimEnd().split('\n');
                  assert.strictEqual(lines.length, largeCount);
                  assert.strictEqual(lines[0], 'LARGE_PIPE_KEY_00000');
                  assert.strictEqual(lines[largeCount - 1], 'LARGE_PIPE_KEY_14999');
                }
                resolve();
              } catch (assertionErr) {
                reject(assertionErr);
              }
            });
          }, 100);
        });
      }));
    }
  }
} catch (err) {
  cleanup();
  throw err;
}

Promise.all(asyncChecks)
  .then(() => {
    cleanup();
    console.log('test-cli.js: all CLI integration tests passed');
  })
  .catch((err) => {
    cleanup();
    console.error(err);
    process.exit(1);
  });
