export type EnvScalarType = 'string' | 'number' | 'int' | 'bigint' | 'boolean' | 'url' | 'port' | 'email' | 'json' | 'uuid' | 'hex' | 'ipv4' | 'ipv6' | 'semver' | 'base64' | 'date' | 'file' | 'duration' | 'host';
export type EnvType = EnvScalarType | 'array';

export type RequiredIfCondition =
  | { key: string; equals: string | number | boolean | null; in?: never }
  | { key: string; in: Array<string | number | boolean | null>; equals?: never };

export interface EnvRule {
  type?: EnvType;
  required?: boolean;
  /**
   * Make this key required only when another variable matches a condition:
   * `{ key: 'MODE', equals: 'production' }` or `{ key: 'MODE', in: ['staging', 'production'] }`.
   * Evaluated in a second pass after all keys are coerced and defaults are applied,
   * so declaration order in the schema does not matter. When the condition does not hold
   * (or the referenced key is absent), the key stays optional.
   */
  requiredIf?: RequiredIfCondition;
  /**
   * One key or a list of keys that must not be set at the same time as this
   * key (e.g. `'OAUTH_TOKEN_FILE'` or `['DB_HOST', 'DB_PORT']`). Evaluated in
   * a second pass after aliases and defaults are resolved; symmetric even when
   * declared on one side only. Naming an undeclared key or this key itself is
   * rejected up front by `validateSchema`. Inside a group, use full env names.
   */
  conflictsWith?: string | readonly string[];
  /** Human documentation for the variable. Shown in the `generateExample` comment and as the JSON Schema property `description`; it never affects validation. */
  description?: string;
  /** Warn when the variable is set. A string adds a migration note to the warning and generated example. */
  deprecated?: boolean | string;
  /** A default may be an already-parsed object or array for `type: 'json'` or `type: 'array'`, or a `Date` for `type: 'date'`. */
  default?: string | number | bigint | boolean | Date | Record<string, unknown> | unknown[] | null;
  /** Allowed coerced values. Duration choices may also be human duration strings (e.g. '15m'), including for array items. */
  choices?: Array<string | number | bigint | boolean>;
  /**
   * Allowed range for numeric values (`number`, `int`, `bigint`, `port`, `duration`).
   * `min` alone or `max` alone both work; out-of-range values are
   * rejected with an error naming the allowed range. Duration bounds may also
   * be human duration strings (e.g. `min: '30s'`, `max: '1h30m'`), parsed
   * with the same rules as duration values. On `array` rules with
   * `of: 'duration'`, these inclusive bounds apply to each item, including defaults.
   * Use `minItems` / `maxItems` for the array's length. For `date` rules the
   * bounds are ISO date (or datetime) strings instead, e.g. `min: '2026-01-01'`,
   * compared chronologically against the parsed value; a number is rejected
   * up front for `date` rules. For `bigint` rules, use `bigint` bounds
   * (e.g. `min: 9007199254740993n`) so the comparison stays exact.
   */
  min?: number | string | bigint;
  /** See `min`. */
  max?: number | string | bigint;
  /**
   * Allowed length for string values (`string`, `email`, `url`, `file`, `uuid`, `hex`,
   * `ipv4`, `semver`, `base64`, `host`).
   * `minLength` alone or `maxLength` alone both work; a too-short or
   * too-long value is rejected with an error naming the allowed length.
   * Checked after coercion, before `pattern`. Rejected up front on non-string rules.
   */
  minLength?: number;
  /** See `minLength`. */
  maxLength?: number;
  /**
   * Exact length in characters for `hex` values (e.g. a 64-character
   * hash). A wrong-length value is rejected with an error naming the
   * expected length. Ignored for other types.
   */
  length?: number;
  /**
   * Allowed schemes for `url` values (e.g. `['https']`). A value whose
   * scheme is outside the list is rejected with an error naming the
   * allowed schemes. Matching is case-insensitive, and entries may be
   * written with or without a trailing colon. Ignored for other types.
   */
  protocols?: string[];
  /**
   * A RegExp or regular expression source string that a string value
   * (`string`, `email`, `url`, `file`, `uuid`, `hex`, `ipv4`, `semver`,
   * `base64`, `host`) must match. Checked after coercion and `choices`,
   * before `transform`; a mismatch error names the pattern.
   * Strings are compiled without flags. Invalid sources and uses on
   * non-string rules are rejected during schema validation.
   */
  pattern?: RegExp | string;
  /**
   * Custom validation rule run after coercion and built-in checks, before
   * `transform`. Receives the coerced value and the input `env` object.
   * Return `true` (or `undefined`/`null`) to pass, `false` for a generic
   * error, or a non-empty string error message to fail. A thrown error is
   * collected as a validation failure naming the key.
   */
  validate?: (value: any, env: Record<string, string | undefined>) => boolean | string | void | null;
  /**
   * Custom step applied after coercion, built-in checks, and `validate`; its
   * return value must match the rule's declared `type` and is what lands in
   * the result (e.g. normalise case or adjust a number). Runs only on values
   * actually provided, not on `default`s.
   */
  transform?: (value: any) => any;
  /**
   * Whether to trim surrounding whitespace before validation (default
   * true). Set `trim: false` for values where the whitespace is part of
   * the value (e.g. a password with a significant trailing space).
   * Only affects string-like types; numbers and booleans are unaffected.
   */
  trim?: boolean;
  /**
   * Always mask this key's value in validation errors and CLI output, even
   * when its name does not look like a secret (e.g. `SESSION_ID`, `LICENSE_KEY`).
   * Also leaves its placeholder empty in `generateExample`. Default is false.
   */
  sensitive?: boolean;
  /**
   * Item type for `type: 'array'` (default `'string'`). Every split element is
   * coerced and validated as this type; nested `'array'` is not allowed.
   * Ignored for other types.
   */
  of?: EnvScalarType;
  /**
   * Non-empty delimiter string for `type: 'array'` (default `','`).
   * Empty items between or around separators are rejected with their index.
   * Ignored for other types.
   */
  separator?: string;
  /**
   * Minimum / maximum number of items for `type: 'array'` (both
   * non-negative integers; `minItems` must not exceed `maxItems`). A
   * violation reports the key with the count and the bound. Rejected up
   * front on non-`array` rules.
   */
  minItems?: number;
  maxItems?: number;
  /**
   * Reject repeated items for `type: 'array'` (default `false`). Items are
   * compared after coercion, so `'1,01'` for `of: 'int'` counts as a
   * duplicate. Rejected up front on non-`array` rules.
   */
  unique?: boolean;
  /**
   * `array` only: drop empty items after splitting, so a trailing or doubled
   * separator (`a,b,`, `a,,b`) validates to the remaining items instead of
   * failing. `minItems`/`maxItems` count what remains. Default false.
   */
  skipEmpty?: boolean;
  /**
   * Deprecated variable names accepted as fallbacks when this key is unset
   * (e.g. `['OLD_NAME']`). The first populated alias supplies the value and
   * emits a deprecation warning; if the canonical key is also set, the
   * canonical key wins and a warning notes the alias is ignored.
   */
  aliases?: string[];
}

/**
 * A group rule (issue #228): nests a sub-schema under one env prefix.
 * `{ DB: { prefix: 'DB_', schema: { HOST: { type: 'host' } } } }` reads the
 * env var `DB_HOST` and the result nests it as `{ DB: { HOST: '...' } }`.
 * Groups may contain groups; their prefixes concatenate and results nest at
 * each level. A group may not also set `type`.
 * Inside a group, `aliases`, `requiredIf.key` and `conflictsWith` use FULL env var names
 * (e.g. `'OLD_DB_HOST'`, `'NODE_ENV'`, or another group's `'DB_HOST'`).
 */
export interface EnvGroupRule<S extends EnvSchema = EnvSchema> {
  /** Prefix appended to ancestor prefixes before each inner key. */
  prefix: string;
  /** Inner rules keyed by their unprefixed names. The result nests under the group key. */
  schema: S;
}

export type EnvSchema = Record<string, EnvRule | EnvGroupRule>;

type EnvScalarValue<T> =
  T extends 'bigint' ? bigint :
  T extends 'number' | 'int' | 'port' | 'duration' ? number :
  T extends 'boolean' ? boolean :
  T extends 'json' ? unknown :
  T extends 'date' ? Date :
  string;

/**
 * The value type of a rule, from the schema's `type` field:
 * 'number' / 'int' / 'port' / 'duration' -> number, 'bigint' -> bigint, 'boolean' -> boolean,
 * 'json' -> unknown (parsed JSON can be any shape), 'date' -> Date,
 * 'array' -> array of the `of` item type (default `string[]`),
 * everything else (string / url / file / email / uuid / hex / ipv4 / semver / base64
 * / host / no type given) -> string.
 * A rule with a `transform` returns the transform's return type instead.
 */
export type EnvValue<R extends EnvRule> =
  R extends { transform: (value: any) => infer T } ? T :
  R extends { type: 'array'; of: infer O } ? EnvScalarValue<O>[] :
  R extends { type: 'array' } ? string[] :
  R extends { type: 'bigint' } ? bigint :
  R extends { type: 'number' } ? number :
  R extends { type: 'int' } ? number :
  R extends { type: 'port' } ? number :
  R extends { type: 'duration' } ? number :
  R extends { type: 'boolean' } ? boolean :
  R extends { type: 'json' } ? unknown :
  R extends { type: 'date' } ? Date :
  string;

/**
 * The return type of `validateEnv` — inferred from the schema.
 * A key with `required: true` or a `default` is always present;
 * the other keys are optional (`| undefined`), because validateEnv
 * omits missing keys from the result entirely.
 * Pass the schema inline to validateEnv(...) (or use `as const`)
 * so TypeScript can see the literal types.
 * If the schema already has a loose type (such as `EnvSchema`), the
 * result falls back to `Record<string, string | number | boolean>`.
 */
export type EnvResult<S extends EnvSchema> = string extends keyof S
  ? Record<string, string | number | boolean>
  : {
      [K in keyof S as S[K] extends EnvGroupRule<infer _I>
        ? never
        : S[K] extends { required: true } ? K : S[K] extends { default: unknown } ? K : never]: EnvValue<Extract<S[K], EnvRule>>;
    } & {
      [K in keyof S as S[K] extends EnvGroupRule<infer I>
        ? K
        : S[K] extends { required: true } ? never : S[K] extends { default: unknown } ? never : K]?: S[K] extends EnvGroupRule<infer I> ? EnvResult<I> | undefined : EnvValue<Extract<S[K], EnvRule>> | undefined;
    };

/**
 * Structured form of one validation diagnostic (issue #294). `key` is the full
 * env name the message is about, or `''` for errors that are not tied to a key
 * (e.g. an unknown option). `message` is the printable text without the
 * `key: ` prefix, so it is safe to translate or map back to a form field.
 * When `loadEnv` / `loadEnvAsync` report a bad value that came from a file,
 * `source` is that file path (issue #350); ambient and `validateEnv`-only
 * diagnostics omit the field.
 */
export interface ErrorDetail {
  key: string;
  message: string;
  /** Winning `.env` path when the bad value came from a loaded file. */
  source?: string;
}

export class EnvSaafError extends Error {
  errors: string[];
  /** The same diagnostics as `errors`, in the same order, split by key. */
  details: ErrorDetail[];
}

/** Context passed to `formatError`: only the schema keys, never values. */
export interface FormatErrorContext {
  readonly keys: readonly string[];
}

type ValidationRuleInput<S extends EnvSchema> = string extends keyof S
  ? Record<string, any>
  : Readonly<EnvResult<S>>;

/**
 * Schema-level cross-field validation hook (issue #346). Receives the frozen,
 * coerced result object when earlier checks produced no errors, and returns an
 * error string, a list of error strings, or nothing (`undefined`, `null`, `''`,
 * `[]`).
 */
export type ValidationRule<S extends EnvSchema = EnvSchema> = (
  env: ValidationRuleInput<S>
) => string | readonly string[] | void | null | undefined;

export interface ValidateOptions<S extends EnvSchema = EnvSchema> {
  /** Report variables that are set but not in the schema (default false). */
  strict?: boolean;
  /**
   * Throw an `EnvSaafError` when a value fails validation (default true).
   * Pass `false` to get `{ env, errors }` back instead of an exception
   * (issue #55). A malformed schema still throws: that is a bug in the code,
   * not a problem in the environment.
   */
  throwOnError?: boolean;
  /**
   * Callback invoked for each deprecation or ignored-alias warning (default `console.warn`).
   * Pass a custom logger (or `() => {}` to silence warnings).
   */
  onWarn?: (message: string) => void;
  /**
   * Opt-in formatter for the thrown `EnvSaafError`'s `message` (issue #231).
   * Receives a read-only copy of the raw per-key error strings and
   * `{ keys }` (the schema keys). A returned string becomes `error.message`;
   * `error.errors` is unchanged. A hook that throws or returns a non-string
   * falls back to the default message. Not called with `throwOnError: false`
   * (no error is thrown, and `errors` stays raw) or for malformed schemas.
   */
  formatError?: (errors: readonly string[], context: FormatErrorContext) => string;
  /**
   * Optional cross-field validation hook or list of hooks (issue #346).
   * Runs only when earlier checks (`strict`, per-key coercion and constraints,
   * `conflictsWith`, and `requiredIf`) produced no errors, so hooks always
   * inspect a complete, frozen `EnvResult<S>` snapshot with coerced values.
   * Return a non-empty string or an array of strings to report validation
   * errors, or nothing (`undefined`, `null`, `''`, `[]`) to pass.
   */
  rules?: ValidationRule<S> | readonly ValidationRule<S>[];
}

/** The result of `validateEnv(..., { throwOnError: false })`. */
export interface ValidateResult<S extends EnvSchema> {
  /** Every value that validated — the same object the throwing API returns. */
  env: EnvResult<S>;
  /** The same messages `EnvSaafError.errors` would carry, in the same order. */
  errors: string[];
  /** The same diagnostics as `errors`, in the same order, split by key. */
  details: ErrorDetail[];
}

/**
 * Validate the shape of the schema itself (types, option shapes, alias
 * conflicts, and — since #228 — group rules: `prefix`/`schema` shape,
 * circular references, and prefix collisions). Throws an `EnvSaafError` listing every
 * problem, naming the key (grouped rules use their full env name, e.g.
 * `DB_HOST`). Independent of any env values, so it can run at startup.
 */
export function validateSchema(schema: EnvSchema): void;
export function validateEnv<S extends EnvSchema>(schema: S, env: Record<string, string | undefined> | undefined, options: ValidateOptions<S> & { throwOnError: false }): ValidateResult<S>;
export function validateEnv<S extends EnvSchema>(schema: S, env?: Record<string, string | undefined>, options?: ValidateOptions<S>): EnvResult<S>;

export interface LoadEnvOptions<S extends EnvSchema = EnvSchema> {
  /** One file, or several files in order (later files win). */
  path?: string | string[];
  /** Alias for passing several files at once. */
  paths?: string[];
  env?: Record<string, string | undefined>;
  override?: boolean;
  assign?: boolean;
  /** Passed through to validateEnv (e.g. strict: true). */
  strict?: boolean;
  /** Passed through to validateEnv (e.g. custom logger for alias warnings). */
  onWarn?: (message: string) => void;
  /** Passed through to validateEnv (custom `EnvSaafError` message). */
  formatError?: (errors: readonly string[], context: FormatErrorContext) => string;
  /** Passed through to validateEnv (schema-level cross-field validation rules). */
  rules?: ValidationRule<S> | readonly ValidationRule<S>[];
}

export function loadEnv<S extends EnvSchema>(schema: S, options?: LoadEnvOptions<S>): EnvResult<S>;
export function loadEnvAsync<S extends EnvSchema>(schema: S, options?: LoadEnvOptions<S>): Promise<EnvResult<S>>;
/**
 * Parse `.env` text into `{ KEY: value }`, handling quotes, `export `, inline
 * comments, multiline quoted values, and static `${VAR}` parameter expansion
 * (`${VAR}`, `${VAR:-default}`, `${VAR-default}`, `${VAR:?message}`,
 * `${VAR?message}`, `${VAR:+alt}`, `${VAR+alt}`).
 */
export function parseEnvFile(text: string): Record<string, string>;
/**
 * Find every env read in JS/TS source text — `process.env.KEY`,
 * `process.env?.KEY` (optional chaining), bracket/template forms and
 * destructuring, plus the Vite-style `import.meta.env` equivalents.
 * Mentions inside comments and string literals do not count.
 */
export function scanCode(text: string): string[];
/** One reported use of an env key (relative `file`, 1-based `line`). */
export interface ScanLocation {
  file: string;
  line: number;
}
/**
 * Same reads as `scanCode`, plus a `locations` map from each key to its uses.
 * `file` defaults to `-` for piped / in-memory text (issue #335).
 */
export function scanCodeLocations(
  text: string,
  file?: string,
): { vars: string[]; locations: Record<string, ScanLocation[]> };
export function scanDir(dir: string): string[];
/**
 * Directory scan with a `locations` map. Paths are relative to `dir` with
 * forward slashes; `vars` matches `scanDir` (issue #335).
 */
export function scanDirLocations(
  dir: string,
): { vars: string[]; locations: Record<string, ScanLocation[]> };
export function diffEnv(usedKeys: string[], documentedKeys: string[]): { usedNotDocumented: string[]; documentedNotUsed: string[] };
/** Mask strings only; return non-string values unchanged. */
export function maskValue<T>(value: T): T extends string ? string : T;
/** The masked counterpart of `T`: strings are masked, other leaves keep their type. */
export type Masked<T> = T extends readonly unknown[]
  ? { [K in keyof T]: Masked<T[K]> }
  : T extends Date | RegExp | ((...args: never[]) => unknown)
    ? T
    : T extends object
      ? { [K in keyof T]: Masked<T[K]> }
      : T extends string ? string : T;
export function maskSecrets<T extends Record<string, unknown>>(obj: T): { [K in keyof T]: Masked<T[K]> };
/**
 * Generate `.env.example` text from a schema. Values are placeholders/defaults
 * only — never real secrets. Array rules get example items of their `of` type
 * (`1,2,3` for `int`, `3000,8080,5432` for `port`, ...), sized to fit
 * `minItems`/`maxItems` and joined by `separator`, so the output validates
 * against the schema it was generated from.
 */
export function generateExample(schema: EnvSchema): string;

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface JsonSchemaProperty {
  type?: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object';
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  format?: 'uri' | 'email' | 'uuid' | 'ipv4' | 'ipv6' | 'hostname' | 'date' | 'date-time';
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  const?: JsonPrimitive;
  enum?: JsonPrimitive[];
  default?: JsonValue;
  items?: JsonSchemaProperty;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  anyOf?: JsonSchemaProperty[];
  allOf?: JsonSchemaProperty[];
  if?: JsonSchemaProperty;
  then?: JsonSchemaProperty;
}

export interface JsonSchema extends JsonSchemaProperty {
  $schema: 'https://json-schema.org/draft/2020-12/schema';
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
}

/** Describe coerced values as a draft 2020-12 JSON Schema without reading the environment. */
export function toJsonSchema(schema: EnvSchema): JsonSchema;
