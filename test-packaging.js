'use strict';
// Verify the packed npm artifact from fresh consumer projects, not the working tree.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = __dirname;
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const EXPECTED_EXPORTS = [
  'EnvSaafError', 'diffEnv', 'generateExample', 'loadEnv', 'loadEnvAsync',
  'maskSecrets', 'maskValue', 'parseEnvFile', 'scanCode', 'scanDir',
  'toJsonSchema', 'validateEnv', 'validateSchema',
].sort();

function run(command, args, cwd, shell = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120000,
    shell,
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' },
  });
  assert.ifError(result.error);
  assert.strictEqual(
    result.status,
    0,
    command + ' ' + args.join(' ') + ' failed in ' + cwd
      + '\nstdout:\n' + result.stdout + '\nstderr:\n' + result.stderr,
  );
  return result;
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'env-saaf-package-smoke-'));
function installTarball(name, tarball) {
  const project = path.join(scratch, name);
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({
    name: 'env-saaf-smoke-' + name,
    private: true,
    version: '1.0.0',
  }));
  run(NPM, [
    'install', '--ignore-scripts', '--no-audit', '--no-fund',
    '--package-lock=false', tarball,
  ], project, process.platform === 'win32');
  return project;
}

try {
  const packedDir = path.join(scratch, 'packed');
  fs.mkdirSync(packedDir);
  const pack = run(NPM, ['pack', '--json', '--pack-destination', packedDir], ROOT);
  const results = JSON.parse(pack.stdout);
  assert.strictEqual(results.length, 1, 'npm pack should create exactly one tarball');
  const tarball = path.join(packedDir, results[0].filename);
  assert.ok(fs.existsSync(tarball), 'npm pack did not create the tarball');

  const packedFiles = new Set(results[0].files.map(file => file.path));
  for (const file of ['package.json', 'index.js', 'index.d.ts', 'cli.js', 'README.md', 'LICENSE']) {
    assert.ok(packedFiles.has(file), 'published tarball is missing ' + file);
  }

  const cjsProject = installTarball('cjs', tarball);
  fs.writeFileSync(path.join(cjsProject, 'consumer.cjs'), [
    "'use strict';",
    "const assert = require('node:assert/strict');",
    "const pkg = require('env-saaf');",
    "assert.deepStrictEqual(Object.keys(pkg).sort(), " + JSON.stringify(EXPECTED_EXPORTS) + ");",
    "assert.strictEqual(pkg.validateEnv({ PORT: { type: 'port', required: true } }, { PORT: '3000' }).PORT, 3000);",
    "assert.deepStrictEqual(pkg.parseEnvFile('PORT=3000\\\\n'), { PORT: '3000' });",
    "",
  ].join('\n'));
  run(process.execPath, ['consumer.cjs'], cjsProject);

  const esmProject = installTarball('esm', tarball);
  fs.writeFileSync(path.join(esmProject, 'consumer.mjs'), [
    "import assert from 'node:assert/strict';",
    "import pkg, { validateEnv, parseEnvFile } from 'env-saaf';",
    "assert.deepStrictEqual(Object.keys(pkg).sort(), " + JSON.stringify(EXPECTED_EXPORTS) + ");",
    "assert.strictEqual(validateEnv({ PORT: { type: 'port', required: true } }, { PORT: '3000' }).PORT, 3000);",
    "assert.deepStrictEqual(parseEnvFile('PORT=3000\\\\n'), { PORT: '3000' });",
    "",
  ].join('\n'));
  run(process.execPath, ['consumer.mjs'], esmProject);

  for (const [name, project] of [['cjs', cjsProject], ['esm', esmProject]]) {
    const source = path.join(project, 'src');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'index.js'), 'const port = process.env.PACKAGE_SMOKE_PORT;\\n');
    const bin = path.join(project, 'node_modules', '.bin',
      process.platform === 'win32' ? 'env-saaf.cmd' : 'env-saaf');
    assert.ok(fs.existsSync(bin), 'npm did not install the env-saaf bin for ' + name);
    const version = run(bin, ['--version'], project, process.platform === 'win32');
    assert.match(version.stdout.trim(), /^env-saaf \\d+\\.\\d+\\.\\d+$/);
    const scan = run(bin, ['scan', './src'], project, process.platform === 'win32');
    assert.match(scan.stdout, /PACKAGE_SMOKE_PORT/);
  }

  const consumer = path.join(cjsProject, 'consumer.ts');
  fs.writeFileSync(consumer, [
    "import { validateEnv } from 'env-saaf';",
    "const env = validateEnv({ PORT: { type: 'port', required: true } }, { PORT: '3000' });",
    "const port: number = env.PORT;",
    "void port;",
    "",
  ].join('\n'));
  const tsc = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  assert.ok(fs.existsSync(tsc), 'TypeScript must be installed by the repository test setup');
  run(process.execPath, [
    tsc, '--noEmit', '--strict', '--skipLibCheck', '--target', 'es2020',
    '--module', 'node16', '--moduleResolution', 'node16', 'consumer.ts',
  ], cjsProject);

  console.log('Package smoke test passed: tarball contents, CommonJS, ESM, CLI bin, and installed TypeScript declarations.');
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
