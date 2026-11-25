// env-saaf type tests — sirf `tsc` se check hote hain (`npm test` me shamil).
// Runtime me kuch nahi chalta: ye file sirf TypeScript inference verify karti hai.
// Issue #7: validateEnv ka return type schema se infer hona chahiye.
import { loadEnvAsync, validateEnv, loadEnv, EnvSchema, EnvResult, maskValue, maskSecrets, Masked, toJsonSchema } from './index';

const env = validateEnv({
  PORT: { type: 'port', required: true },
  COUNT: { type: 'number', required: true },
  DEBUG: { type: 'boolean' },
  API_URL: { type: 'url', required: true },
  CONFIG_FILE: { type: 'file', required: true },
  MODE: { type: 'string', default: 'dev' },
  NAME: { type: 'string' },
  TENANT_ID: { type: 'uuid', required: true },
  API_HASH: { type: 'hex', sensitive: true },
  TAGS: { type: 'array', required: true },
  PORTS: { type: 'array', of: 'port', separator: ';', required: true },
  ORIGINS: { type: 'array', of: 'url', protocols: ['https'] },
  FLAGS: { type: 'array', of: 'boolean', default: [true, false] },
});

// required keys: exact types
const port: number = env.PORT;
const count: number = env.COUNT;
const url: string = env.API_URL;
export const configFile: string = env.CONFIG_FILE;
const mode: string = env.MODE;
// uuid and hex values are strings
const tenantId: string = env.TENANT_ID;
const apiHash: string | undefined = env.API_HASH;
// array values infer their element type from `of` (default string[])
const tags: string[] = env.TAGS;
const ports: number[] = env.PORTS;
const origins: string[] | undefined = env.ORIGINS;
const flags: boolean[] = env.FLAGS;
// optional keys: value ya undefined
const debug: boolean | undefined = env.DEBUG;
const name: string | undefined = env.NAME;

// number methods chalne chahiye (issue #7 ka asli gap)
const doubled: number = env.PORT * 2;
const fixed: string = env.COUNT.toFixed(0);

// EnvResult seedha bhi use ho sakta hai
type MyEnv = EnvResult<{ PORT: { type: 'port'; required: true }; DEBUG: { type: 'boolean' } }>;
const myPort: number = null as unknown as MyEnv['PORT'];
const myDebug: boolean | undefined = null as unknown as MyEnv['DEBUG'];

// @ts-expect-error — PORT number hai, string nahi
const wrongType: string = env.PORT;
// @ts-expect-error — galat key: schema me nahi hai
const typo = env.TYPO_KEY;
// @ts-expect-error — optional key undefined ho sakti hai, seedha boolean nahi
const debugStrict: boolean = env.DEBUG;
// @ts-expect-error — PORTS is number[], not string[]
const wrongPorts: string[] = env.PORTS;

// loose schema (jaise EnvSchema type ka variable) par purana loose record milta hai
const looseSchema: EnvSchema = { PORT: { type: 'port', required: true } };
const loose = validateEnv(looseSchema);
const looseValue: string | number | boolean = loose.ANYTHING;

// Issue #55: non-throwing mode returns { env, errors } instead of throwing.
const collected = validateEnv(
  { PORT: { type: 'port', required: true }, DEBUG: { type: 'boolean' } },
  { PORT: '3000' },
  { throwOnError: false }
);
const collectedPort: number = collected.env.PORT;
const collectedDebug: boolean | undefined = collected.env.DEBUG;
const collectedErrors: string[] = collected.errors;
// Issue #294: structured details mirror errors one-to-one.
const collectedDetails: { key: string; message: string }[] = collected.details;
const firstKey: string = collected.details[0].key;
const firstMessage: string = collected.details[0].message;
// @ts-expect-error — details keys are strings, not numbers
const wrongDetailKey: number = collected.details[0].key;
// @ts-expect-error — the non-throwing result is { env, errors, details }, not the env itself
const collectedAsEnv: number = collected.PORT;

// Issue #294: thrown errors carry the same details field.
declare const thrownError: import('./index').EnvSaafError;
const thrownDetails: import('./index').ErrorDetail[] = thrownError.details;

// The default (throwing) return type is unchanged by the new option.
const throwingPort: number = validateEnv(
  { PORT: { type: 'port', required: true } },
  { PORT: '3000' },
  { strict: true }
).PORT;

// Issue #51: requiredIf — conditionally required keys remain optional in the inferred type.
const condEnv = validateEnv(
  {
    MODE: { type: 'string', default: 'development' },
    USE_TLS: { type: 'boolean', default: false },
    SENTRY_DSN: { type: 'url', requiredIf: { key: 'MODE', equals: 'production' } },
    ALERT_WEBHOOK: { type: 'url', requiredIf: { key: 'MODE', in: ['staging', 'production'] } },
    TLS_CERT: { type: 'string', requiredIf: { key: 'USE_TLS', equals: true } },
    FALLBACK_DSN: { type: 'url', default: 'https://example.com', requiredIf: { key: 'MODE', equals: 'production' } },
  },
  { MODE: 'development' }
);
const condSentry: string | undefined = condEnv.SENTRY_DSN;
const condAlert: string | undefined = condEnv.ALERT_WEBHOOK;
const condTls: string | undefined = condEnv.TLS_CERT;
const condFallback: string = condEnv.FALLBACK_DSN;
// @ts-expect-error — conditionally required key without default may be undefined
const condSentryStrict: string = condEnv.SENTRY_DSN;

validateEnv({
  // @ts-expect-error — requiredIf must specify either equals or in, not both
  BAD_BOTH: { type: 'string', requiredIf: { key: 'MODE', equals: 'prod', in: ['prod'] } },
});
validateEnv({
  // @ts-expect-error — requiredIf must specify equals or in
  BAD_NEITHER: { type: 'string', requiredIf: { key: 'MODE' } },
});
// Issue #53: aliases and onWarn keep exact return type inference on canonical keys.
const aliasedWarnings: string[] = [];
const aliased = validateEnv(
  {
    DATABASE_URL: { type: 'url', required: true, aliases: ['DB_URL'] },
    PORT: { type: 'port', aliases: ['APP_PORT'] },
  },
  { DB_URL: 'https://example.com' },
  { onWarn: (msg) => aliasedWarnings.push(msg) }
);
const aliasedUrl: string = aliased.DATABASE_URL;
const aliasedPort: number | undefined = aliased.PORT;
// @ts-expect-error — alias name is not a key on the validated result
const aliasKey = aliased.DB_URL;


// Issue #52: per-key `validate(value, env)` preserves inferred value types.
const validated = validateEnv(
  {
    APP_PORT: { type: 'port', required: true, validate: (v) => v >= 1024 || 'must be unprivileged' },
    REPLICA_HOST: { type: 'host', required: true, validate: (v, e) => v !== e.PRIMARY_HOST || 'must differ from PRIMARY_HOST' },
    FLAG: { type: 'boolean', default: false, validate: (v) => typeof v === 'boolean' },
    NOTES: { type: 'string', validate: () => { /* void return passes */ } },
  },
  { APP_PORT: '8080', REPLICA_HOST: 'replica.internal', PRIMARY_HOST: 'primary.internal' }
);
const validatedPort: number = validated.APP_PORT;
const validatedHost: string = validated.REPLICA_HOST;
const validatedFlag: boolean = validated.FLAG;
const validatedNotes: string | undefined = validated.NOTES;

// Issue #346: cross-field hooks receive schema-inferred, already-coerced values.
const crossFieldTyped = validateEnv({
  CACHE_TTL: { type: 'duration', required: true },
  SESSION_TTL: { type: 'duration', required: true },
}, { CACHE_TTL: '30s', SESSION_TTL: '2m' }, {
  rules: values => {
    const cacheTtl: number = values.CACHE_TTL;
    const sessionTtl: number = values.SESSION_TTL;
    return cacheTtl < sessionTtl ? undefined : 'CACHE_TTL must be smaller';
  },
});
const crossFieldTypedTtl: number = crossFieldTyped.CACHE_TTL;
const loadedWithCrossFieldRule: number = loadEnv(
  { PORT: { type: 'port', required: true } },
  { path: '.env', rules: values => {
    const port: number = values.PORT;
    return port > 0 ? undefined : 'PORT must be positive';
  } },
).PORT;
const asyncCrossFieldRule: Promise<number> = loadEnvAsync(
  { PORT: { type: 'port', required: true } },
  { path: '.env', rules: [values => values.PORT > 0 ? undefined : 'PORT must be positive'] },
).then(values => values.PORT);
// @ts-expect-error schema-level hooks must return strings or nothing
validateEnv({ PORT: { type: 'port' } }, { PORT: '3000' }, { rules: () => 123 });

// Issue #286: both pattern forms preserve inferred string result types.
const patterned = validateEnv({
  NAME: { pattern: '^[A-Z]+$', required: true },
  MODE: { type: 'string', pattern: /^prod$/i },
});
const patternedName: string = patterned.NAME;
const patternedMode: string | undefined = patterned.MODE;
void patternedName; void patternedMode;
// @ts-expect-error pattern is either a string or a RegExp
validateEnv({ BAD_PATTERN: { pattern: 123 } });

// Issue #228: group rules nest in the inferred result type.
import { EnvGroupRule } from './index';

const grouped = validateEnv({
  DB: {
    prefix: 'DB_',
    schema: {
      HOST: { type: 'host', required: true, pattern: '^db\\.' },
      PORT: { type: 'port', default: 5432 },
      USER: { type: 'string' },
    },
  },
  NAME: { type: 'string' },
});

// the group key is optional (present when at least one inner key validated)
const dbGroup = grouped.DB;
if (dbGroup) {
  const gHost: string = dbGroup.HOST; // required inner rule -> always present inside the group
  const gPort: number = dbGroup.PORT; // default inner rule -> number
  const gUser: string | undefined = dbGroup.USER; // optional inner rule
  void gHost; void gPort; void gUser;
}
const groupedName: string | undefined = grouped.NAME;
void groupedName;

// a group rule is assignable to EnvSchema via EnvGroupRule
const groupRule: EnvGroupRule = { prefix: 'X_', schema: { A: { type: 'string' } } };
void groupRule;

// Issue #287: inference follows every nested group, retaining optional containers.
const nestedGroups = validateEnv({ APP: { prefix: 'APP_', schema: {
  DB: { prefix: 'DB_', schema: {
    PORT: { type: 'port', default: 5432 },
    AUTH: { prefix: 'AUTH_', schema: {
      USER: { type: 'string', required: true },
      ENABLED: { type: 'boolean' },
    } },
  } },
} } });
const nestedPort: number | undefined = nestedGroups.APP?.DB?.PORT;
const nestedUser: string | undefined = nestedGroups.APP?.DB?.AUTH?.USER;
const nestedEnabled: boolean | undefined = nestedGroups.APP?.DB?.AUTH?.ENABLED;
void nestedPort; void nestedUser; void nestedEnabled;
// @ts-expect-error port values remain numbers inside nested groups
const invalidNestedPort: string | undefined = nestedGroups.APP?.DB?.PORT;
void invalidNestedPort;
const nestedRule: EnvGroupRule = { prefix: 'APP_', schema: {
  DB: { prefix: 'DB_', schema: { PORT: { type: 'port' } } },
} };
void nestedRule;
// Issue #281: maskSecrets keeps shape and non-string leaf types.
const masked = maskSecrets({
  KEY: 'sk_live_123456',
  DB: { PASSWORD: 'hunter2', PORT: 5432 },
  TAGS: ['a', 'b'],
  NESTED: { LIST: [{ TOKEN: 'abcdef' }] },
  WHEN: new Date(),
});
const maskedKey: string = masked.KEY;
const maskedDbPassword: string = masked.DB.PASSWORD;
const maskedDbPort: number = masked.DB.PORT;
const maskedTags: string[] = masked.TAGS;
const maskedNestedToken: string = masked.NESTED.LIST[0].TOKEN;
const maskedWhen: Date = masked.WHEN;
// Masked<T> works standalone too.
const manual: Masked<{ A: number; B: { C: string[] } }> = { A: 42, B: { C: ['****'] } };

// Issue #229: the export takes an env-saaf schema and returns typed keywords.
const jsonSchema = toJsonSchema({ PORT: { type: 'port', default: 0 }, NAME: { pattern: '^[A-Z]+$' } });
const schemaType: 'object' = jsonSchema.type;
const minimumPort: number | undefined = jsonSchema.properties.PORT.minimum;
const requiredKeys: string[] | undefined = jsonSchema.required;
const discriminator: string | number | boolean | null | undefined = jsonSchema.if?.properties?.MODE.const;
const conditionalKeys: string[] | undefined = jsonSchema.then?.required;
const groupConditionKeys: string[] | undefined = jsonSchema.allOf?.[0].then?.properties?.APP.required;
toJsonSchema({
  DATA: { type: 'json' },
  A: { requiredIf: { key: 'DATA', equals: null } },
  B: { requiredIf: { key: 'DATA', in: [true, null] } },
});
// @ts-expect-error — schema bounds are numbers, not strings
const badBound: string = jsonSchema.properties.PORT.minimum;
// @ts-expect-error — accepts env-saaf rules, not a JSON Schema document
toJsonSchema({ PORT: { type: 'integer', minimum: 0 } });

export { port, count, url, mode, debug, name, doubled, fixed, wrongType, typo, debugStrict, myPort, myDebug, looseValue, tenantId, apiHash, collectedPort, collectedDebug, collectedErrors, collectedAsEnv, throwingPort, condSentry, condAlert, condTls, condFallback, condSentryStrict, validatedPort, validatedHost, validatedFlag, validatedNotes, wrongPorts, tags, ports, origins, flags, aliasedUrl, aliasedPort, aliasKey, maskedKey, maskedDbPassword, maskedDbPort, maskedTags, maskedNestedToken, maskedWhen, manual };

const asyncConfig: Promise<{ PORT: number }> = loadEnvAsync(
  { PORT: { type: 'port', required: true } },
  { paths: ['.env', '.env.local'], env: {}, assign: true, override: true, formatError: (errors) => errors.join('; ') }
);
void asyncConfig;
// Issue #231: formatError receives readonly errors and { keys }, returns a string.
validateEnv({ PORT: { type: 'port' } }, {}, {
  formatError: (errors, context) => `${errors.length} problems in ${context.keys.join(', ')}`,
});
loadEnv({ PORT: { type: 'port' } }, { formatError: (errors) => errors.join('; ') });
// @ts-expect-error formatError must return a string
validateEnv({ PORT: { type: 'port' } }, {}, { formatError: () => 1 });

// Duration string bounds retain the numeric result type.
const boundedDuration = validateEnv({ TIMEOUT: { type: 'duration', min: '30s', max: '1h30m', required: true } });
const boundedMilliseconds: number = boundedDuration.TIMEOUT;

// Non-string inputs retain their types, including optional and mixed values.
const keptNumber: number = maskValue(42);
const keptUndefined: undefined = maskValue(undefined);
const keptDate: Date = maskValue(new Date());
const mixedInput = {} as { optional?: string; values: [string, number, boolean, null, undefined, bigint]; date: Date; rx: RegExp };
const mixedMasked = maskSecrets(mixedInput);
const optionalMasked: string | undefined = mixedMasked.optional;
const tupleMasked: [string, number, boolean, null, undefined, bigint] = mixedMasked.values;
const dateMasked: Date = mixedMasked.date;
const regexpMasked: RegExp = mixedMasked.rx;
const mixedValue: string | number = maskValue({} as string | number);
// @ts-expect-error numbers are no longer stringified
const notString: string = maskValue(42);
void [keptNumber, keptUndefined, keptDate, optionalMasked, tupleMasked, dateMasked, regexpMasked, mixedValue, notString];

// Issue #345: `conflictsWith` accepts a single key or a string/readonly-tuple list while keeping inferred return types.
const exclusiveEnv = validateEnv({
  API_KEY: { type: 'string', conflictsWith: 'OAUTH_TOKEN_FILE' },
  OAUTH_TOKEN_FILE: { type: 'file' },
  DATABASE_URL: { type: 'url', conflictsWith: ['DB_HOST', 'DB_PORT'] },
  DB: {
    prefix: 'DB_',
    schema: {
      HOST: { type: 'host', conflictsWith: 'DATABASE_URL' },
      PORT: { type: 'port', default: 5432 },
    },
  },
} as const, {});
const exApiKey: string | undefined = exclusiveEnv.API_KEY;
const exOauthFile: string | undefined = exclusiveEnv.OAUTH_TOKEN_FILE;
const exDbUrl: string | undefined = exclusiveEnv.DATABASE_URL;
const exDbPort: number | undefined = exclusiveEnv.DB?.PORT;
// @ts-expect-error conflictsWith must be a string or string list
validateEnv({ A: { conflictsWith: 123 } });
// @ts-expect-error conflictsWith list entries must be strings
validateEnv({ A: { conflictsWith: [123] } });
void [exApiKey, exOauthFile, exDbUrl, exDbPort];
