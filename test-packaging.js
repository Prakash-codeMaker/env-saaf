'use strict';
// Smoke-test the published artifact, not just the working tree. Everything is
// packed and installed from a local tarball so this test never needs the network.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = __dirname;
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const PUBLIC_EXPORTS = [
  'EnvSaafError',
  'diffEnv',
  'generateExample',
  'loadEnv',
  'loadEnvAsync',
  'maskSecrets',
  'maskValue',
  'parseEnvFile',
  'scanCode',
  'scanDir',
  'toJsonSchema',
  'validateEnv',
  'validateSchema',
].sort();

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false', ...options.env },
    shell: options.shell === true,
  });
  assert.ifError(result.error);
  assert.strictEqual(
    result.status,
    0,
    `${command} ${args.join(' ')} failed in ${cwd}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'env-saaf-package-smoke-'));

function makeProject(name, tarball) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: `env-saaf-smoke-${name}`,
    private: true,
    version: '1.0.0',
  }));
  run(NPM, ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', tarball], dir);
  return dir;
}

try {
  const packDir = path.join(scratch, 'packed');
  fs.mkdirSync(packDir);
  const packed = run(NPM, ['pack', '--json', '--pack-destination', packDir], ROOT);
  const packResult = JSON.parse(packed.stdout);
  assert.strictEqual(packResult.length, 1, 'npm pack should produce exactly one tarball');
  const tarball = path.join(packDir, packResult[0].filename);
  assert.ok(fs.existsSync(tarball), 'npm pack did not create the tarball');

  const included = new Set(packResult[0].files.map(file => file.path));
  for (const required of ['package.json', 'index.js', 'index.d.ts', 'cli.js', 'README.md', 'LICENSE']) {
    assert.ok(included.has(required), `packed artifact is missing ${required}`);
  }

  const cjsProject = makeProject('cjs', tarball);
  fs.writeFileSync(path.join(cjsProject, 'consumer.cjs'), `
const assert = require('node:assert/strict');
const pkg = require('env-saaf');
assert.deepStrictEqual(Object.keys(pkg).sort(), ${JSON.stringify(PUBLIC_EXPORTS)});
const value = pkg.validateEnv({ PORT: { type: 'port', required: true } }, { PORT: '3000' });
assert.strictEqual(value.PORT, 3000);
assert.deepStrictEqual(pkg.parseEnvFile('PORT=3000\\n'), { PORT: '3000' });
`);
  run(process.execPath, ['consumer.cjs'], cjsProject);

  const esmProject = makeProject('esm', tarball);
  fs.writeFileSync(path.join(esmProject, 'consumer.mjs'), `
import assert from 'node:assert/strict';
import pkg, { validateEnv, parseEnvFile } from 'env-saaf';
assert.deepStrictEqual(Object.keys(pkg).sort(), ${JSON.stringify(PUBLIC_EXPORTS)});
assert.strictEqual(typeof validateEnv, 'function');
assert.strictEqual(validateEnv({ PORT: { type: 'port', required: true } }, { PORT: '3000' }).PORT, 3000);
assert.deepStrictEqual(parseEnvFile('PORT=3000\\n'), { PORT: '3000' });
`);
  run(process.execPath, ['consumer.mjs'], esmProject);

  for (const [name, project] of [['cjs', cjsProject], ['esm', esmProject]]) {
    const src = path.join(project, 'src');
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, 'index.js'), 'const port = process.env.PACKAGE_SMOKE_PORT;\\n');
    const bin = path.join(project, 'node_modules', '.bin', process.platform === 'win32' ? 'env-saaf.cmd' : 'env-saaf');
    assert.ok(fs.existsSync(bin), `npm did not install the env-saaf bin for ${name}`);
    const version = run(bin, ['--version'], project, { shell: process.platform === 'win32' });
    assert.match(version.stdout.trim(), /^env-saaf \\d+\\.\\d+\\.\\d+$/);
    const scan = run(bin, ['scan', './src'], project, { shell: process.platform === 'win32' });
    assert.match(scan.stdout, /PACKAGE_SMOKE_PORT/);
  }

  const typeProject = path.join(scratch, 'cjs');
  fs.writeFileSync(path.join(typeProject, 'consumer.ts'), `
import { validateEnv } from 'env-saaf';
const env = validateEnv({ PORT: { type: 'port', required: true } }, { PORT: '3000' });
const port: number = env.PORT;
void port;
`);
  const tsc = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  assert.ok(fs.existsSync(tsc), 'TypeScript must be installed by the repository test setup');
  run(process.execPath, [
    tsc, '--noEmit', '--strict', '--skipLibCheck', '--target', 'es2020',
    '--module', 'commonjs', '--moduleResolution', 'node', 'consumer.ts',
  ], typeProject);

  console.log('Package smoke test passed: tarball contents, CommonJS, ESM, CLI bin, and installed TypeScript declarations.');
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
