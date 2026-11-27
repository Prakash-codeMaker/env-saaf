# env-saaf

Node.js के लिए zero-dependency environment variable validator। Startup पर ही साफ़ errors के साथ fail हो जाइए, और बदले में **typed** values पाइए।

[![npm version](https://img.shields.io/npm/v/env-saaf.svg)](https://www.npmjs.com/package/env-saaf) [![npm downloads](https://img.shields.io/npm/dm/env-saaf.svg)](https://www.npmjs.com/package/env-saaf) [![GitHub stars](https://img.shields.io/github/stars/abhi478jeetur-rgb/env-saaf.svg)](https://github.com/abhi478jeetur-rgb/env-saaf/stargazers) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/abhi478jeetur-rgb/env-saaf/blob/main/LICENSE)

**अन्य भाषाओं में पढ़ें:** [English](README.md) · [Español](README.es.md) · [Português](README.pt-BR.md) · [简体中文](README.zh-CN.md)

## समस्या

असल developers की दिक्कतों पर हुई research दिखाती है कि वही `.env` bugs बार-बार सामने आते हैं:

- हर `process.env` value एक **string** होती है: `DEBUG=false` truthy होता है, और `"3000" + 1` बन जाता है `"30001"`।
- कोई missing variable startup पर fail नहीं होता — वह **production में** fail होता है, उस पहली request पर जिसे उसकी ज़रूरत होती है।
- `.env.example` सिर्फ़ यह बताता है कि क्या *होना चाहिए*, यह नहीं कि आपका code *असल में इस्तेमाल* क्या करता है — दोनों चुपचाप अलग होते जाते हैं।
- Variables को एक-एक करके check करना थकाऊ है, और पहला error बाकी सारे errors को छिपा देता है।

मौजूदा उपाय (zod, envalid) ताक़तवर हैं, लेकिन छोटे projects के लिए भारी हैं। `env-saaf` (`saaf` = साफ़, यानी clean/clear) **zero dependencies** के साथ ज़रूरी काम कर देता है।

## Install करना

```bash
npm install env-saaf
```

## इस्तेमाल

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  PORT:      { type: 'port', required: true },
  DEBUG:     { type: 'boolean', default: false },
  API_URL:   { type: 'url', required: true },
  LOG_LEVEL: { type: 'string', choices: ['info', 'warn', 'error'], default: 'info' },
});

// env.PORT is a number, env.DEBUG is a real boolean
// Missing/invalid vars throw ONE error listing ALL problems
```

`validateEnv` खाली string (`''`) को unset variable जैसा ही मानता है: बिना `default` वाली optional key result से हटा दी जाती है, `required` key missing के रूप में fail होती है (`missing required variable`), और `default` वाली key उसकी जगह उस default का इस्तेमाल करती है। यह [असल `.env` file load करना](#loading-a-real-env-file) वाले `${VAR:-fallback}` से मेल खाता है, जो खाली expansion को भी unset मानता है। सिर्फ़ `''` ही unset गिना जाता है — सिर्फ़ whitespace वाला input जैसे `'   '` दिया हुआ माना जाता है (default रूप से `string` के लिए trim होकर `''` हो जाता है, या `trim: false` के साथ जैसा है वैसा रहता है)।

### प्रकार संदर्भ

Environment inputs strings होते हैं। नीचे दिया output किसी optional `transform` से पहले का है।

| प्रकार | स्वीकृत इनपुट | JavaScript आउटपुट | अतिरिक्त नियम विकल्प |
| --- | --- | --- | --- |
| `string` | कोई भी non-missing text (डिफ़ॉल्ट प्रकार) | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `number` | Non-empty decimal text, fractions और exponent notation समेत। Radix prefixes (`0x`, `0b`, `0o`), `NaN` और non-finite values reject होते हैं। | `number` | `trim`, `min`, `max` |
| `int` | साधारण आधार-10 पूर्णांक अक्षरशः (optional चिह्न + अंक, जैसे `42`, `-3`, `007`)। दशमलव और वैज्ञानिक रूप (`1.0`, `1e3`) तथा radix उपसर्ग अस्वीकार होते हैं। | `number` | `trim`, `min`, `max` |
| `boolean` | Case-insensitive `true/false`, `1/0`, `yes/no`, `on/off`, `y/n` | `boolean` | कोई नहीं |
| `url` | `new URL()` द्वारा स्वीकार किया गया absolute URL, बिना normalization के | `string` | `trim`, `minLength`, `maxLength`, `pattern`, `protocols` |
| `file` | किसी मौजूद, पढ़ी जा सकने वाली regular file का path। Relative paths process की working directory के हिसाब से लिए जाते हैं। | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `port` | 0 से 65535 तक साधारण आधार-10 पूर्णांक अक्षरशः (वैकल्पिक `+` चिह्न + अंक, जैसे `3000`, `+42`)। दशमलव और वैज्ञानिक रूप (`8080.0`, `1e3`) तथा radix उपसर्ग अस्वीकार होते हैं। | `number` | `min`, `max` |
| `email` | एक `@`, non-empty local part, domain जिसमें अंदर एक dot हो, domain के शुरू या आख़िर में dot न हो, कोई whitespace न हो | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `json` | Valid JSON text (object, array या primitive)। पहले से parse किए गए defaults भी स्वीकार होते हैं। | पार्स किया गया JSON मान | `trim`। संख्यात्मक परिणामों के लिए `min` और `max`। |
| `uuid` | Canonical 8-4-4-4-12 hexadecimal groups, किसी भी case में | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `hex` | एक या अधिक hexadecimal characters, बिना `0x` prefix के | `string` | `trim`, `length`, `minLength`, `maxLength`, `pattern` |
| `ipv4` | चार decimal octets, हर एक 0 से 255; कोई leading zeroes नहीं | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `ipv6` | कोई भी पता जिसे `net.isIP` IPv6 बताता है, जिसमें संक्षिप्त, IPv4-mapped और `%zone` रूप शामिल हैं | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `semver` | `MAJOR.MINOR.PATCH`, optional prerelease और build suffixes, और एक optional छोटा `v` prefix (`v1.2.3`)। Leading numeric zeroes और बड़ा `V` reject होते हैं। | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `base64` | Standard या URL-safe alphabet, optional padding के साथ। | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `date` | Valid `YYYY-MM-DD` या `T` और hours/minutes वाला datetime; optional seconds, fraction और `Z` या numeric offset। Valid `Date` defaults स्वीकार होते हैं। | `Date` | `trim`, `min`, `max` (ISO दिनांक strings) |
| `duration` | Human duration: `500ms`, `30s`, `15m`, `2h`, `1d`, `1w`, `1h30m` जैसे compounds; bare number milliseconds होता है | `number` (मिलीसेकंड) | `trim`, `min`, `max` (मिलीसेकंड या अवधि strings, जैसे `min: '30s'`) |
| `host` | Hostname (`db.internal`, `localhost`, `example.com.`) या IPv4/IPv6 पता; अंत का एक DNS root dot सुरक्षित रहता है; कोई scheme, path या port नहीं | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `array` | `separator` (default `,`) से बँटी हुई delimited list, जिसका हर item `of` (default `string`) के रूप में coerce होता है। खाली items reject होते हैं। Array defaults स्वीकार होते हैं। | टाइप्ड array (`T[]`) | `of`, `separator`, `trim`, `protocols` (जब `of: 'url'` हो), `minItems`, `maxItems`, `unique`, `skipEmpty` |

सभी types `required`, `requiredIf`, `conflictsWith`, `default`, `description`, `validate`, `transform`, `sensitive` और `aliases` को support करते हैं। `sensitive: true` set करने से उस key की value validation errors और CLI output में हमेशा mask रहती है, उसका नाम चाहे कुछ भी हो (जैसे `SESSION_ID`, `LICENSE_KEY`), और `generateExample` में उसका placeholder खाली रहता है। `aliases: ['OLD_NAME']` set करने से पुराने variable names fallback के रूप में स्वीकार होते हैं और एक warning निकलती है (नीचे देखें)। Custom `validate(value, env)` functions coercion और built-in checks के बाद चलते हैं (`default` values पर भी), `transform` से पहले। Transforms दी गई values पर validation के बाद चलते हैं। Missing optional keys हटा दी जाती हैं और defaults validate होते हैं। `choices` option coerced strings, numbers या booleans से match करता है। कोई parse किया गया JSON value किसी choice से match कर सकता है, अगर उसका type उन तीनों में से एक हो। String input default रूप से trim होता है। `trim: false` set करने से string-like types के लिए whitespace वैसा ही रहता है। `number` और `int` के लिए, numeric value के आसपास का whitespace दोनों ही तरह से स्वीकार होता है, लेकिन सिर्फ़ whitespace वाला text default रूप से reject होता है और `trim: false` के साथ `0` में बदल जाता है। Boolean matching आसपास के whitespace को हमेशा ignore करता है। `length` option सिर्फ़ `hex` पर लागू होता है। `pattern`, `minLength` और `maxLength` options सिर्फ़ string-valued types (`string`, `email`, `url`, `file`, `uuid`, `hex`, `ipv4`, `ipv6`, `semver`, `base64`, `host`) पर लागू होते हैं और किसी और type पर पहले से ही reject हो जाते हैं। उदाहरणों के लिए नीचे के sections देखें।

### Conditional requirements (`requiredIf`)

किसी variable को सिर्फ़ तब required बनाएँ जब कोई दूसरा variable किसी ख़ास value (`equals`) या कई values में से किसी एक (`in`) से match करे:

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  SENTRY_DSN:    { type: 'url', requiredIf: { key: 'MODE', equals: 'production' } },
  ALERT_WEBHOOK: { type: 'url', requiredIf: { key: 'MODE', in: ['staging', 'production'] } },
  MODE:          { type: 'string', choices: ['development', 'staging', 'production'], default: 'development' },
});
```

`validateEnv` schemas का मूल्यांकन **दो passes** में करता है:

1. **Pass 1** हर दी गई variable को coerce करता है, `default` values लागू करता है, सारे per-key checks (`min`/`max`, `minLength`/`maxLength`, `length`, `choices`, `pattern`, `transform`) चलाता है, और बिना शर्त वाले `required: true` errors दर्ज करता है।
2. **Pass 2** उन keys के लिए हर `requiredIf` rule का मूल्यांकन करता है जो absent थीं और जिनका कोई `default` नहीं था, Pass 1 की validated values से तुलना करके (अगर referenced key schema में declared नहीं है तो raw `env` object पर fallback करके)।

क्योंकि Pass 2, Pass 1 के ख़त्म होने के बाद चलता है, schema में key declaration का क्रम मायने नहीं रखता (`SENTRY_DSN` को `MODE` से पहले declare किया जा सकता है), और conditions coerced values (जैसे `boolean` `true` या `int` `3`) के साथ-साथ `default` values से भी match करती हैं। जब condition सही हो और key missing हो, तो `validateEnv` आम `<KEY>: missing required variable` error देता है (या `{ throwOnError: false }` के साथ उसे `errors` में इकट्ठा करता है)। जब condition ग़लत हो — या जब referenced key absent हो या Pass 1 validation में fail हो गई हो — तो key optional ही रहती है। अगर key फिर भी दी गई हो, तो वह हमेशा की तरह coerce और validate होती है। दो combinations schema errors के रूप में पहले से ही reject हो जाते हैं: एक ही key पर `required: true` और `requiredIf` दोनों, और ऐसा `requiredIf` जो अपनी ही key का नाम ले — दोनों विरोधाभासी हैं, इसलिए condition को चुपचाप ignore करने के बजाय schema fail हो जाता है।

### Non-throwing mode — error throw करने के बजाय errors इकट्ठा करना

कोई health check, CLI, या ऐसा server जो degraded mode में boot होना चाहता हो, ऐसा API इस्तेमाल नहीं कर सकता जो पहली ग़लत value पर throw कर दे। `{ throwOnError: false }` पास करें और `validateEnv` उसकी जगह `{ env, errors }` लौटाएगा: `env` में हर वह value होगी जो validate हो गई, और `errors` वही list होगी जो `EnvSaafError` में होती।

```js
const { validateEnv } = require('env-saaf');

const { env, errors } = validateEnv(
  {
    PORT:  { type: 'port', required: true },
    DEBUG: { type: 'boolean', default: false },
  },
  process.env,
  { throwOnError: false }
);

if (errors.length) {
  console.warn('config problems:', errors);
  // keep booting: env.DEBUG is still usable, env.PORT is absent
}
```

Default बदला नहीं है: बिना option के, या `{ throwOnError: true }` के साथ, कोई invalid value अब भी एक ही `EnvSaafError` throw करती है जिसमें हर समस्या listed होती है। ग़लत बना schema भी अब भी throw करता है — वह code में bug है, environment में नहीं। `loadEnv` भी throw करता रहता है, क्योंकि `{ assign: true }` के साथ वह `process.env` में लिखता है और आधा-अधूरा write, fail हुए start से भी बुरा है; जब आपको error list चाहिए तो `validateEnv` बुलाएँ।

### Custom error messages: `formatError`

`EnvSaafError.message` एक fixed bullet list है। Failures को structured logs, किसी Slack alert या startup banner में भेजने के लिए, `validateEnv` (या `loadEnv`, जो इसे आगे पास कर देता है) को एक optional `formatError(errors, context)` दें:

```js
const { validateEnv } = require('env-saaf');

try {
  validateEnv(schema, process.env, {
    formatError: (errors, { keys }) =>
      `config check failed (${errors.length} of ${keys.length} keys): ${errors.join(' | ')}`,
  });
} catch (err) {
  console.error(err.message); // your string
  console.error(err.errors);  // still the raw per-key messages
}
```

- `errors` उन्हीं raw diagnostics की एक read-only copy है जो `error.errors` में होते हैं। ये मौजूदा messages हैं, इसलिए इनमें non-sensitive input के उदाहरण शामिल हो सकते हैं (`sensitive: true` keys की values पहले की तरह masked रहती हैं)। `context` अलग है और उसमें सिर्फ़ `{ keys }` होता है, यानी schema के key names; environment object और schema rules कभी अंदर पास नहीं होते।
- आप जो string लौटाते हैं वही `error.message` बन जाती है। `error.errors` बदला नहीं रहता, और बिना option के message byte-for-byte वैसा ही रहता है जैसा था।
- कोई hook जो throw करे, या string के अलावा कुछ और लौटाए, वह default message पर fallback करता है। जो `formatError` function न हो, वह `TypeError` है।
- `{ throwOnError: false }` के साथ कोई error throw नहीं होता, इसलिए hook बुलाया ही नहीं जाता और result में `errors` raw ही रहते हैं। `loadEnv` हमेशा throw करता है, इसलिए वह validation failures के लिए hook को forward करता है। Validation से पहले की failures, जैसे पढ़ी न जा सकने वाली या parse न हो सकने वाली `.env` file, अपने ख़ुद के errors throw करती हैं और hook के दायरे से बाहर हैं। ग़लत बने schema के errors भी format नहीं होते।

TypeScript में, `{ throwOnError: false }` (`formatError` नहीं) return type को `ValidateResult<S>` (`{ env: EnvResult<S>; errors: string[] }`) तक सीमित कर देता है, इसलिए `env.PORT` का type schema से inferred ही रहता है।

### Strict mode — variable names में typos पकड़ना

Default रूप से `validateEnv` सिर्फ़ schema की keys को देखता है। `{ strict: true }` के साथ वह उन variables को भी flag करता है जो set हैं लेकिन schema में नहीं हैं — ताकि असली `DATABASE_URL` के बगल में `DATABSE_URL` जैसा typo अब चुपचाप न निकल जाए:

```js
const env = validateEnv(schema, process.env, { strict: true });
// throws EnvSaafError listing e.g. "DATABSE_URL: set but not in schema (strict mode)"
```

करीबी चूक का नाम भी बताया जाता है: जब कोई required key missing हो और कोई set-but-undeclared key case को अनदेखा करने पर वही नाम हो या एक edit दूर हो (जैसे `PROT`/`PORT` की अदला-बदली), तो message `(did you mean PROT? it is set but not in the schema)` पर समाप्त होता है। Strict-mode extra को दूसरी दिशा में ऐसा ही hint मिलता है। सिर्फ़ key names सुझाए जाते हैं; values कभी echo नहीं किए जाते, `sensitive` rules के लिए भी नहीं।

Default बंद ही रहता है — कई apps एक ही environment को दूसरे tools के साथ share करते हैं।

### `aliases` के साथ variables का नाम सुरक्षित रूप से बदलना

किसी पूरे fleet में किसी environment variable का नाम बदलने का मतलब आमतौर पर यह होता है कि पुराने और नए नाम हफ़्तों तक साथ-साथ रहते हैं। Canonical key पर पुराने नाम `aliases` से declare करें:

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv(
  {
    DATABASE_URL: { type: 'url', required: true, aliases: ['DB_URL'] },
  },
  process.env,
  { onWarn: msg => logger.warn(msg) } // optional; defaults to console.warn
);
// env.DATABASE_URL receives the coerced, validated value (never env.DB_URL)
```

- जब `DATABASE_URL` unset हो (या खाली `""` हो) और `DB_URL` set हो, तो पहला भरा हुआ alias `env.DATABASE_URL` के तहत value देता है, सामान्य coercion, validation और `transform` से गुज़रता है, और एक deprecation warning निकालता है (`env-saaf: DB_URL is deprecated; use DATABASE_URL instead`)।
- जब `DATABASE_URL` और `DB_URL` दोनों set हों, तो `DATABASE_URL` जीतता है और एक warning बताती है कि alias ignore हो गया (`env-saaf: DB_URL is ignored because DATABASE_URL is set`)।
- Warnings कभी validation को fail नहीं करतीं। Default रूप से वे `console.warn` से log होती हैं; उन्हें अपने logger तक भेजने के लिए `validateEnv` या `loadEnv` को `onWarn: fn` पास करें (या चुप कराने के लिए `() => {}`)।
- `{ strict: true }` mode में, declared aliases पहचाने जाते हैं और unknown variables के रूप में flag नहीं होते।
- कोई alias किसी declared schema key (अपनी ख़ुद की key समेत) के बराबर नहीं हो सकता, और न ही अलग-अलग rules उसे share कर सकते हैं। ये schema ग़लतियाँ values पढ़ने से पहले ही `EnvSaafError` throw करती हैं, `{ throwOnError: false }` के साथ भी। एक ही rule के अंदर alias दोहराना ठीक है।

### Grouped (nested) schemas, key prefix के साथ

जो schemas एक prefix दोहराते हैं, वे उसकी जगह rules को उसके नीचे group कर सकते हैं:

```js
const env = validateEnv(
  {
    DB: {
      prefix: 'DB_',
      schema: {
        HOST: { type: 'host', required: true },
        PORT: { type: 'port', default: 5432 },
      },
    },
  },
  process.env,
);
// reads DB_HOST / DB_PORT, returns { DB: { HOST: '...', PORT: 5432 } }
```

- Group वह rule है जिसमें `schema` object हो और कोई `type` न हो, साथ में एक non-empty `prefix` हो। हर inner rule `prefix + INNER_NAME` से पढ़ा जाता है, इसलिए errors हमेशा पूरा env var नाम लेते हैं (`DB_HOST: missing required variable`)।
- Result group key के नीचे nest होता है: `{ DB: { HOST, PORT } }`। अगर कोई inner key मौजूद न हो, तो group key हटा दी जाती है, बिल्कुल किसी absent optional flat key की तरह।
- `strict`, `aliases`, `requiredIf` और `default` सभी groups के अंदर काम करते हैं; group के अंदर, `aliases` और `requiredIf.key` **पूरे env var names** इस्तेमाल करते हैं (जैसे `aliases: ['DATABASE_HOST']`, `requiredIf: { key: 'NODE_ENV', equals: 'production' }`, या किसी दूसरे group का `'DB_HOST'`)।
- `generateExample` अब भी flat env names (`DB_HOST=...`) निकालता है, group की keys के ऊपर एक `# group DB` comment के साथ।
- `loadEnv(..., { assign: true })` flat names ही वापस लिखता है (`DB_HOST=...`), कभी nested object नहीं।
- ग़लत बने groups को `validateSchema` (अब exported है) पहले से ही reject कर देता है: missing/खाली `prefix`, non-object या खाली `schema`, group पर `type`, nested groups, group पर अतिरिक्त options, या ऐसा prefix जो किसी दूसरी key से टकराए (जैसे declared `DB_HOST` के साथ `DB_` group) — ये सभी समस्या का नाम लेकर `EnvSaafError` throw करते हैं।
- TypeScript में, `EnvResult` groups को भी nest करता है: `env.DB` का type `{ HOST: string; PORT: number; ... } | undefined` होता है (group key optional है; inner keys की अपनी required/default optionality बनी रहती है)। किसी standalone group rule को type करने के लिए `EnvGroupRule` exported है।

### Per-key `validate` — custom validation rules

कुछ rules app-specific होते हैं — कोई path एक मौजूद directory होना चाहिए, या दो keys अलग-अलग होनी चाहिए। Library को fork करने के बजाय key पर एक `validate(value, env)` function पास करें:

```js
const fs = require('node:fs');
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  DATA_DIR: {
    type: 'string',
    required: true,
    validate: v => fs.existsSync(v) && fs.statSync(v).isDirectory() || 'must be an existing directory',
  },
  PRIMARY_HOST: { type: 'host', required: true },
  REPLICA_HOST: {
    type: 'host',
    required: true,
    validate: (v, rawEnv) => v !== rawEnv.PRIMARY_HOST || 'must differ from PRIMARY_HOST',
  },
});
```

`validate` type coercion और built-in checks (`min`/`max`, `minLength`/`maxLength`, `length`, `choices`, `pattern`) के बाद चलता है, `transform` से पहले, और `default` values को भी validate करता है। इसे coerced `value` और input `env` object मिलता है। Pass होने के लिए `true` (या `undefined`/`null`) लौटाएँ, key का नाम लेने वाले generic error के लिए `false`, या fail होने के लिए कोई non-empty string error message। Throw करने वाला validator crash करने के बजाय, key का नाम लेते हुए validation failure के रूप में `EnvSaafError` में इकट्ठा होता है (या `{ throwOnError: false }` के साथ `errors` में), और `sensitive: true` masking का सम्मान करता है।

### Per-key `transform` — coercion के बाद एक custom step

कुछ values को type coercion के बाद एक छोटा custom step चाहिए होता है जिसका अंदाज़ा env-saaf नहीं लगा सकता — case normalise करना, कोई numeric unit adjust करना, या किसी parsed array को post-process करना:

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  ALLOWED_ORIGINS: { type: 'array', transform: xs => xs.map(s => s.toLowerCase()) },
  SHOUTY_NAME:     { type: 'string', transform: v => v.toUpperCase() },
});
// env.ALLOWED_ORIGINS is a lower-cased string[], env.SHOUTY_NAME is upper-cased
```

Transform coercion, built-in checks (`min`/`max`, `minLength`/`maxLength`, `length`, `choices`, `pattern`), और custom `validate` के बाद चलता है; अगर वह throw करे, तो error किसी भी दूसरे validation error की तरह इकट्ठा होता है (key के नाम के साथ)। उसकी लौटाई गई value rule के declared `type` के ख़िलाफ़ जाँची जाती है (जैसे `number`/`int`/`port`/`duration` को finite number/integer/port ही रहना चाहिए, `boolean` को boolean, `date` को valid `Date`, `array` को `of` items का array, `string` और string-typed rules को valid string) — ग़लत type लौटाने पर key और expected type का नाम लेते हुए validation error बनता है। यह सिर्फ़ सच में दी गई values पर चलता है — `default` values पर नहीं (defaults फिर भी किसी भी value की तरह coerce और validate होते हैं, इसलिए ख़राब default key का नाम लेते हुए error के साथ fail होता है)। TypeScript में उस key का result type transform के return type से inferred होता है।

### `email` type और `pattern` — formats validate करना

```js
const env = validateEnv({
  ADMIN_EMAIL: { type: 'email', required: true },
  SLUG:        { type: 'string', pattern: /^[a-z0-9-]+$/ },
  API_KEY:     { type: 'string', pattern: /^sk_[A-Za-z0-9]+$/ },
});
```

`email` check व्यावहारिक है (एक `@`, एक non-empty local part और domain, और domain में एक dot), पूरा RFC 5322 नहीं। `pattern` एक `RegExp` लेता है जिससे किसी string value को match करना होता है (`string`, `email`, `url`, `file`, `uuid`, `hex`, `ipv4`, `ipv6`, `semver`, `base64`, `host`); यह coercion और `choices` check के बाद चलता है, mismatch error उस pattern का नाम लेता है जो fail हुआ, और non-string type पर `pattern` इस्तेमाल करना पहले से ही reject हो जाता है।

### `int` type और `min`/`max` — whole numbers और ranges

```js
const env = validateEnv({
  MAX_RETRIES: { type: 'int', min: 0, max: 5, default: 3 },
  TIMEOUT_MS:  { type: 'number', min: 100, max: 30000 },
});
```

`int`, `number` जैसा है, लेकिन fractional values को reject करता है (`3.5` fail होता है, `42` और `1e3` pass होते हैं)। `min` और `max`, `number`, `int` और `port` पर काम करते हैं; दोनों में से किसी एक को अकेले भी इस्तेमाल किया जा सकता है, और range से बाहर की value, allowed range का नाम लेते हुए error के साथ reject होती है।

### `json` type और `minLength`/`maxLength` — structured values और string lengths

```js
const env = validateEnv({
  FEATURE_FLAGS: { type: 'json', default: { beta: false } },
  API_TOKEN:     { type: 'string', minLength: 10, maxLength: 64, required: true },
});
```

`json` value को `JSON.parse` से parse करता है (objects, arrays और primitives सभी parsed होकर वापस आते हैं); invalid JSON, key का नाम लेते हुए error के साथ reject होता है। `default` पहले से parse किए गए object के रूप में दिया जा सकता है। `minLength` और `maxLength` string-valued types (`string`, `email`, `url`, `file`, `uuid`, `hex`, `ipv4`, `ipv6`, `semver`, `base64`, `host`) पर काम करते हैं और किसी और type पर पहले से ही reject हो जाते हैं; दोनों में से किसी एक को अकेले भी इस्तेमाल किया जा सकता है, और बहुत छोटी या बहुत लंबी value, allowed length का नाम लेते हुए error के साथ reject होती है। ये `pattern` के साथ मिलते हैं (पहले length check होती है, फिर pattern)।

### `uuid` और `hex` types — IDs और hex strings

```js
const env = validateEnv({
  TENANT_ID: { type: 'uuid', required: true },
  API_HASH:  { type: 'hex', length: 64 },
});
```

`uuid` एक canonical UUID (`8-4-4-4-12` hex groups, upper- और lowercase) स्वीकार करता है और उसे बिना बदले लौटाता है; ग़लत बनी value, key का नाम लेते हुए error के साथ reject होती है। `hex` सिर्फ़ hexadecimal strings स्वीकार करता है (`deadBEEF42` pass होता है, `0x1234` नहीं); optional `length` option characters में exact size तय करता है, fixed-size tokens और hashes के लिए।

### `ipv4`, `semver` और `base64` types — network addresses, versions और encoded values

```js
const env = validateEnv({
  BIND_ADDR: { type: 'ipv4', required: true },
  APP_VERSION: { type: 'semver', required: true },
  WEBHOOK_SECRET: { type: 'base64', required: true },
});
```

`ipv4` एक dotted-quad address स्वीकार करता है (`192.168.0.1` pass होता है, `256.1.1.1` और `1.2.3` नहीं); leading zero वाला octet (`01.2.3.4`) reject होता है क्योंकि वह ambiguous है। `semver`, optional pre-release और build suffixes के साथ `MAJOR.MINOR.PATCH` स्वीकार करता है (`1.2.3-beta.1` pass होता है) और एक optional छोटा `v` prefix भी (`v1.2.3` pass होता है, बिना बदले लौटाया जाता है — वही form जो `git describe` और release pipelines निकालते हैं); `1.2`, `vv1.2.3` और बड़े अक्षरों वाला `V1.2.3` नहीं चलते। `base64` standard alphabet (`A-Za-z0-9+/`) या URL-safe alphabet (`A-Za-z0-9-_`) में से कोई भी स्वीकार करता है। Padding छोड़ी जा सकती है। जब मौजूद हो, तो वह पूरी होनी चाहिए और आख़िर में आनी चाहिए। तीनों value को बिना बदले लौटाते हैं, और `minLength`/`maxLength` उन पर किसी भी दूसरे string type की तरह काम करते हैं।

### `date` type — ISO 8601 dates, `Date` objects के रूप में

```js
const env = validateEnv({
  LAUNCH_DATE: { type: 'date', required: true },
  CUTOFF:      { type: 'date' },
}, process.env);

if (env.LAUNCH_DATE < new Date()) console.log('Launched!');
```

`date` किसी ISO 8601 date (`2026-01-31`) या datetime (`2026-01-31T10:00:00Z`, optional seconds, fractional seconds और `Z` या `±HH:MM` offset के साथ) को parse करता है और एक JavaScript `Date` लौटाता है, ताकि cut-off dates, launch dates और expiry dates के लिए हाथ से parsing न लिखनी पड़े। असंभव dates, key का नाम लेते हुए error के साथ reject होती हैं — `2026-02-31` चुपचाप March में roll over होने के बजाय fail होता है, और `31-01-2026` या `2026/01/31` जैसी ग़लत बनी values भी। `default` के रूप में दिया गया `Date` बिना बदले पास हो जाता है, और `generateExample` इस type के लिए `2026-01-31` सुझाता है।

### `duration` type — human timeouts, milliseconds के रूप में

```js
const env = validateEnv({
  CACHE_TTL: { type: 'duration', required: true },
  TIMEOUT:   { type: 'duration', default: '30s' },
}, process.env);

setTimeout(refresh, env.CACHE_TTL); // 900000 for '15m'
```

`duration` किसी human duration (`500ms`, `30s`, `15m`, `2h`, `1d`, `1w`) को milliseconds की संख्या में parse करता है; compound values अपने हिस्सों को जोड़ती हैं, इसलिए `1h30m` होता है 5,400,000 ms और `2d12h` होता है 216,000,000 ms (हर हिस्से को एक unit चाहिए — `1h30` reject होता है); bare number पहले से ही milliseconds होता है, इसलिए `'250'` और `250` दोनों का मतलब 250 ms है। Units case-insensitive हैं और decimals चलती हैं (`1.5h` होता है 5,400,000 ms); `w` 7 दिनों का एक हफ़्ता है, इसलिए `1w` होता है 604,800,000 ms। Unknown units (`15min`, `15sec`), negatives और ग़लत बनी values, key का नाम लेते हुए error के साथ reject होती हैं। `default` के रूप में दी गई संख्या milliseconds मानी जाती है, और `min`/`max` millisecond result पर किसी भी दूसरी संख्या की तरह काम करते हैं। `generateExample` इस type के लिए `15m` सुझाता है।

### `host` type — एक hostname या IP address, बिना scheme या port के

```js
const env = validateEnv({
  DB_HOST: { type: 'host', required: true },
  BIND_ADDR: { type: 'host', default: 'localhost' },
}, process.env);
```

`host` एक hostname (`db.internal`, `localhost`) या IPv4/IPv6 address (`10.0.0.5`, `::1`) स्वीकार करता है और उसे बिना बदले लौटाता है। Scheme (`https://db.internal`), path (`db/x`) या port (`example.com:8080`) वाली value, key का नाम लेते हुए error के साथ reject होती है — वे `url` type या किसी अलग port variable के लिए हैं। `minLength`/`maxLength` और `pattern` उस पर किसी भी दूसरे string type की तरह काम करते हैं, और `generateExample` इस type के लिए `localhost` सुझाता है।

### `url` type और `protocols` — schemes की allowlist

```js
const env = validateEnv({
  WEBHOOK_URL: { type: 'url', protocols: ['https'], required: true },
});
```

`url`, `new URL()` से validate करता है और value को ठीक वैसी ही लौटाता है जैसी दी गई थी (कोई normalization नहीं — bare origin के पीछे trailing slash नहीं जुड़ता)। `protocols` उन schemes की allowlist बनाता है जो कोई value इस्तेमाल कर सकती है (`['https']`, `ftp://...` और `javascript:...` को, allowed schemes का नाम लेते हुए error के साथ reject करता है); matching case-insensitive है, और entries trailing colon के साथ या बिना लिखी जा सकती हैं (`'https'` और `'https:'` का मतलब एक ही है)। बिना option के, कोई भी valid URL pass होता है, पहले की तरह।

### `array` type — delimited string को typed array में बाँटना

```js
const env = validateEnv({
  ALLOWED_ORIGINS: { type: 'array', of: 'url', protocols: ['https'], required: true },
  PORTS:           { type: 'array', of: 'port', separator: ';', default: [80, 443] },
  ADMIN_EMAILS:    { type: 'array', of: 'email' },
});
```

`array` किसी delimited string को `separator` (default `','`) पर बाँटता है, हर item को default रूप से trim करता है (`trim: false` आसपास का whitespace रखता है), और हर item को `of` से coerce करता है (default `'string'`; कोई भी built-in scalar type supported है, और nested `'array'` पहले से ही reject हो जाता है)। खाली items (जैसे `a,,b` या आख़िर में comma `a,b,`) चुपचाप हटाए जाने के बजाय reject होते हैं, और कोई भी invalid item अपना 0-based index और ग़लत value बताता है (`PORTS[1]: expected a port (0-65535, e.g. 3000), got "abc"` — `sensitive: true` होने पर masked)। `minItems` और `maxItems` items की संख्या को बाँधते हैं (दोनों non-negative integers हैं, और `minItems`, `maxItems` से अधिक नहीं होना चाहिए); उल्लंघन होने पर key के साथ count और bound बताया जाता है (`TAGS: expected at least 2 items, got 1`), और ये bounds `default` values पर भी लागू होते हैं। ग़लत बनी values और non-`array` rule पर इस्तेमाल पहले से ही reject हो जाता है। पहले से parse किया गया array `default` के रूप में दिया जा सकता है (`[]` समेत), और `generateExample`, `of` type की तीन example items को `separator` से जोड़कर सुझाता है — default `string` के लिए `a,b,c`, लेकिन `int` के लिए `1,2,3`, `port` के लिए `3000,8080,5432`, और इसी तरह — ताकि बनी हुई value ख़ुद उस rule के ख़िलाफ़ validate हो जाए; हर array key के ऊपर वाला comment item type का नाम लेता है (`# type: array, items: int`)। TypeScript में element type `of` से inferred होता है।

### `trim: false` — जब whitespace मायने रखता हो, उसे रखना

Values validation से पहले default रूप से trim होती हैं — dashboards से paste किए गए secrets के लिए सुविधाजनक, जिनमें इधर-उधर spaces आ जाते हैं। जब whitespace *ही* value हो, तो उस key के लिए trimming बंद कर दें:

```js
const env = validateEnv({
  TOKEN: { type: 'string', trim: false, required: true },
});
// TOKEN: '  secret  ' stays '  secret  '
```

`trim: false` सिर्फ़ string-like types को प्रभावित करता है; numbers और booleans अप्रभावित रहते हैं (`' 42 '` अब भी `42` के रूप में parse होता है, `' true '` अब भी `true` के रूप में parse होता है)।

### असल `.env` file load करना

एक ही call में हो जाता है — file पढ़ें, उसे parse करें, उसे validate करें:

```js
const { loadEnv } = require('env-saaf');

const env = loadEnv({
  PORT:    { type: 'port', required: true },
  API_URL: { type: 'url', required: true },
}); // reads `.env` by default
```

Options: दूसरी file पढ़ने के लिए `{ path: '.env.local' }`, file को `process.env` पर जीत दिलाने के लिए `{ override: true }` (default रूप से मौजूदा `process.env` values जीतती हैं), validated values को strings के रूप में `process.env` में वापस लिखने के लिए `{ assign: true }`। स्पष्ट रूप से दिया गया `path` जो मौजूद न हो, वह path का नाम लेते हुए error throw करता है — typo वाली file चुपचाप boot नहीं होनी चाहिए। बिना `path` option के implicit default `.env` absent हो सकती है (तब हर variable को default चाहिए या वह optional होनी चाहिए), और file list (`paths: [...]` या array के रूप में `path`) की missing entries छोड़ दी जाती हैं; list तब ही throw करती है जब कोई file बिल्कुल न मिले और कोई required variable missing हो। Default रूप से `process.env` कभी बदला नहीं जाता।

कई files को layer किया जा सकता है — बाद वाली files पहले वालियों को override करती हैं:

```js
const env = loadEnv(schema, { paths: ['.env', '.env.local'] });
// or: { path: ['.env', '.env.local'] }
```

Values `${VAR}` से दूसरी values को reference कर सकती हैं — हिस्सों से URLs बनाने के लिए सुविधाजनक। References पहले उसी file से resolve होते हैं, फिर `process.env` से; single-quoted values और `\${VAR}` escapes literal ही रहते हैं:

```env
HOST=example.com
API_URL=https://${HOST}/api
```

जब कोई value unset हो या खाली string में expand हो, तो fallback देने के लिए `${VAR:-fallback}` इस्तेमाल करें। उसे सिर्फ़ तब देने के लिए जब नाम unset हो, `${VAR-fallback}` इस्तेमाल करें। उदाहरण के लिए, `API_URL=https://${HOST:-localhost}/api` तब `localhost` इस्तेमाल करता है जब `HOST` की कोई value न हो। Defaults में `${HOST:-${DEFAULT_HOST}}` जैसे references भी शामिल हो सकते हैं।

Quoted values कई lines में भी फैल सकती हैं (PEM keys, JSON blobs) — parsing closing quote तक जारी रहती है। Backslash-escaped quote (single quotes के अंदर `\'`, double quotes के अंदर `\"`) value का हिस्सा ही रहता है, इसलिए `B='it\'s'` होता है `it's`; दूसरे backslashes, जैसे किसी Windows path में, वैसे ही रहते हैं।

बिना `=` वाली bare line, या invalid key वाला assignment (जैसे `MY KEY`), अपनी line number के साथ syntax error उठाता है, value को echo किए बिना। Assignment की keys को `[A-Za-z_][A-Za-z0-9_.-]*` से match करना होता है: पहले character के बाद dot और dash मान्य हैं (जैसे `app.name` और `MY-KEY`), लेकिन key के अंदर space मान्य नहीं है। खाली value के लिए `KEY=` इस्तेमाल करें।

Async code में, filesystem I/O पर block किए बिना files पढ़ने के लिए `loadEnvAsync` इस्तेमाल करें।

```js
const { loadEnvAsync } = require('env-saaf');

async function readConfig() {
  return await loadEnvAsync(
    { PORT: { type: 'port', default: 3000 } },
    { paths: ['.env', '.env.local'] }
  );
}
```

यह `loadEnv` जैसे ही options स्वीकार करता है, जिनमें file precedence, `override`, और `assign` शामिल हैं। Promise validated values के साथ resolve होता है और उन्हीं errors पर reject होता है जो `loadEnv` throw करता है।

Manual तरीका भी अब भी काम करता है — file को parse करके अंदर पास कर दें:

```js
const fs = require('node:fs');
const { parseEnvFile, validateEnv } = require('env-saaf');

const fileEnv = parseEnvFile(fs.readFileSync('.env', 'utf8'));
const env = validateEnv({
  PORT:    { type: 'port', required: true },
  API_URL: { type: 'url', required: true },
}, fileEnv);
```

ES modules भी काम करते हैं:

```js
import { validateEnv } from 'env-saaf';
```

### TypeScript: return type schema से inferred होता है

`validateEnv` का return type schema से inferred होता है — `type: 'port'` वाली key `number` बन जाती है, `boolean` key `boolean` बन जाती है, और बिना `required` या `default` वाली key `| undefined` होती है:

```ts
import { validateEnv } from 'env-saaf';

const env = validateEnv({
  PORT:  { type: 'port', required: true },
  DEBUG: { type: 'boolean' },
});

env.PORT.toFixed(0); // OK — PORT: number
env.DEBUG;           // boolean | undefined
env.TYPO;            // TypeScript error — not in the schema
```

Schema को `validateEnv(...)` में inline पास करें (या `as const` इस्तेमाल करें) ताकि TypeScript literal types देख सके। `EnvResult<S>` और `EnvValue<R>` types अलग से भी exported हैं।

## Recipes

ये छोटे patterns सिर्फ़ उन्हीं `validateEnv` options का इस्तेमाल करते हैं जो मौजूदा API में उपलब्ध हैं।

### Database URL और connection-pool size

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  DATABASE_URL: { type: 'url', required: true },
  DB_POOL_SIZE: { type: 'number', default: 10 },
});
// env.DATABASE_URL is present; env.DB_POOL_SIZE is a number.
```

`url` URL syntax को validate करता है, जबकि `number` pool size को उसकी environment string से convert करता है।

### Feature flags

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  ENABLE_EXPORTS: { type: 'boolean', default: false },
  ENABLE_PREVIEW: { type: 'boolean', default: false },
});

if (env.ENABLE_EXPORTS) console.log('Exports are enabled');
```

Boolean type `true`/`false`, `yes`/`no`, `on`/`off`, और `1`/`0` (साथ ही `y`/`n`) को case-insensitive रूप से स्वीकार करता है।

### Optional analytics key

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  ANALYTICS_WRITE_KEY: { type: 'string' },
});

if (env.ANALYTICS_WRITE_KEY !== undefined) {
  console.log('Analytics is configured'); // Use the key with your analytics client; do not log it.
}
```

बिना `required` या `default` के, कोई missing key result से हटा दी जाती है और उसका TypeScript type `string | undefined` होता है।

### Development और production की अलग-अलग requirements

```js
const { validateEnv } = require('env-saaf');

const mode = validateEnv({
  NODE_ENV: {
    type: 'string',
    choices: ['development', 'test', 'production'],
    default: 'development',
  },
}).NODE_ENV;

const env = validateEnv({
  DATABASE_URL:
    mode === 'production'
      ? { type: 'url', required: true }
      : { type: 'url', default: 'http://localhost:5432/app' },
});
```

पहले mode को validate करें, फिर जब आपको हर environment के लिए अलग `default` values या types चाहिए हों तो application code में एक आम schema चुनें। किसी key को सिर्फ़ किसी ख़ास mode में required बनाने के लिए, उसकी जगह एक ही schema में `requiredIf` इस्तेमाल करें।

### Fastify

Plugins register करने या `fastify.listen(...)` बुलाने से **पहले** startup पर configuration validate करें, फिर typed, frozen config object को `fastify.decorate('config', config)` से Fastify instance से जोड़ दें। Validation को `register` और `listen` से पहले चलाने से यह पक्का होता है कि plugins के database pools खोलने या server के किसी port से bind होने से पहले process fail fast हो जाए, और instance को decorate करने से routes और plugins को `process.env` दोबारा पढ़े बिना `fastify.config` के ज़रिए typed access मिलता है:

```js
const Fastify = require('fastify');
const { EnvSaafError, validateEnv } = require('env-saaf');

function buildApp() {
  let config;
  try {
    // Runs before registering plugins or calling listen(), so a bad config
    // fails fast before opening database pools or binding a port.
    config = validateEnv({
      PORT:         { type: 'port', default: 3000 },
      HOST:         { type: 'host', default: '127.0.0.1' },
      DATABASE_URL: { type: 'url', required: true },
      LOG_LEVEL:    { type: 'string', choices: ['info', 'warn', 'error'], default: 'info' },
    });
  } catch (err) {
    if (!(err instanceof EnvSaafError)) throw err;
    console.error(err.message);
    process.exit(1);
  }

  const fastify = Fastify({ logger: { level: config.LOG_LEVEL } });
  fastify.decorate('config', config);

  fastify.get('/health', async () => ({
    ok: true,
    port: fastify.config.PORT,
  }));

  return fastify;
}

const fastify = buildApp();
fastify.listen({ port: fastify.config.PORT, host: fastify.config.HOST });
```

`.env` file के साथ local development के लिए, उसी startup block में `validateEnv(schema)` की जगह `loadEnv(schema)` (या `loadEnv(schema, { paths: ['.env', '.env.local'] })`) रख दें।

### Next.js

अपना server-only schema किसी shared module (जैसे `lib/env.ts`) में रखें और उसे Next.js के `instrumentation.ts` के `register()` hook से import करें, जो **Node.js server के boot होने पर एक बार** चलता है — requests, Route Handlers, या Server Components संभालने से पहले। अगर आपका app Edge runtime भी इस्तेमाल करता है तो `process.env.NEXT_RUNTIME === 'nodejs'` से guard करें, क्योंकि `env-saaf` Node built-ins (`node:fs`, `node:net`, `node:path`) इस्तेमाल करता है। अगर आप चाहते हैं कि missing build-time config पर `next build` fail fast हो, तो आप उसी validation module को `next.config.mjs` के ऊपर भी import कर सकते हैं।

```ts
// lib/env.ts — server-only configuration (never import in Client Components)
import { validateEnv } from 'env-saaf';

export const serverEnv = validateEnv({
  DATABASE_URL: { type: 'url', required: true },
  AUTH_SECRET:  { type: 'string', minLength: 32, required: true },
  API_TIMEOUT:  { type: 'duration', default: '10s' },
});
```

```ts
// instrumentation.ts — runs once when the Next.js Node.js server starts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/env');
  }
}
```

Next.js, `instrumentation.ts` के चलने से पहले `.env`, `.env.local`, और environment-specific `.env.*` files को अपने आप `process.env` में load कर देता है, इसलिए `validateEnv` उन्हें `loadEnv` बुलाए बिना सीधे पढ़ता है।

**`NEXT_PUBLIC_` variables secrets के दायरे से बाहर हैं:** Next.js build time पर हर `NEXT_PUBLIC_*` variable को browser bundle में inline कर देता है। Secrets (API keys, database URLs, signing secrets) को कभी `NEXT_PUBLIC_*` variables में न रखें — secrets को बिना prefix वाली server-only variables में रखें, जो `lib/env.ts` जैसे server-only modules में validated हों। अगर आप public client settings (जैसे `NEXT_PUBLIC_SITE_URL`) को भी validate करना चाहते हैं, तो एक explicit object पास करें (`validateEnv({ NEXT_PUBLIC_SITE_URL: { type: 'url', required: true } }, { NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL })`) क्योंकि Next.js client bundles में literal `process.env.NEXT_PUBLIC_*` references को statically replace करता है, पूरा `process.env` object expose नहीं करता।

### `.env.example` को ईमानदार रखना (CLI)

CLI output default रूप से plain text होता है, pipes और CI में भी। जो scripts एक shared color preference set करती हैं, उनके लिए command से पहले या बाद में `--no-color` पास करें, या `NO_COLOR=1` set करें।

```bash
npx env-saaf --version      # print the installed version
npx env-saaf scan ./src     # every env var your code actually uses
npx env-saaf scan . --exclude fixtures --exclude 'src/generated/**'  # leave vendored or generated code out
                           # scans .js/.cjs/.mjs/.ts/.mts/.cts/.tsx/.jsx and .vue/.svelte/.astro components
git show HEAD:src/config.js | npx env-saaf scan --stdin  # scan code piped on standard input
npx env-saaf check .        # compare code against .env.example
npx env-saaf check . --file .env.sample  # compare against a differently-named template file instead
npx env-saaf check . --json # machine-readable check results for CI or tooling
npx env-saaf check . --schema ./env.schema.js  # also validate the values in .env against a schema — exit 1 on a type error
npx env-saaf check . --schema ./env.schema.js --values .env.production  # validate another environment file's values
npx env-saaf print . --schema ./env.schema.js  # print the coerced values (defaults applied, secrets masked)

npx env-saaf scan ./src --json  # JSON object containing the used vars
npx env-saaf check . --watch    # re-run check whenever the code, .env.example/.env or schema changes (Ctrl-C to stop)
npx env-saaf example ./src  # draft a .env.example from a code scan
npx env-saaf example ./src --write  # save the draft to .env.example (refuses, exit 1, when the scan finds no variables)
npx env-saaf example . --schema ./env.schema.js  # generate .env.example from a schema instead — with type placeholders and alias/requiredIf annotations
npx env-saaf init .  # scaffold a starter env.schema.js (commented type examples) + a matching .env.example (refuses to overwrite without --force)
npx env-saaf init . --from-example  # infer the starter schema from an existing .env.example instead (it is left untouched)
npx env-saaf init . --from-example --groups  # fold keys sharing a prefix into a grouped schema
```

नया project शुरू कर रहे हैं? `env-saaf init` मुख्य types (`string`, `int`, `boolean`, `port`, `url`, `email`, `duration`, `host`) के commented उदाहरणों के साथ एक starter `env.schema.js` लिखता है और उससे matching `.env.example` बनाता है। हर सुझाया गया placeholder एक ऐसी value है जो अपने ही rule के ख़िलाफ़ validate होती है, इसलिए बनी हुई `.env.example` शुरुआत से ही `check` pass करती है (`file` type इसका अपवाद है — उसका `./config.json` path पहले मौजूद होना चाहिए)। जिस project के `package.json` में `"type": "module"` हो, वहाँ starter उसकी जगह `env.schema.cjs` के रूप में लिखा जाता है, ताकि वह `require()` से अब भी load हो — वहाँ अपने schema का नाम भी `.cjs` extension के साथ रखें। `init` के बाद पहला `check` एक note के साथ pass होता है जब तक code variables को न पढ़े — scaffold द्वारा declared keys जिन्हें कोई code अभी इस्तेमाल नहीं करता, drift नहीं मानी जातीं। जैसे ही code कम से कम एक variable पढ़ता है, unused keys फिर से check fail करती हैं, पहले की तरह। दोनों में से किसी भी file का मौजूद होना एक refusal है (exit 1, files के नाम के साथ), जब तक `--force` पास न किया जाए; `--schema <file>`, `env.schema.js` की जगह schema file का नाम देता है।

पहले से `.env.example` है और कोई schema नहीं? `env-saaf init --from-example` (किसी और नाम के लिए optionally `--from-example=FILE`) example file को parse करता है और उसकी sample value से हर key के लिए एक starter rule का अंदाज़ा लगाता है, इस priority क्रम में: कोई UUID -> `uuid`, कोई valid JWT (JSON header और payload वाले तीन base64url segments) -> `jwt`, कोई ISO date या datetime -> `date`, कोई duration जैसे `30m` या `1h30m` -> `duration`, कोई semantic version जैसे `1.4.2` -> `semver`, JSON के रूप में parse होने वाला कोई object या array -> `json`, कम से कम आठ characters की सम लंबाई वाली hex string -> `hex`, port जैसा number (1024-65535 में कोई whole number) -> `port`, कोई और integer -> `int`, `true`/`false` -> `boolean`, कोई `http(s)` URL -> `url`, कोई email address -> `email`, कोई decimal -> `number`, बाकी सब कुछ (खाली values और `cafe` जैसी अस्पष्ट strings समेत) -> `string`। हर candidate की असली validator से पुष्टि की जाती है, इसलिए हर inferred rule हमेशा उस sample को स्वीकार करता है जिससे वह निकला है। हर inferred rule एक comment के साथ लिखा जाता है जो कहता है कि यह inferred है और इसे review करना चाहिए (sample values ख़ुद schema में copy नहीं होतीं, ताकि example में मौजूद कोई password committed file में leak न हो सके)। Code scan को जो keys मिलती हैं और example में listed नहीं हैं, वे fixed scaffold की तरह `string` rules के रूप में जोड़ दी जाती हैं। इस mode में example file कभी लिखी या overwrite नहीं होती: सिर्फ़ schema file लिखी जाती है, और वह भी बिना `--force` के overwrite करने से इनकार करती है। बना हुआ schema example की अपनी sample values के ख़िलाफ़ validate होता है, इसलिए उसके ठीक बाद `env-saaf check . --file .env.example --schema env.schema.js` pass होता है। Keys को, जो एक common prefix share करती हैं, grouped schema में मोड़ने के लिए `--groups` (`env-saaf init --from-example --groups`) पास करें (जैसे `DB_HOST` और `DB_PORT` एक `DB` group बन जाते हैं, `prefix: 'DB_'` के साथ) जब prefix कम से कम दो characters का हो और कम से कम दो keys उसे share करती हों।

जब `.env.example` (या `--file` से दी गई file) scanned directory में हो, तो `scan` उन keys के बारे में भी warn करता है जो वहाँ declared हैं लेकिन कोई code उन्हें पढ़ता नहीं, stderr पर एक-एक line में: `UNUSED: OLD_KEY (in .env.example, never used in code)`। `--json` के साथ वे `vars` के बगल में एक `unused` array में listed होती हैं। यह सिर्फ़ एक warning है: stdout में अब भी सिर्फ़ used variables होते हैं, और `scan` अब भी 0 पर exit होता है (drift पर CI job fail करने के लिए `check` इस्तेमाल करें)। बिना template file के, कुछ नहीं बदलता।

किसी directory को scan करते समय, `scanDir` `node_modules`, `.git*` और आम build output (`dist`, `build`, `coverage`, `.next`, `out`, `target`) को छोड़ देता है, ताकि कोई पुराना bundle किसी unused key को used न दिखा दे; CLI में `scan` और `check` दोनों `--exclude <pattern>` (दोहराने योग्य) स्वीकार करते हैं, जिससे `fixtures` या `'src/generated/**'` जैसे अतिरिक्त directories या glob patterns को बाहर रखा जा सकता है। Scan code को पढ़ता है, comments या string और template literals के अंदर के text को नहीं: किसी variable का नाम सिर्फ़ comment (`// set process.env.FOO first`), string (`'see process.env.BAR'`) या template के text में होना reported नहीं होता, इसलिए वह चुपचाप `check` को satisfy नहीं कर सकता और न ही किसी `example` draft में आ सकता है। Template के `${...}` के अंदर का read अब भी read है, और `process.env['X']`, ``process.env[`X`]`` और destructuring भी। Optional chaining भी एक read है: `process.env?.MAYBE` और `import.meta.env?.VITE_MAYBE` ठीक plain dot form की तरह reported होते हैं (साथ ही `process.env?.['X']` और ``process.env?.[`X`]`` भी)। Vite के `import.meta.env` reads भी उसी तरह मिलते हैं (dot access, bracket access और destructuring), इसलिए Vite projects भी सही scan होते हैं।

जब कोई असली `.env` template के बगल में हो, तो `check` उनकी keys की तुलना भी करता है: `.env` में कोई key जो documented न हो (`EXTRA in .env: FOO (not in .env.example)`) आमतौर पर एक typo होती है, और बिना local value वाली template key `MISSING in .env: BAR (in .env.example, not set locally)` के रूप में reported होती है। `--file` दोनों तुलनाओं के लिए template चुनता है; बिना `.env` file के यह extra check छोड़ दिया जाता है। `--json` mode में findings, मौजूदा `missing`, `extra`, `unused` और `invalid` fields के साथ-साथ `envExtra` और `envMissing` के रूप में आती हैं — `unused` documented-but-unused keys को उसी नाम से list करता है जो `scan --json` इस्तेमाल करता है, और `extra` compatibility के लिए वही identical list रखता है।

Scanner, `const`, `let` या `var` से declared simple local aliases के ज़रिए dot access और static bracket keys ढूँढता है, जैसे `const env = process.env; env.PORT`। यह `import.meta.env` के साथ भी काम करता है। Text scanner declaration के बाद के reads को track करता है। Reassignment, shadowing, alias chains और alias के ज़रिए destructuring उसके दायरे से बाहर हैं।

`check` जब भी कोई finding print करता है तो 1 पर exit होता है, और `--json` का `ok` भी वही value रखता है, इसलिए CI job ठीक तब fail होता है जब output कोई समस्या बताए; पूरी तरह साफ़ project 0 पर exit होता है। `UNUSED` भी एक finding गिना जाता है: template में बची हुई key, जिसके code usage ख़त्म हो चुके हैं, run को fail करती है, इसलिए आख़िरी usage हटाते समय उसे template से भी हटा दें। एकमात्र अपवाद वह project है जिसमें `process.env` का कोई usage ही न हो — जैसे कोई fresh scaffold: तब `check` हर key के लिए एक `UNUSED` line के बजाय एक ही note (और `--json` में एक `note` field) के साथ pass होता है, क्योंकि template के drift होने के लिए अभी कोई code ही नहीं है।

`env-saaf print` env file (default रूप से `.env`, या `--file`) को schema के ख़िलाफ़ load और validate करता है और प्रभावी configuration (coerced values और defaults) को हर `sensitive: true` rule और secret जैसे नाम वाली key को mask करके print करता है — text और `--json` दोनों में; `--json` वही object print करता है। `--reveal` असली values बिना mask के दिखाता है, सिर्फ़ local debugging के लिए — CI logs में कभी इस्तेमाल न करें। Validation failure पर वही messages और exit 1 मिलता है जो `check --schema` देता है, इसलिए यह pre-flight check का काम भी करता है। इसके लिए `--schema` ज़रूरी है।

`--schema` opt-in है: उसके बिना, `check` सिर्फ़ key presence की तुलना करता है। उसके साथ, `check` schema file को load करता है (`module.exports = { PORT: { type: 'port', required: true } }`, checked directory के relative resolve करके) और असली `.env` file की values पर वही `validateEnv` चलाता है जो library इस्तेमाल करती है। कोई type error `INVALID: PORT: expected a port (0-65535, e.g. 3000), got "not-a-port"` के रूप में reported होता है और check को fail करता है (exit 1); `--json` mode में failures `invalid` field में आती हैं। Schema के ख़िलाफ़ validate करने के लिए values file चुनने में `--values <file>` को प्राथमिकता मिलती है (उदाहरण के लिए `.env.production` या `.env.staging`), जबकि `.env.example` (या `--file`) template बनी रहती है, और missing file एक usage error है; बिना `--values` के, कोई explicit `--file` template चुनता है और validate होने वाली file का काम भी करता है; बिना `.env`, बिना `--values` और बिना explicit `--file` के, value validation चरण छोड़ दिया जाता है (template के placeholders असली values नहीं हैं)। `--schema` के साथ, `check` schema को example file से भी मिलाता है: schema में declared लेकिन `.env.example` से गायब key `NOT DOCUMENTED` के रूप में report होती है, और ऐसी example key जिसे schema declare नहीं करता वह `NOT IN SCHEMA` के रूप में report होती है (grouped schemas `DB_HOST` जैसे flattened names से तुलना करते हैं)। दोनों check को fail करते हैं और `--json` में `schemaNotDocumented` और `documentedNotInSchema` के रूप में आते हैं। जो schema file load न हो सके (या schema object export न करे) वह usage error है: एक साफ़ message और exit 2। `--json-schema` के साथ, `check` check चलाने के बजाय `--schema` file को एक draft 2020-12 JSON Schema document के रूप में stdout पर print करता है, ताकि editors और CI validators उसे सीधे इस्तेमाल कर सकें; `.env.example` कभी पढ़ी ही नहीं जाती, इसलिए कोई schema example file के मौजूद होने से पहले भी convert हो जाता है। बिना `--schema` के convert करने को कुछ नहीं है, इसलिए flag एक usage error है (exit 2)।

### GitHub Actions में `check` चलाना

एक minimal workflow जो तब pull request को fail करता है जब code और `.env.example` अलग हो जाएँ। इसे `.github/workflows/env-check.yml` में copy करें:

```yaml
name: env-check

on: [push, pull_request]

jobs:
  env-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      # Optional: build a .env from Actions secrets so `check` can also compare its keys
      # with the template. Leave this step out to check only code against .env.example.
      - name: Write .env from secrets
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          API_KEY: ${{ secrets.API_KEY }}
        run: printf 'DATABASE_URL=%s\nAPI_KEY=%s\n' "$DATABASE_URL" "$API_KEY" > .env
      - run: npx env-saaf check .
```

असली secrets repository के Actions secrets (Settings, Secrets and variables, Actions) से आते हैं, कभी repo से नहीं: सिर्फ़ `.env.example` commit करें और `.env` को `.gitignore` में रखें। ऊपर वाली `.env` सिर्फ़ job के temporary checkout के अंदर मौजूद होती है। `check` सिर्फ़ key names की तुलना करता है और values कभी print नहीं करता, इसलिए कोई secret log में नहीं आता। बिना `.env` के भी job code और `.env.example` की तुलना करता है; उसके साथ वह `EXTRA in .env` / `MISSING in .env` keys भी report करता है (1.4.0 से उपलब्ध; 1.3.0 के साथ `check` सिर्फ़ code और `.env.example` की तुलना करता है)। कोई भी finding 1 पर exit होती है और job को fail करती है।

Optional `.env` step की दो सीमाएँ: कोई key सिर्फ़ तब *missing* होती है जब वह absent हो, इसलिए जो secret set न हो वह अब भी खाली value के साथ `API_KEY=` लिखता है और key check pass करता है (`check` कोई value check नहीं है; उसके लिए startup पर `validateEnv` इस्तेमाल करें)। और `printf` हर secret को verbatim लिखता है, इसलिए हर secret को एक ही line पर रखें; multi-line secret extra `NAME=value` entries के रूप में पढ़ा जाएगा।

### Schema से `.env.example` बनाना

Schema पहले से हर key को जानता है — example file हाथ से लिखने के बजाय उसी से बनाएँ:

```js
const { generateExample } = require('env-saaf');
const fs = require('node:fs');
fs.writeFileSync('.env.example', generateExample({
  PORT:    { type: 'port', required: true },
  API_KEY: { type: 'string', required: true },
}));
```

```env
# Generated by env-saaf — put real values in .env (never commit .env)
# type: port, required
PORT=3000
# type: string, required
API_KEY=
```

जो keys secrets जैसी लगती हैं (`API_KEY`, `DB_PASSWORD`, …) उन्हें खाली placeholder मिलता है — उनके लिए सुझाने लायक कुछ सुरक्षित नहीं है। दूसरी keys को type-based placeholder मिलता है, और explicit `default` वैसा ही इस्तेमाल होता है। `aliases` वाली keys deprecated fallback names नोट करती हैं (`# type: url, required; also accepts DATABASE_URL (deprecated)`), और `requiredIf` वाली keys condition नोट करती हैं (`# type: url; required when MODE is 'production'`, या `in` form के लिए `required when MODE is one of 'staging', 'production'`)।

### अपने schema से JSON Schema export करना

`toJsonSchema(schema)` documentation, editor tooling, या **coerced values** के validation के लिए एक [draft 2020-12 JSON Schema](https://json-schema.org/draft/2020-12) लौटाता है, raw `.env` strings के लिए नहीं। यह environment variables नहीं पढ़ता और न ही custom callbacks चलाता है। Grouped schemas object schemas के रूप में nest होते हैं, inner rules `properties` के रूप में और उनकी required keys group की अपनी `required` list में।

```js
const { toJsonSchema } = require('env-saaf');

const schema = toJsonSchema({
  PORT: { type: 'port', required: true },
  LOG_LEVEL: { choices: ['info', 'warn'], default: 'info' },
});

console.log(JSON.stringify(schema, null, 2));
// PORT is required and must be an integer from 0 to 65535.
// LOG_LEVEL is an optional string with enum ['info', 'warn'] and default 'info'.
```

Numeric, length और item bounds JSON Schema keywords बन जाते हैं। Arrays अपने coerced items का वर्णन करते हैं, durations milliseconds होते हैं, और dates ISO date-time strings में serialize होते हैं (schema `date` format भी स्वीकार करता है)। `json` type किसी भी JSON shape की अनुमति देता है। JSON-compatible `choices` बिना दोबारा coercion के `enum` values बन जाते हैं। Representable defaults annotations के रूप में coerced form में export होते हैं; JSON Schema missing values को नहीं भरता। Schema defaults या choices में, जो share किए जाएँगे, secrets रखने से बचें।

**Represent नहीं होता:** `transform`, `validate`, `requiredIf`, `aliases`, `sensitive`, input trimming और splitting, regular-expression flags (flagged patterns छोड़ दिए जाते हैं), और वे defaults जो बिना नुकसान के JSON में convert नहीं हो सकते या local time पर निर्भर हों। File existence और विस्तृत `base64` और `semver` checks runtime-only रहते हैं। Standard formats default रूप से annotations हैं, और उनके rules env-saaf के checks से अलग हो सकते हैं। JSON Schema string lengths के लिए Unicode characters गिनता है; env-saaf JavaScript UTF-16 code units गिनता है। Runtime validation के लिए `validateEnv` या `loadEnv` इस्तेमाल करें।

### Secrets leak किए बिना config log करना

```js
const { maskSecrets } = require('env-saaf');
console.log(maskSecrets(process.env)); // values masked: sk***56
```

खाली value खाली ही रहती है — `maskValue('')`, `''` लौटाता है, इसलिए unset secret अब logs में set नहीं दिखता।

`maskSecrets` recurse भी करता है: nested plain objects और arrays अपना shape बनाए रखते हैं, और हर scalar leaf उन्हीं `maskValue` rules से mask होता है, ताकि कोई parsed config सुरक्षित रूप से log हो (`maskSecrets({ DB: { PASSWORD: 'hunter2' }, TAGS: ['a', 'b'] })` → `{ DB: { PASSWORD: 'hu***r2' }, TAGS: ['****', '****'] }`)। Non-plain values (`Date`, class instances) leaves मानी जाती हैं, cycle जैसा repeated reference hang होने के बजाय fixed placeholder `'[Circular]'` से बदल दिया जाता है, और input object कभी mutate नहीं होता। TypeScript में return type input shape को recursively mirror करता है (`Masked<T>`), जिसमें हर leaf `string` type की होती है।

## env-saaf की तुलना envalid, joi, और zod से

| | `env-saaf` | `envalid` | `joi` | `zod` |
| --- | --- | --- | --- | --- |
| **दायरा** | सिर्फ़ environment variables (flat key-value maps) | सिर्फ़ environment variables | General-purpose schema validation (requests, payloads, config) | General-purpose schema validation (requests, forms, config) |
| **Runtime dependencies** | Zero | Zero | कई `@hapi/*` packages | Zero |
| **`.env` loading और CLI tooling** | Built-in `.env` parser (`loadEnv`/`parseEnvFile`), `scan`/`check`/`example`/`init` CLI, secret masking | सिर्फ़ validation (Node `--env-file` या `dotenv` के साथ जोड़ें) | सिर्फ़ validation (Node `--env-file` या `dotenv` के साथ जोड़ें) | सिर्फ़ validation (Node `--env-file` या `dotenv` के साथ जोड़ें) |
| **Error aggregation** | सारे errors एक ही pass में इकट्ठा करता है (`EnvSaafError`, या `throwOnError: false` के साथ `{ env, errors }`) | सारे errors एक ही pass में इकट्ठा करता है (default या custom `reporter` को दिए जाते हैं) | Default रूप से पहले error पर रुकता है; सभी इकट्ठा करने के लिए `{ abortEarly: false }` पास करें | सारे issues एक ही pass में इकट्ठा करता है (`parse` से `ZodError`, या `safeParse` से `{ success, error }`) |
| **TypeScript inference** | `index.d.ts` के साथ आता है; inline / `as const` schemas से flat object types infer करता है (`json`, `unknown` के रूप में infer होता है, `choices` widened रहता है) | TypeScript में लिखा गया; validator return types infer करता है, `choices` के लिए literal unions समेत | Types के साथ आता है, लेकिन schemas से static TS types infer नहीं करता (interfaces अलग से define करें या codegen इस्तेमाल करें) | TypeScript-first static inference (`z.infer<typeof schema>`), nested objects, unions, literals, और transforms पर |

हालाँकि तुलना कोई migration path नहीं है — `dotenv`, `dotenv-safe` और `envalid` से concrete before/after steps के लिए नीचे [env-saaf पर migrate करना](#migrating-to-env-saaf) देखें।

### जब `env-saaf` एक अच्छा fit है

- आपको startup env validation, `.env` file loading (layering और `${VAR}` interpolation के साथ), secret masking, और `.env.example` को code के साथ sync रखने के लिए एक CI CLI (`env-saaf check`) चाहिए — सब कुछ एक ही zero-dependency Node.js package में।

### जब कोई दूसरी library बेहतर fit है

- **HTTP requests, API payloads, forms, या nested JSON validate करना:** `env-saaf` सिर्फ़ flat environment variable maps validate करता है और उसमें nested object schemas या cross-field conditional rules नहीं हैं। जब आपको general data validation चाहिए तो **zod** (ख़ासकर TypeScript में) या **joi** इस्तेमाल करें।
- **आप project में पहले से `zod` या `joi` इस्तेमाल करते हैं:** अगर आप request/data validation के लिए पहले से उनमें से किसी एक पर निर्भर हैं और आपको `env-saaf` के `.env` parser या `scan`/`check` CLI की ज़रूरत नहीं है, तो `process.env` को अपनी मौजूदा library से validate करने से एक और tool जोड़ने से बचा जा सकता है।
- **बेहतर TypeScript inference या non-Node runtimes:** पूरी static type inference (nested shapes, discriminated unions, narrowed literal enums) या browser/edge runtime support के लिए **zod** इस्तेमाल करें (`env-saaf` Node built-ins `node:fs`, `node:net`, और `node:path` इस्तेमाल करता है)। अगर आपको `devDefault`, proxy-guarded env access, या `choices` से literal-union inference के साथ env-only validation चाहिए तो **envalid** इस्तेमाल करें।

## env-saaf पर migrate करना

तीन छोटे रास्ते, हर एक एक पूरे snippet के साथ ख़त्म होता है जो मौजूदा API पर चलता है (इस release के ख़िलाफ़ verified)। `.env` file को ख़ुद कभी बदलना नहीं पड़ता।

### `dotenv` से (हाथ से किए गए `process.env` reads)

`.env` file को ठीक वैसा ही रखें जैसा वह है। बिखरे हुए `process.env.X` reads को एक schema और `loadEnv` से बदल दें, जो `.env` को parse करता है, हर value को validate करता है और typed results लौटाता है — और हर read को ढूँढने के लिए पहले `env-saaf scan` चलाएँ।

```bash
npx env-saaf scan ./src          # every env var your code actually uses, one per line
npx env-saaf scan ./src --json   # same list as JSON, for scripts
```

```js
// before — dotenv + hand-rolled reads, nothing validated
require('dotenv').config();
const port = Number(process.env.PORT || 3000);   // 'abc' -> NaN, silently
const dbUrl = process.env.DATABASE_URL;          // may be undefined

// after — same .env file, one schema, typed + validated at startup
const { loadEnv } = require('env-saaf');
const env = loadEnv({
  PORT: { type: 'port', default: 3000 },          // validated integer 0-65535, default 3000
  DATABASE_URL: { type: 'url', required: true },  // throws if missing or malformed
  DEBUG: { type: 'boolean', default: false },     // 'yes'/'on'/'1' -> true
});
// env.PORT is a number, env.DATABASE_URL a valid URL; a bad or missing value
// throws EnvSaafError listing *every* problem at once (or pass
// { throwOnError: false } to get { env, errors } instead).
```

### `dotenv-safe` से (`.env.example` contract)

`dotenv-safe` boot पर तब fail होता है जब `.env` में कोई ऐसी key missing हो जो `.env.example` declare करता है। env-saaf वही `.env.example` file रखता है और contract check को वहाँ ले जाता है जहाँ drift असल में होता है — CI में — साथ में boot पर एक schema check भी।

| `dotenv-safe` | env-saaf |
| --- | --- |
| Code में `require('dotenv-safe').config({ example: '.env.example' })`; missing key पर boot crash | `.env.example` को बिना बदले रखें; `npx env-saaf check` उसकी तुलना आपके code और आपकी असली `.env` से करता है (किसी भी `MISSING` / `EXTRA` / `UNUSED` / `INVALID` finding पर exit 1) |
| कोई type validation नहीं — हर value string ही रहती है | `loadEnv(schema)` boot पर हर value को coerce और validate करता है (`port`, `url`, `boolean`, …) |
| `allowEmptyValues: false` option | `sensitive: true` value को errors/output में mask करता है और उसका `.env.example` placeholder खाली छोड़ता है; खाली *optional* values अब भी allowed रहती हैं |

```js
// before — dotenv-safe
require('dotenv-safe').config({ example: '.env.example', allowEmptyValues: false });
const port = process.env.PORT; // still a string

// after — same .env.example, checked in CI and validated at boot
// (CI)   npx env-saaf check .          -> exit 1 listing every drift finding
// (boot) const { loadEnv } = require('env-saaf');
//        const env = loadEnv({ PORT: { type: 'port', required: true } });
//        env.PORT // number, already validated
```

### `envalid` से (validator mapping)

आम validators एक-से-एक env-saaf rule types पर map होते हैं:

| envalid | env-saaf rule | फ़र्क़ जो मायने रखता है |
| --- | --- | --- |
| `str()` | `{ type: 'string' }` | default रूप से trimmed (whitespace रखने के लिए `trim: false`); `pattern` / `minLength` / `maxLength` उपलब्ध |
| `str({ default: 'dev' })` | `{ type: 'string', default: 'dev' }` | defaults दी गई values की तरह ही validate होते हैं |
| `str({ choices: ['dev', 'prod'] })` | `{ choices: ['dev', 'prod'] }` | `choices`, *coerced* value से match करता है (numbers/booleans के लिए भी काम करता है) |
| `num()` | `{ type: 'number' }` | `min` / `max` parse की गई संख्या को बाँधते हैं |
| `port()` | `{ type: 'port' }` | integer 0–65535, संख्या में parse होता है |
| `bool()` | `{ type: 'boolean' }` | `true/false`, `yes/no`, `on/off`, `1/0`, `y/n` स्वीकार करता है |
| `url()` | `{ type: 'url' }` | `protocols: ['https']` schemes की allowlist बनाता है |
| `email()` | `{ type: 'email' }` | — |
| `json()` | `{ type: 'json' }` | असली JS value में parse होता है, string नहीं |

दोनों libraries सारे errors एक ही pass में इकट्ठा करती हैं; env-saaf एक `EnvSaafError` throw करता है जिसकी `.errors` हर समस्या को list करती है (या `throwOnError: false` के साथ `{ env, errors }` लौटाता है)।

```js
// before — envalid
const { cleanEnv, str, port, bool, url } = require('envalid');
const env = cleanEnv(process.env, {
  API_URL: url(),
  PORT: port({ default: 3000 }),
  DEBUG: bool({ default: false }),
});

// after — env-saaf (same .env, same behaviour, zero-dependency, plus .env parsing + scan/check CLI)
const { loadEnv } = require('env-saaf');
const env = loadEnv({
  API_URL: { type: 'url', required: true },
  PORT: { type: 'port', default: 3000 },
  DEBUG: { type: 'boolean', default: false },
});
```

## Versions

- **v0.1.0** — core `validateEnv`: types (string/number/boolean/url/port), required, defaults, choices, all-errors-at-once।
- **v0.2.0** — `.env` file parsing, code scanning (used vs documented diff), CLI (`check` / `scan`)।
- **v1.0.0** — secret masking, schema से और code scan से `.env.example` generation, TypeScript definitions, stable API।
- **v1.1.0** — CLI `--help` 0 पर exit होता है, boolean `on`/`off`/`y`/`n`, `scanCode` को `let`/`var` destructuring मिलता है, `parseEnvFile` में inline comments हटते हैं, `.mts`/`.cts` files scan होती हैं।
- **v1.2.0** — `email` type और `pattern` option, CLI `--json` output, per-key `transform`, `${VAR}` interpolation, multi-file `loadEnv`, multiline quoted values, CLI `--no-color`, `min`/`max` के साथ `int` type, README recipes।
- **v1.5.0** — `duration` और `host` types, `date` और `file` types, non-throwing mode, `${VAR:-default}` interpolation, CLI `--schema` validation, `.env` files में duplicate-key और bare-line errors, `scan`/`check`/`example` directory validation, Express example, README types reference table।
- **v1.6.0** — `bigint` और `ipv6` types, grouped (nested) schemas, per-item coercion के साथ `array` type, `requiredIf`/`aliases`/`conflictsWith`/`deprecated` rule options, `loadEnvAsync`, `toJsonSchema` export, CLI `init` और `print` commands, `check --fix`, `check` में असली-secret पहचान, single-file `scan`/`check`, property-based fuzz tests — अब तक की सबसे बड़ी release, कई बाहरी योगदानों के साथ।
- **v1.7.0** — JSON Web Token आकार जाँच के लिए `jwt` type, सख्त schemas (non-array `choices` और `hex` से बाहर `length` पहले से ही reject), कई files में layered `loadEnv` interpolation, `scanCode` alias destructuring, masked non-string secrets, `int`/`number` में unsafe-integer rejection, `print` में secret masking, और खाली project के `scan --json` test का fix।
- **v1.4.0** — `ipv4`, `semver` और `base64` types, CLI `check` असली `.env` keys की तुलना करता है, CLI `--version`, `example --write`, `scan` UNUSED warnings, `check` हर finding पर 1 से exit होता है, `scanCode` comments/strings को ignore करता है, defaults दी गई values की तरह validate होते हैं, subcommand के बाद `--help`, `parseEnvFile` में escaped quotes, `port` 0 स्वीकार करता है, GitHub Actions workflow docs।
- **v1.3.0** — `json`, `uuid` और `hex` types, `minLength`/`maxLength` और `hex` `length` options, `trim: false`, `loadEnv` return-type inference, secret keys के लिए सुरक्षित `.env.example` generation, `assign: true` JSON fix।

## योगदान

Issues और pull requests का स्वागत है — छोटे से छोटे भी। [`good first issue`](https://github.com/abhi478jeetur-rgb/env-saaf/labels/good%20first%20issue) label वाले issues से शुरुआत करें, और कृपया पहले [CONTRIBUTING.md](CONTRIBUTING.md) पढ़ें: वह zero-dependency नियम और tests चलाने का तरीका समझाता है।

## Contributors

env-saaf उन सभी की वजह से मौजूद है जिन्होंने code, fixes और ideas का योगदान दिया है। Maintainer के बाहर **23 लोगों** के merged pull requests अब तक land हो चुके हैं:

- [@abdul-karim-mia](https://github.com/abdul-karim-mia) — सबसे पहले बाहरी contributor
- `@HarshRajSinghania` — CLI `--json` output
- [@Golden007-prog](https://github.com/Golden007-prog)
- [@harshit3355](https://github.com/harshit3355)
- [@bfs2021](https://github.com/bfs2021)
- [@enidchen0125](https://github.com/enidchen0125)
- [@theroimasters1-dev](https://github.com/theroimasters1-dev)
- [@kamrullab](https://github.com/kamrullab)
- [@Veeramanikandanr48](https://github.com/Veeramanikandanr48)
- [@rise11hx-cmyk](https://github.com/rise11hx-cmyk)
- `@P1LOTRX` — defaults दी गई values की तरह validate होते हैं
- [@emreocell](https://github.com/emreocell)
- [@IG-ABHINAV](https://github.com/IG-ABHINAV)
- [@flipcyde101](https://github.com/flipcyde101)
- [@swpswpswp](https://github.com/swpswpswp)
- [@tnalbant](https://github.com/tnalbant)
- [@jamesyshd19-cmyk](https://github.com/jamesyshd19-cmyk) — `init` custom schema path इस्तेमाल करता है
- [@abhinavrastogi2627](https://github.com/abhinavrastogi2627) — ambiguous aliases reject होते हैं
- `DeviousCardi` — grouped schemas, CLI watch mode, migration guide और भी बहुत कुछ (नौ PRs)
- [@ghosh-shrestha](https://github.com/ghosh-shrestha) — unknown rule options reject होते हैं
- [@echuq](https://github.com/echuq) — radix-prefixed numbers और invalid env-file keys reject होते हैं
- [@sharkohark1234](https://github.com/sharkohark1234) — `toJsonSchema` grouped schemas संभालता है; `check --json-schema`
- [@saadBinMumtaz](https://github.com/saadBinMumtaz) — `init --from-example --groups`

यह wall अपने आप बढ़ती है, जैसे-जैसे नए pull requests land होते हैं:

<a href="https://github.com/abhi478jeetur-rgb/env-saaf/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=abhi478jeetur-rgb/env-saaf" alt="env-saaf contributors" />
</a>

नई guides [project wiki](https://github.com/abhi478jeetur-rgb/env-saaf/wiki) में हैं — वहाँ CLI guide और types reference से शुरुआत करें।

## License

MIT © Abhijeet Kumar
