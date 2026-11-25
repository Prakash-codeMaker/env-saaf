'use strict';
// Issue #419: seeded property tests for validateEnv's coercion and generated examples.
// Keep this dependency-free and deterministic so every failure can be reproduced
// from the seed printed alongside its schema and input.
const assert = require('node:assert');
const { generateExample, parseEnvFile, validateEnv } = require('./index');

const SEEDS = Array.from({ length: 120 }, (_, i) => i + 1);
const SCALAR_TYPES = [
  'string', 'email', 'number', 'int', 'json', 'boolean', 'url', 'file', 'uuid', 'hex',
  'ipv4', 'ipv6', 'semver', 'base64', 'port', 'date', 'duration', 'host',
];
const STRING_TYPES = new Set([
  'string', 'email', 'url', 'file', 'uuid', 'hex', 'ipv4', 'ipv6', 'semver', 'base64', 'host',
]);
const NUMERIC_TYPES = new Set(['number', 'int', 'port', 'duration']);

/** mulberry32: small deterministic PRNG, matching the scanCode fuzz suite. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (random, values) => values[Math.floor(random() * values.length)];

function valueFor(type, seed) {
  switch (type) {
    case 'string': return `value-${seed}`;
    case 'email': return `user${seed}@example.test`;
    case 'number': return `${seed}.25`;
    case 'int': return String(seed * 7);
    case 'json': return JSON.stringify({ seed, enabled: seed % 2 === 0 });
    case 'boolean': return seed % 2 === 0 ? 'true' : 'false';
    case 'url': return `https://example.test/service/${seed}`;
    case 'file': return __filename;
    case 'uuid': return `00000000-0000-4000-8000-${String(seed).padStart(12, '0')}`;
    case 'hex': return seed.toString(16).padStart(4, '0');
    case 'ipv4': return `10.${seed % 250}.${(seed * 3) % 250}.${(seed * 7) % 250}`;
    case 'ipv6': return `2001:db8::${seed.toString(16)}`;
    case 'semver': return `${(seed % 8) + 1}.${seed % 20}.${seed % 30}`;
    case 'base64': return Buffer.from(`seed-${seed}`).toString('base64');
    case 'port': return String(seed % 65536);
    case 'date': return `2026-01-${String((seed % 28) + 1).padStart(2, '0')}`;
    case 'duration': return `${seed + 1}ms`;
    case 'host': return `node-${seed}.example.test`;
    default: throw new Error(`No value generator for ${type}`);
  }
}

function makeRule(type, value, seed) {
  const rule = { type };
  if (STRING_TYPES.has(type)) {
    rule.trim = seed % 2 === 0;
    rule.minLength = 1;
    rule.maxLength = Math.max(64, String(value).length + 1);
  }
  if (NUMERIC_TYPES.has(type)) {
    rule.min = 0;
    rule.max = type === 'duration' ? 100000 : 100000;
  }
  return rule;
}

function assertAcceptedTwice(schema, env, context) {
  const first = validateEnv(schema, env, { throwOnError: false });
  assert.deepStrictEqual(first.errors, [], `generated value was rejected\n${context}`);
  const second = validateEnv(schema, first.env, { throwOnError: false });
  assert.deepStrictEqual(second.errors, [], `coerced value was not accepted again\n${context}`);
  assert.deepStrictEqual(second.env, first.env, `coercion was not idempotent\n${context}`);
}

// 1. A value accepted by any scalar type remains accepted after coercion.
let scalarCases = 0;
for (const seed of SEEDS) {
  const type = SCALAR_TYPES[(seed - 1) % SCALAR_TYPES.length];
  const key = `FUZZ_${type.toUpperCase()}_${seed}`;
  const value = valueFor(type, seed);
  const rule = makeRule(type, value, seed);
  const schema = { [key]: rule };
  assertAcceptedTwice(schema, { [key]: value }, `seed ${seed}\ntype: ${type}\nvalue: ${value}`);
  scalarCases++;
}

// 2. Array coercion is idempotent for scalar item types, including parsed JSON and Date values.
let arrayCases = 0;
for (const seed of SEEDS) {
  const random = rng(seed + 9000);
  const of = SCALAR_TYPES[(seed - 1) % SCALAR_TYPES.length];
  const key = `FUZZ_ARRAY_${of.toUpperCase()}_${seed}`;
  const first = valueFor(of, seed);
  const second = valueFor(of, seed + 1);
  const separator = pick(random, ['|', ';']);
  const value = `${first}${separator}${second}`;
  const schema = { [key]: { type: 'array', of, separator, minItems: 1, maxItems: 3 } };
  assertAcceptedTwice(schema, { [key]: value }, `seed ${seed}\ntype: array of ${of}\nvalue: ${value}`);
  arrayCases++;
}

// 3. Every generated example should be parseable and valid for its own rule.
let exampleCases = 0;
for (const type of SCALAR_TYPES) {
  const key = `EXAMPLE_${type.toUpperCase()}`;
  const rule = type === 'file' ? { type, default: __filename } : { type };
  const schema = { [key]: rule };
  const example = generateExample(schema);
  const parsed = parseEnvFile(example);
  const checked = validateEnv(schema, parsed, { throwOnError: false });
  assert.deepStrictEqual(checked.errors, [], `generated example failed for ${type}\n${example}`);
  exampleCases++;
}
for (const of of SCALAR_TYPES) {
  const key = `EXAMPLE_ARRAY_${of.toUpperCase()}`;
  const rule = of === 'file'
    ? { type: 'array', of, default: [__filename] }
    : { type: 'array', of };
  const schema = { [key]: rule };
  const example = generateExample(schema);
  const parsed = parseEnvFile(example);
  const checked = validateEnv(schema, parsed, { throwOnError: false });
  assert.deepStrictEqual(checked.errors, [], `generated array example failed for ${of}\n${example}`);
  exampleCases++;
}

// 4. Sensitive failures identify the key but never echo the supplied raw value.
const INVALID = {
  string: seed => `secret-value-${seed}`,
  email: seed => `not-an-email-${seed}`,
  number: seed => `not-a-number-${seed}`,
  int: seed => `1.5-${seed}`,
  json: seed => `{invalid-${seed}`,
  boolean: seed => `maybe-${seed}`,
  url: seed => `not a url ${seed}`,
  file: seed => `${__filename}.missing-${seed}`,
  uuid: seed => `not-a-uuid-${seed}`,
  hex: seed => `not-hex-${seed}`,
  ipv4: seed => '256.1.1.1',
  ipv6: seed => `not-ipv6-${seed}`,
  semver: seed => `v?.${seed}`,
  base64: seed => `!!invalid-${seed}`,
  port: seed => '70000',
  date: seed => '2026-02-30',
  duration: seed => `not-a-duration-${seed}`,
  host: seed => `https://not-a-host-${seed}`,
};
let sensitiveCases = 0;
for (const seed of SEEDS) {
  const type = SCALAR_TYPES[(seed - 1) % SCALAR_TYPES.length];
  const key = `SENSITIVE_${type.toUpperCase()}_${seed}`;
  const raw = INVALID[type](seed);
  const rule = { type, sensitive: true };
  if (type === 'string') rule.pattern = '^expected-only$';
  const checked = validateEnv({ [key]: rule }, { [key]: raw }, { throwOnError: false });
  const diagnostics = JSON.stringify({ errors: checked.errors, details: checked.details });
  assert.ok(checked.errors.length > 0, `invalid ${type} value unexpectedly passed`);
  assert.ok(checked.errors.some(message => message.startsWith(key)), `error did not name ${key}`);
  assert.ok(!diagnostics.includes(raw), `sensitive ${type} value leaked\n${diagnostics}`);
  sensitiveCases++;
}
for (const seed of SEEDS) {
  const key = `SENSITIVE_ARRAY_${seed}`;
  const raw = `not-a-number-secret-${seed}`;
  const checked = validateEnv(
    { [key]: { type: 'array', of: 'number', sensitive: true } },
    { [key]: raw },
    { throwOnError: false }
  );
  const diagnostics = JSON.stringify({ errors: checked.errors, details: checked.details });
  assert.ok(checked.errors.length > 0, 'invalid sensitive array item unexpectedly passed');
  assert.ok(checked.errors.some(message => message.startsWith(key)), `error did not name ${key}`);
  assert.ok(!diagnostics.includes(raw), `sensitive array value leaked\n${diagnostics}`);
  sensitiveCases++;
}

// 5. Numeric examples constrained by min/max never leave the requested interval.
const BOUNDED_TYPES = ['number', 'int', 'port', 'duration'];
let boundedCases = 0;
for (const seed of SEEDS) {
  const type = BOUNDED_TYPES[(seed - 1) % BOUNDED_TYPES.length];
  const min = type === 'duration' ? seed * 1000 : seed;
  const max = min + (type === 'duration' ? 10000 : 10);
  const key = `BOUNDED_${type.toUpperCase()}_${seed}`;
  const schema = { [key]: { type, min, max } };
  const example = generateExample(schema);
  const parsed = parseEnvFile(example);
  const checked = validateEnv(schema, parsed, { throwOnError: false });
  assert.deepStrictEqual(checked.errors, [], `bounded generated example failed\n${example}`);
  assert.ok(checked.env[key] >= min, `${type} example below min ${min}: ${checked.env[key]}`);
  assert.ok(checked.env[key] <= max, `${type} example above max ${max}: ${checked.env[key]}`);
  boundedCases++;
}

console.log(
  `test-validate-fuzz.js: ${scalarCases} scalar, ${arrayCases} array, ${exampleCases} examples, `
  + `${sensitiveCases} sensitive, ${boundedCases} bounded cases; all invariants held`
);
