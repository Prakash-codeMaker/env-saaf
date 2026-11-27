# env-saaf

适用于 Node.js 的零依赖环境变量校验器。在启动时快速失败并给出清晰的错误，同时返回**带类型**的值。

[![npm version](https://img.shields.io/npm/v/env-saaf.svg)](https://www.npmjs.com/package/env-saaf) [![npm downloads](https://img.shields.io/npm/dm/env-saaf.svg)](https://www.npmjs.com/package/env-saaf) [![GitHub stars](https://img.shields.io/github/stars/abhi478jeetur-rgb/env-saaf.svg)](https://github.com/abhi478jeetur-rgb/env-saaf/stargazers) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/abhi478jeetur-rgb/env-saaf/blob/main/LICENSE)

**其他语言版本：** [English](README.md) · [Español](README.es.md) · [Português](README.pt-BR.md) · [हिंदी](README.hi.md)

## 问题所在

对开发者真实痛点的调研显示，同样的 `.env` bug 反复出现：

- 每个 `process.env` 值都是**字符串**：`DEBUG=false` 是真值，而 `"3000" + 1` 会变成 `"30001"`。
- 变量缺失不会在启动时失败——而是在**生产环境**中、在第一个需要它的请求到来时失败。
- `.env.example` 只说明了*应该*存在什么，而不是你的代码*实际*使用什么——两者会悄无声息地渐渐不一致。
- 逐个检查变量既繁琐，而且第一个错误会掩盖所有其他错误。

现有的解决方案（zod、envalid）功能强大，但对小项目来说太重了。`env-saaf`（`saaf` = साफ़，意为干净/清晰）以**零依赖**完成这件核心工作。

## 安装

```bash
npm install env-saaf
```

## 使用

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

`validateEnv` 将空字符串（`''`）与未设置的变量同等对待：没有 `default` 的可选键会从结果中省略，`required` 键会以缺失为由报错（`missing required variable`），而带有 `default` 的键则改用该默认值。这与[加载真正的 `.env` 文件](#loading-a-real-env-file)一节中的 `${VAR:-fallback}` 行为一致，后者同样把展开为空的值视为未设置。只有 `''` 算作未设置——仅含空白字符的输入（如 `'   '`）会被视为已提供（对于 `string` 类型，默认会修剪成 `''`；使用 `trim: false` 时则保持原样）。

### 类型参考

环境输入都是字符串。下表中的输出是应用可选 `transform` 之前的。

| 类型 | 接受的输入 | JavaScript 输出 | 其他规则选项 |
| --- | --- | --- | --- |
| `string` | 任何非缺失文本（默认类型） | `string` | `trim`、`minLength`、`maxLength`、`pattern` |
| `number` | 非空的十进制文本，包括小数和指数记法。拒绝进制前缀（`0x`、`0b`、`0o`）、`NaN` 和非有限值。 | `number` | `trim`、`min`、`max` |
| `int` | 纯十进制整数字面量：可选符号加数字，例如 `42`、`-3`、`007`。小数和科学记数写法（`1.0`、`1e3`）以及进制前缀都会被拒绝。 | `number` | `trim`、`min`、`max` |
| `boolean` | 不区分大小写的 `true/false`、`1/0`、`yes/no`、`on/off`、`y/n` | `boolean` | 无 |
| `url` | 能被 `new URL()` 接受的绝对 URL，不做规范化 | `string` | `trim`、`minLength`、`maxLength`、`pattern`、`protocols` |
| `file` | 指向一个存在、可读的普通文件的路径。相对路径以进程的工作目录为基准。 | `string` | `trim`、`minLength`、`maxLength`、`pattern` |
| `port` | 0 到 65535 之间的纯十进制整数字面量（可选 `+` 号加数字，例如 `3000`、`+42`）。小数和科学记数写法（`8080.0`、`1e3`）以及进制前缀都会被拒绝。 | `number` | `min`、`max` |
| `email` | 一个 `@`、非空的本地部分、域名中含有一个内部点、域名不能以点开头或结尾、无空白字符 | `string` | `trim`、`minLength`、`maxLength`、`pattern` |
| `json` | 有效的 JSON 文本（对象、数组或原始值）。接受已经解析好的默认值。 | 解析后的 JSON 值 | `trim`。对于数值结果，可用 `min` 和 `max`。 |
| `uuid` | 规范的 8-4-4-4-12 十六进制分组，大小写均可 | `string` | `trim`、`minLength`、`maxLength`、`pattern` |
| `hex` | 一个或多个十六进制字符，不带 `0x` 前缀 | `string` | `trim`、`length`、`minLength`、`maxLength`、`pattern` |
| `ipv4` | 四个十进制八位组，每组 0 到 255；不允许前导零 | `string` | `trim`、`minLength`、`maxLength`、`pattern` |
| `ipv6` | 任何被 `net.isIP` 识别为 IPv6 的地址，包括压缩形式、IPv4 映射形式和 `%zone` 形式 | `string` | `trim`、`minLength`、`maxLength`、`pattern` |
| `semver` | `MAJOR.MINOR.PATCH`，可选的预发布和构建后缀，以及一个可选的小写 `v` 前缀（`v1.2.3`）。拒绝数字部分的前导零和大写 `V`。 | `string` | `trim`、`minLength`、`maxLength`、`pattern` |
| `base64` | 标准或 URL 安全字母表，填充可选。 | `string` | `trim`、`minLength`、`maxLength`、`pattern` |
| `date` | 有效的 `YYYY-MM-DD`，或带 `T` 以及小时/分钟的日期时间；秒、小数部分以及 `Z` 或数字偏移可选。接受有效的 `Date` 默认值。 | `Date` | `trim`、`min`、`max`（ISO 日期字符串） |
| `duration` | 人类可读的时长：`500ms`、`30s`、`15m`、`2h`、`1d`、`1w`，以及复合形式如 `1h30m`；裸数字表示毫秒 | `number`（毫秒） | `trim`、`min`、`max`（毫秒数或时长字符串，例如 `min: '30s'`） |
| `host` | 主机名（`db.internal`、`localhost`、`example.com.`）或 IPv4/IPv6 地址；会保留末尾单个 DNS 根点；不带协议、路径或端口 | `string` | `trim`、`minLength`、`maxLength`、`pattern` |
| `array` | 按 `separator`（默认 `,`）拆分的分隔列表，每个元素按 `of`（默认 `string`）进行转换。空元素会被拒绝。接受数组默认值。 | 带类型的数组（`T[]`） | `of`、`separator`、`trim`、`protocols`（当 `of: 'url'` 时）、`minItems`、`maxItems`、`unique`、`skipEmpty` |

所有类型都支持 `required`、`requiredIf`、`conflictsWith`、`default`、`description`、`validate`、`transform`、`sensitive` 和 `aliases`。设置 `sensitive: true` 后，无论键名是什么（例如 `SESSION_ID`、`LICENSE_KEY`），该键的值在校验错误和 CLI 输出中始终会被掩码处理，并且在 `generateExample` 中其占位符会留空。设置 `aliases: ['OLD_NAME']` 可以接受已弃用的变量名作为后备，并发出警告（见下文）。自定义 `validate(value, env)` 函数在类型转换和内置检查之后（包括对默认值）运行，在 `transform` 之前。`transform` 在校验之后作用于所提供的值。缺失的可选键会被省略，默认值也会被校验。`choices` 选项匹配转换后的字符串、数字或布尔值。解析后的 JSON 值如果属于这三种类型之一，也可以匹配某个选项。字符串输入默认会被修剪。设置 `trim: false` 可以让类字符串类型保留空白。对于 `number` 和 `int`，数值周围的空白在两种设置下都会被接受，但纯空白文本默认会被拒绝，使用 `trim: false` 时则会转换为 `0`。布尔匹配始终忽略周围的空白。`length` 选项只适用于 `hex`。`pattern`、`minLength` 和 `maxLength` 选项只适用于字符串值的类型（`string`、`email`、`url`、`file`、`uuid`、`hex`、`ipv4`、`ipv6`、`semver`、`base64`、`host`），在任何其他类型上使用都会被预先拒绝。具体示例见下文各节。

### 条件必填（`requiredIf`）

仅当另一个变量等于某个特定值（`equals`）或属于若干值之一（`in`）时，才要求该变量必填：

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  SENTRY_DSN:    { type: 'url', requiredIf: { key: 'MODE', equals: 'production' } },
  ALERT_WEBHOOK: { type: 'url', requiredIf: { key: 'MODE', in: ['staging', 'production'] } },
  MODE:          { type: 'string', choices: ['development', 'staging', 'production'], default: 'development' },
});
```

`validateEnv` 分**两轮**求值 schema：

1. **第一轮**转换每个所提供变量，应用 `default` 值，运行所有逐键检查（`min`/`max`、`minLength`/`maxLength`、`length`、`choices`、`pattern`、`transform`），并记录无条件的 `required: true` 错误。
2. **第二轮**对缺失且没有 `default` 的键求值每条 `requiredIf` 规则，与第一轮校验后的值进行比较（如果被引用的键没有在 schema 中声明，则回退到原始的 `env` 对象）。

由于第二轮在第一轮完成之后运行，键在 schema 中的声明顺序无关紧要（`SENTRY_DSN` 可以声明在 `MODE` 之前），而且条件匹配的是转换后的值（例如 `boolean` 的 `true` 或 `int` 的 `3`）以及 `default` 值。当条件成立且键缺失时，`validateEnv` 会报告通常的 `<KEY>: missing required variable` 错误（或者在使用 `{ throwOnError: false }` 时将其收集到 `errors` 中）。当条件不成立时——或者被引用的键缺失、或未通过第一轮校验时——该键保持可选。如果该键还是被提供了，它仍会照常被转换和校验。有两种组合会被预先作为 schema 错误拒绝：同一键上同时有 `required: true` 和 `requiredIf`，以及 `requiredIf` 引用了它自己的键——两者都是自相矛盾的，因此 schema 会直接失败，而不是悄悄忽略条件。
### 非抛出模式——收集错误而非抛出

健康检查、CLI，或者想以功能降级模式启动的服务器，无法使用那种遇到第一个错误值就抛出的 API。传入 `{ throwOnError: false }`，`validateEnv` 就会改为返回 `{ env, errors }`：`env` 保存所有校验通过的值，`errors` 则是 `EnvSaafError` 本会携带的同一份列表。

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

默认行为不变：不传该选项，或传入 `{ throwOnError: true }` 时，无效值仍然会抛出一个列出所有问题的 `EnvSaafError`。schema 本身格式错误时仍然会抛出——那是代码里的 bug，而不是环境的问题。`loadEnv` 也保持抛出，因为它在 `{ assign: true }` 时会写入 `process.env`，写一半的状态比启动失败更糟；需要错误列表时请调用 `validateEnv`。

### 自定义错误消息：`formatError`

`EnvSaafError.message` 是一个固定的项目符号列表。若要将失败信息接入结构化日志、Slack 提醒或启动横幅，可以给 `validateEnv`（或 `loadEnv`，它会透传）传入可选的 `formatError(errors, context)`：

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

- `errors` 是 `error.errors` 所携带的同一份原始诊断信息的只读副本。这些是现有的消息，因此可能包含非敏感输入的示例（`sensitive: true` 键的值和以前一样保持掩码）。`context` 是独立的，只包含 `{ keys }`，即 schema 的键名；环境对象和 schema 规则永远不会被传入。
- 你返回的字符串会成为 `error.message`。`error.errors` 保持不变；不使用该选项时，消息与之前逐字节相同。
- 如果钩子函数抛出异常，或返回的不是字符串，则回退到默认消息。`formatError` 不是函数时是 `TypeError`。
- 使用 `{ throwOnError: false }` 时不会抛出错误，因此钩子不会被调用，结果中的 `errors` 保持原始状态。`loadEnv` 始终抛出，因此它会把钩子转发用于校验失败。校验之前发生的失败，例如 `.env` 文件不可读或无法解析，会抛出它们自己的错误，不在钩子的作用范围内。schema 格式错误也不会被格式化。

在 TypeScript 中，`{ throwOnError: false }`（不是 `formatError`）会将返回类型收窄为 `ValidateResult<S>`（`{ env: EnvResult<S>; errors: string[] }`），因此 `env.PORT` 保持从 schema 推断出的类型。

### 严格模式——捕捉变量名的拼写错误

默认情况下，`validateEnv` 只查看 schema 中的键。使用 `{ strict: true }` 后，它还会标记那些已设置但不在 schema 中的变量——这样，真正的 `DATABASE_URL` 旁边的拼写错误 `DATABSE_URL` 就不会再溜过去：

```js
const env = validateEnv(schema, process.env, { strict: true });
// throws EnvSaafError listing e.g. "DATABSE_URL: set but not in schema (strict mode)"
```

接近的拼写会被点名提示：当缺少必填键，而某个已设置但未声明的键在忽略大小写后同名或仅相差一次编辑（例如 `PROT`/`PORT` 对调）时，错误消息会以 `(did you mean PROT? it is set but not in the schema)` 结尾。严格模式的多余键也会在反方向获得对应的提示。只会建议键名，绝不会回显值，即使对于 `sensitive` 规则也是如此。

严格模式默认关闭——许多应用会与其他工具共享同一个环境。

### 用 `aliases` 安全地重命名变量

在整个机群范围内重命名一个环境变量，通常意味着新旧名称会共存数周。在规范键上用 `aliases` 声明旧名称：

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

- 当 `DATABASE_URL` 未设置（或为空 `""`）而 `DB_URL` 已设置时，第一个有值的别名会在 `env.DATABASE_URL` 名下提供该值，经过正常的转换、校验和 `transform`，并发出一条弃用警告（`env-saaf: DB_URL is deprecated; use DATABASE_URL instead`）。
- 当 `DATABASE_URL` 和 `DB_URL` 都已设置时，`DATABASE_URL` 胜出，并有一条警告说明该别名被忽略（`env-saaf: DB_URL is ignored because DATABASE_URL is set`）。
- 警告永远不会导致校验失败。默认情况下它们通过 `console.warn` 记录；给 `validateEnv` 或 `loadEnv` 传入 `onWarn: fn` 可以将它们转到你自己的日志器（或传 `() => {}` 将其静默）。
- 在 `{ strict: true }` 模式下，已声明的别名会被识别，不会被标记为未知变量。
- 别名不能等于任何已声明的 schema 键（包括它自己的键），也不能被不同的规则共享。这些 schema 错误会在读取值之前抛出 `EnvSaafError`，即使使用 `{ throwOnError: false }` 也是如此。在同一条规则内重复某个别名是允许的。

### 带键前缀的分组（嵌套）schema

对于反复重复同一前缀的 schema，可以改为把规则分组到该前缀之下：

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

- 一个分组就是一条带有 `schema` 对象、没有 `type`，并带有非空 `prefix` 的规则。每条内部规则都从 `prefix + INNER_NAME` 读取，因此错误始终会写出完整的环境变量名（`DB_HOST: missing required variable`）。
- 结果会嵌套在分组键之下：`{ DB: { HOST, PORT } }`。如果没有任何内部键存在，分组键会被省略，就像缺失的可选扁平键一样。
- `strict`、`aliases`、`requiredIf` 和 `default` 在分组内都有效；在分组内，`aliases` 和 `requiredIf.key` 使用**完整的环境变量名**（例如 `aliases: ['DATABASE_HOST']`、`requiredIf: { key: 'NODE_ENV', equals: 'production' }`，或另一个分组的 `'DB_HOST'`）。
- `generateExample` 仍然输出扁平的环境变量名（`DB_HOST=...`），并在该分组的键上方加一条 `# group DB` 注释。
- `loadEnv(..., { assign: true })` 写回的是扁平名称（`DB_HOST=...`），永远不会是嵌套对象。
- 格式错误的分组会被 `validateSchema`（现已导出）预先拒绝：缺失/为空的 `prefix`、非对象或为空的 `schema`、分组上带有 `type`、嵌套分组、分组上的多余选项，或与另一个键冲突的前缀（例如同时声明了 `DB_HOST` 和一个 `DB_` 分组），都会抛出指出问题的 `EnvSaafError`。
- 在 TypeScript 中，`EnvResult` 也会嵌套分组：`env.DB` 的类型是 `{ HOST: string; PORT: number; ... } | undefined`（分组键是可选的；内部键保持各自的 required/default 可选性）。`EnvGroupRule` 已导出，可用于为独立的分组规则标注类型。

### 每个键的 `validate`——自定义校验规则

有些规则是应用特有的——某个路径必须是已存在的目录，或者两个键必须不同。这时可以在键上传入一个 `validate(value, env)` 函数，而不必 fork 这个库：

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

`validate` 在类型转换和内置检查（`min`/`max`、`minLength`/`maxLength`、`length`、`choices`、`pattern`）之后、`transform` 之前运行，也会校验 `default` 值。它接收转换后的 `value` 和输入的 `env` 对象。返回 `true`（或 `undefined`/`null`）表示通过，返回 `false` 会产生一条指出该键的通用错误，返回非空字符串则以该字符串作为错误消息而失败。抛异常的校验器会被收集到 `EnvSaafError` 中（或在使用 `{ throwOnError: false }` 时进入 `errors`），作为一条指出该键的校验失败，而不是让程序崩溃，并且会遵守 `sensitive: true` 的掩码处理。

### 每个键的 `transform`——类型转换后的一步自定义处理

有些值在类型转换后需要一小步 env-saaf 无法猜到的自定义处理——统一大小写、调整数值单位，或对解析后的数组做后处理：

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  ALLOWED_ORIGINS: { type: 'array', transform: xs => xs.map(s => s.toLowerCase()) },
  SHOUTY_NAME:     { type: 'string', transform: v => v.toUpperCase() },
});
// env.ALLOWED_ORIGINS is a lower-cased string[], env.SHOUTY_NAME is upper-cased
```

transform 在类型转换、内置检查（`min`/`max`、`minLength`/`maxLength`、`length`、`choices`、`pattern`）和自定义 `validate` 之后运行；如果它抛出异常，该错误会像其他校验错误一样被收集（并指出键名）。它的返回值会按规则声明的 `type` 进行核验（例如 `number`/`int`/`port`/`duration` 必须仍是有限的数字/整数/端口，`boolean` 必须是布尔值，`date` 必须是有效的 `Date`，`array` 必须是 `of` 元素组成的数组，`string` 及字符串类型的规则必须是有效字符串）——返回错误的类型会产生一条指出键名和期望类型的校验错误。它只作用于实际提供的值——不作用于 `default` 值（默认值仍会像任何值一样被转换和校验，因此错误的默认值会以指出键名的错误失败）。在 TypeScript 中，该键的结果类型会从 transform 的返回类型推断。

### `email` 类型与 `pattern`——校验格式

```js
const env = validateEnv({
  ADMIN_EMAIL: { type: 'email', required: true },
  SLUG:        { type: 'string', pattern: /^[a-z0-9-]+$/ },
  API_KEY:     { type: 'string', pattern: /^sk_[A-Za-z0-9]+$/ },
});
```

`email` 的检查是务实的（包含一个 `@`、非空的本地部分和域名，以及域名中的一个点），而不是完整的 RFC 5322。`pattern` 接受一个 `RegExp`，字符串值必须与之匹配（适用于 `string`、`email`、`url`、`file`、`uuid`、`hex`、`ipv4`、`ipv6`、`semver`、`base64`、`host`）；它在类型转换和 `choices` 检查之后运行，不匹配的错误会指出失败的 pattern，而在非字符串类型上使用 `pattern` 会被预先拒绝。

### `int` 类型与 `min`/`max`——整数与范围

```js
const env = validateEnv({
  MAX_RETRIES: { type: 'int', min: 0, max: 5, default: 3 },
  TIMEOUT_MS:  { type: 'number', min: 100, max: 30000 },
});
```

`int` 与 `number` 类似，但拒绝小数值（`3.5` 失败，`42` 和 `1e3` 通过）。`min` 和 `max` 适用于 `number`、`int` 和 `port`；两者可以单独使用，超出范围的值会被拒绝，并给出指出允许范围的错误。

### `json` 类型与 `minLength`/`maxLength`——结构化值与字符串长度

```js
const env = validateEnv({
  FEATURE_FLAGS: { type: 'json', default: { beta: false } },
  API_TOKEN:     { type: 'string', minLength: 10, maxLength: 64, required: true },
});
```

`json` 用 `JSON.parse` 解析该值（对象、数组和原始值都会以解析后的形式返回）；无效的 JSON 会被拒绝，并给出指出键名的错误。`default` 可以直接给一个已经解析好的对象。`minLength` 和 `maxLength` 适用于字符串值的类型（`string`、`email`、`url`、`file`、`uuid`、`hex`、`ipv4`、`ipv6`、`semver`、`base64`、`host`），在任何其他类型上使用都会被预先拒绝；两者可以单独使用，过短或过长的值会被拒绝，并给出指出允许长度的错误。它们可以与 `pattern` 组合使用（先检查长度，再检查 pattern）。

### `uuid` 和 `hex` 类型——ID 与十六进制字符串

```js
const env = validateEnv({
  TENANT_ID: { type: 'uuid', required: true },
  API_HASH:  { type: 'hex', length: 64 },
});
```

`uuid` 接受规范的 UUID（`8-4-4-4-12` 十六进制分组，大小写均可）并原样返回；格式错误的值会被拒绝，并给出指出键名的错误。`hex` 只接受十六进制字符串（`deadBEEF42` 通过，`0x1234` 不通过）；可选的 `length` 选项可以把大小精确固定为若干个字符，适用于定长令牌和哈希。

### `ipv4`、`semver` 和 `base64` 类型——网络地址、版本与编码值

```js
const env = validateEnv({
  BIND_ADDR: { type: 'ipv4', required: true },
  APP_VERSION: { type: 'semver', required: true },
  WEBHOOK_SECRET: { type: 'base64', required: true },
});
```

`ipv4` 接受点分四段地址（`192.168.0.1` 通过，`256.1.1.1` 和 `1.2.3` 不通过）；带前导零的八位组（`01.2.3.4`）会被拒绝，因为它有歧义。`semver` 接受 `MAJOR.MINOR.PATCH`，可带可选的预发布和构建后缀（`1.2.3-beta.1` 通过），以及一个可选的小写 `v` 前缀（`v1.2.3` 通过，原样返回——这是 `git describe` 和发布流水线输出的形式）；`1.2`、`vv1.2.3` 和大写的 `V1.2.3` 不通过。`base64` 接受标准字母表（`A-Za-z0-9+/`）或 URL 安全字母表（`A-Za-z0-9-_`）。填充可以省略；如果出现填充，它必须完整且位于末尾。这三者都原样返回该值，并且 `minLength`/`maxLength` 对它们和对其他字符串类型一样有效。

### `date` 类型——把 ISO 8601 日期变成 `Date` 对象

```js
const env = validateEnv({
  LAUNCH_DATE: { type: 'date', required: true },
  CUTOFF:      { type: 'date' },
}, process.env);

if (env.LAUNCH_DATE < new Date()) console.log('Launched!');
```

`date` 解析 ISO 8601 日期（`2026-01-31`）或日期时间（`2026-01-31T10:00:00Z`，秒、小数秒以及 `Z` 或 `±HH:MM` 偏移可选），并返回一个 JavaScript `Date`，因此截止日期、上线日期和过期日期都不需要手写解析。不可能的日期会被拒绝，并给出指出键名的错误——`2026-02-31` 会失败，而不是悄悄滚动到三月；格式错误的值，如 `31-01-2026` 或 `2026/01/31`，同样失败。作为 `default` 给出的 `Date` 会原样通过，`generateExample` 会为该类型建议 `2026-01-31`。

### `duration` 类型——把人类可读的超时变成毫秒

```js
const env = validateEnv({
  CACHE_TTL: { type: 'duration', required: true },
  TIMEOUT:   { type: 'duration', default: '30s' },
}, process.env);

setTimeout(refresh, env.CACHE_TTL); // 900000 for '15m'
```

`duration` 把人类可读的时长（`500ms`、`30s`、`15m`、`2h`、`1d`、`1w`）解析为毫秒数；复合值会把各部分相加，因此 `1h30m` 是 5,400,000 ms，`2d12h` 是 216,000,000 ms（每一部分都需要单位——`1h30` 会被拒绝）；裸数字本身就是毫秒，因此 `'250'` 和 `250` 都表示 250 ms。单位不区分大小写，也允许小数（`1.5h` 是 5,400,000 ms）；`w` 是一周（7 天），因此 `1w` 是 604,800,000 ms。未知单位（`15min`、`15sec`）、负数和格式错误的值会被拒绝，并给出指出键名的错误。作为 `default` 给出的数字按毫秒处理，`min`/`max` 对毫秒结果的作用与对其他数字一样。`generateExample` 会为该类型建议 `15m`。

### `host` 类型——主机名或 IP 地址，不带协议或端口

```js
const env = validateEnv({
  DB_HOST: { type: 'host', required: true },
  BIND_ADDR: { type: 'host', default: 'localhost' },
}, process.env);
```

`host` 接受主机名（`db.internal`、`localhost`）或 IPv4/IPv6 地址（`10.0.0.5`、`::1`）并原样返回。带有协议（`https://db.internal`）、路径（`db/x`）或端口（`example.com:8080`）的值会被拒绝，并给出指出键名的错误——那些属于 `url` 类型或单独的端口变量。`minLength`/`maxLength` 和 `pattern` 对它的作用与对其他字符串类型一样，`generateExample` 会为该类型建议 `localhost`。

### `url` 类型与 `protocols`——协议白名单

```js
const env = validateEnv({
  WEBHOOK_URL: { type: 'url', protocols: ['https'], required: true },
});
```

`url` 用 `new URL()` 校验，并按原样返回该值（不做规范化——裸的源不会多出末尾斜杠）。`protocols` 是值可以使用的协议白名单（`['https']` 会拒绝 `ftp://...` 和 `javascript:...`，并给出指出允许协议的错误）；匹配不区分大小写，条目可以带或不带末尾冒号（`'https'` 和 `'https:'` 含义相同）。不使用该选项时，任何有效的 URL 都能通过，和以前一样。

### `array` 类型——把分隔字符串拆成带类型的数组

```js
const env = validateEnv({
  ALLOWED_ORIGINS: { type: 'array', of: 'url', protocols: ['https'], required: true },
  PORTS:           { type: 'array', of: 'port', separator: ';', default: [80, 443] },
  ADMIN_EMAILS:    { type: 'array', of: 'email' },
});
```

`array` 按 `separator`（默认 `','`）拆分分隔字符串，默认修剪每个元素（`trim: false` 保留周围空白），并用 `of` 转换每个元素（默认 `'string'`；支持任何内置标量类型，嵌套的 `'array'` 会被预先拒绝）。空元素（例如 `a,,b` 或末尾逗号 `a,b,`）会被拒绝，而不是被悄悄丢弃；任何无效元素都会报告其从 0 开始的索引和出错的值（`PORTS[1]: expected a port (0-65535, e.g. 3000), got "abc"`——在 `sensitive: true` 时会被掩码）。`minItems` 和 `maxItems` 限定元素数量（两者都是非负整数，`minItems` 不得超过 `maxItems`）；违规时会报告键名、实际数量和界限（`TAGS: expected at least 2 items, got 1`），这些界限同样适用于 `default` 值。格式错误的值，以及在非 `array` 规则上使用，都会被预先拒绝。已经解析好的数组可以作为 `default` 传入（包括 `[]`），`generateExample` 会建议三个 `of` 类型的示例元素，用 `separator` 连接——默认 `string` 时是 `a,b,c`，`int` 时是 `1,2,3`，`port` 时是 `3000,8080,5432`，以此类推——因此生成的值本身就能通过该规则的校验；每个数组键上方的注释会写明元素类型（`# type: array, items: int`）。在 TypeScript 中，元素类型会从 `of` 推断。

### `trim: false`——在空白有意义时保留它

值在校验前默认会被修剪——这对从控制台粘贴、带有多余空格的密钥很方便。当空白本身*就是*值时，可以为该键关闭修剪：

```js
const env = validateEnv({
  TOKEN: { type: 'string', trim: false, required: true },
});
// TOKEN: '  secret  ' stays '  secret  '
```

`trim: false` 只影响类字符串的类型；数字和布尔值不受影响（`' 42 '` 仍解析为 `42`，`' true '` 仍解析为 `true`）。

### 加载真正的 `.env` 文件

一次调用即可完成——读取文件、解析它、校验它：

```js
const { loadEnv } = require('env-saaf');

const env = loadEnv({
  PORT:    { type: 'port', required: true },
  API_URL: { type: 'url', required: true },
}); // reads `.env` by default
```

选项：`{ path: '.env.local' }` 读取另一个文件，`{ override: true }` 让文件优先于 `process.env`（默认情况下已有的 `process.env` 值优先），`{ assign: true }` 把校验后的值以字符串形式写回 `process.env`。显式传入但不存在的 `path` 会抛出指出该路径的错误——文件名写错绝不能悄悄启动。没有 `path` 选项时，隐含的默认文件 `.env` 可以不存在（此时每个变量都需要有默认值或是可选的），文件列表（`paths: [...]`，或把 `path` 作为数组）中缺失的条目会被跳过；只有当一个文件都找不到且有必填变量缺失时，列表才会抛出错误。默认情况下，`process.env` 永远不会被修改。

多个文件可以分层叠加——后面的文件覆盖前面的：

```js
const env = loadEnv(schema, { paths: ['.env', '.env.local'] });
// or: { path: ['.env', '.env.local'] }
```

值可以用 `${VAR}` 引用其他值——便于用多个部分拼出 URL。引用先从同一文件解析，然后是 `process.env`；单引号值和 `\${VAR}` 转义保持字面形式：

```env
HOST=example.com
API_URL=https://${HOST}/api
```

使用 `${VAR:-fallback}` 在值未设置或展开为空字符串时提供后备值。使用 `${VAR-fallback}` 仅在名称未设置时提供后备值。例如，`API_URL=https://${HOST:-localhost}/api` 会在 `HOST` 没有值时使用 `localhost`。默认值中可以包含引用，例如 `${HOST:-${DEFAULT_HOST}}`。

带引号的值也可以跨多行（PEM 密钥、JSON 数据块）——解析会一直持续到闭合引号为止。反斜杠转义的引号（单引号内的 `\'`、双引号内的 `\"`）会保留为值的一部分，因此 `B='it\'s'` 就是 `it's`；其他反斜杠，例如 Windows 路径中的，会保持原样。

没有 `=` 的裸行，或者键无效的赋值（例如 `MY KEY`），会引发带行号的语法错误，且不会回显该值。赋值的键必须匹配 `[A-Za-z_][A-Za-z0-9_.-]*`：首字符之后可以使用点号和连字符（例如 `app.name` 和 `MY-KEY`），但键内不能包含空格。空值请使用 `KEY=`。

在异步代码中，使用 `loadEnvAsync` 读取文件，不阻塞文件系统 I/O。

```js
const { loadEnvAsync } = require('env-saaf');

async function readConfig() {
  return await loadEnvAsync(
    { PORT: { type: 'port', default: 3000 } },
    { paths: ['.env', '.env.local'] }
  );
}
```

它接受与 `loadEnv` 相同的选项，包括文件优先级、`override` 和 `assign`。Promise 会以校验后的值 resolve，并以 `loadEnv` 抛出的相同错误 reject。

手动方式仍然可用——解析文件后传入：

```js
const fs = require('node:fs');
const { parseEnvFile, validateEnv } = require('env-saaf');

const fileEnv = parseEnvFile(fs.readFileSync('.env', 'utf8'));
const env = validateEnv({
  PORT:    { type: 'port', required: true },
  API_URL: { type: 'url', required: true },
}, fileEnv);
```

ES 模块也可以：

```js
import { validateEnv } from 'env-saaf';
```

### TypeScript：返回类型从 schema 推断

`validateEnv` 的返回类型会从 schema 推断——`type: 'port'` 的键变成 `number`，`boolean` 键变成 `boolean`，没有 `required` 或 `default` 的键是 `| undefined`：

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

请把 schema 内联传给 `validateEnv(...)`（或使用 `as const`），以便 TypeScript 能看到字面量类型。`EnvResult<S>` 和 `EnvValue<R>` 类型也单独导出。

## 实用示例

这些简短的模式只使用当前 API 中可用的 `validateEnv` 选项。

### 数据库 URL 与连接池大小

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  DATABASE_URL: { type: 'url', required: true },
  DB_POOL_SIZE: { type: 'number', default: 10 },
});
// env.DATABASE_URL is present; env.DB_POOL_SIZE is a number.
```

`url` 校验 URL 语法，`number` 则把连接池大小从环境字符串转换为数字。

### 功能开关

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  ENABLE_EXPORTS: { type: 'boolean', default: false },
  ENABLE_PREVIEW: { type: 'boolean', default: false },
});

if (env.ENABLE_EXPORTS) console.log('Exports are enabled');
```

boolean 类型接受 `true`/`false`、`yes`/`no`、`on`/`off` 和 `1`/`0`（还有 `y`/`n`），不区分大小写。

### 可选的分析密钥

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  ANALYTICS_WRITE_KEY: { type: 'string' },
});

if (env.ANALYTICS_WRITE_KEY !== undefined) {
  console.log('Analytics is configured'); // Use the key with your analytics client; do not log it.
}
```

没有 `required` 或 `default` 时，缺失的键会从结果中省略，其 TypeScript 类型为 `string | undefined`。

### 开发与生产环境的不同要求

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

先校验模式，然后在应用代码中选择一个普通的 schema，用于不同环境下需要不同 `default` 值或类型的情况。如果只是想让某个键仅在特定模式下必填，请在单个 schema 中使用 `requiredIf`。

### Fastify

在启动时、注册插件或调用 `fastify.listen(...)` **之前**校验配置，然后用 `fastify.decorate('config', config)` 把带类型、已冻结的配置对象挂到 Fastify 实例上。在 `register` 和 `listen` 之前运行校验，可以确保进程在插件打开数据库连接池或服务器绑定端口之前快速失败；而把配置装饰到实例上，则让路由和插件可以通过 `fastify.config` 以带类型的方式访问配置，无需重新读取 `process.env`：

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

对于使用 `.env` 文件的本地开发，在同一个启动代码块中把 `validateEnv(schema)` 换成 `loadEnv(schema)`（或 `loadEnv(schema, { paths: ['.env', '.env.local'] })`）。

### Next.js

把仅供服务器使用的 schema 放在一个共享模块中（例如 `lib/env.ts`），并从 Next.js 的 `instrumentation.ts` 的 `register()` 钩子中导入它；该钩子在 **Node.js 服务器启动时运行一次**——在处理请求、Route Handler 或 Server Component 之前。如果你的应用还使用 Edge 运行时，请用 `process.env.NEXT_RUNTIME === 'nodejs'` 做守卫，因为 `env-saaf` 使用 Node 内置模块（`node:fs`、`node:net`、`node:path`）。如果你希望 `next build` 在缺少构建时配置时快速失败，也可以把同一个校验模块导入到 `next.config.mjs` 的顶部。

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

Next.js 会在 `instrumentation.ts` 运行之前，自动把 `.env`、`.env.local` 以及特定环境的 `.env.*` 文件加载到 `process.env` 中，因此 `validateEnv` 可以直接读取它们，无需调用 `loadEnv`。

**`NEXT_PUBLIC_` 变量不在密钥的适用范围内：** Next.js 会在构建时把每个 `NEXT_PUBLIC_*` 变量内联进浏览器 bundle。绝不要把密钥（API 密钥、数据库 URL、签名密钥）存放在 `NEXT_PUBLIC_*` 变量中——把密钥放在无前缀、仅供服务器使用的变量里，并在 `lib/env.ts` 这类仅服务器模块中校验。如果你还想校验公共的客户端设置（例如 `NEXT_PUBLIC_SITE_URL`），请传入一个显式对象（`validateEnv({ NEXT_PUBLIC_SITE_URL: { type: 'url', required: true } }, { NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL })`），因为 Next.js 在客户端 bundle 中是静态替换字面的 `process.env.NEXT_PUBLIC_*` 引用，而不是暴露一个完整的 `process.env` 对象。

### 让 `.env.example` 保持真实（CLI）

CLI 输出默认是纯文本，包括在管道和 CI 中。对于设置了共享颜色偏好的脚本，可以在命令前后传入 `--no-color`，或设置 `NO_COLOR=1`。

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

开始一个新项目？`env-saaf init` 会写出一个起始 `env.schema.js`，其中带有主要类型（`string`、`int`、`boolean`、`port`、`url`、`email`、`duration`、`host`）的带注释示例，并据此生成一个匹配的 `.env.example`。每个建议的占位符都是能通过其自身规则校验的值，因此生成的 `.env.example` 开箱即可通过 `check`（`file` 类型是例外——它的 `./config.json` 路径必须先存在）。如果项目的 `package.json` 中有 `"type": "module"`，起始文件会改为写成 `env.schema.cjs`，这样它仍然可以用 `require()` 加载——在这种项目里，你自己的 schema 也请用 `.cjs` 扩展名命名。`init` 之后的第一次 `check` 会通过并附带一条说明，直到代码开始读取这些变量为止——脚手架声明了但代码尚未使用的键不会被视为漂移。一旦代码读取了至少一个变量，未使用的键就会和以前一样让 check 失败。除非传入 `--force`，只要这两个文件中有任何一个已存在，就会拒绝执行（退出码 1，并指出文件名）；`--schema <file>` 可以指定 schema 文件名，而不是 `env.schema.js`。

已经有 `.env.example` 但还没有 schema？`env-saaf init --from-example`（也可以用 `--from-example=FILE` 指定其他文件名）会解析示例文件，并根据每个键的示例值推断一条起始规则，优先级顺序如下：UUID -> `uuid`，有效 JWT（三个 base64url 段，JSON 头部和载荷）-> `jwt`，ISO 日期或日期时间 -> `date`，例如 `30m` 或 `1h30m` 的时长 -> `duration`，例如 `1.4.2` 的语义化版本 -> `semver`，可解析为 JSON 的对象或数组 -> `json`，至少八个字符的偶数长度十六进制字符串 -> `hex`，看起来像端口的数字（1024-65535 之间的整数）-> `port`，其他整数 -> `int`，`true`/`false` -> `boolean`，`http(s)` URL -> `url`，电子邮件地址 -> `email`，小数 -> `number`，其他任何情况（包括空值和 `cafe` 等有歧义的字符串）-> `string`。每个候选类型都会用真正的校验器确认，因此推断出的规则总是接受它所源自的示例值。每条推断出的规则都会写上一条注释，说明它是推断出来的、应当复核（示例值本身不会被复制进 schema，因此示例中的密码不可能泄漏到提交的文件中）。代码扫描发现但示例中没有列出的键，会像固定脚手架一样被折叠进来作为 `string` 规则。在此模式下，示例文件永远不会被写入或覆盖，只有 schema 文件会被写入，且同样拒绝在没有 `--force` 时覆盖。生成的 schema 能通过示例自身示例值的校验，因此之后 `env-saaf check . --file .env.example --schema env.schema.js` 会立即通过。传入 `--groups`（`env-saaf init --from-example --groups`）可以把共享同一前缀的键折叠成分组 schema（例如 `DB_HOST` 和 `DB_PORT` 会变成一个带 `prefix: 'DB_'` 的 `DB` 分组），前提是该前缀至少有两个字符，且至少有两个键共享它。

当 `.env.example`（或用 `--file` 给出的文件）位于被扫描的目录中时，`scan` 还会警告那里声明了但没有代码读取的键，每个键一行输出到 stderr：`UNUSED: OLD_KEY (in .env.example, never used in code)`。使用 `--json` 时，它们会列在 `vars` 旁边的 `unused` 数组中。这只是一个警告：stdout 仍然只包含被使用的变量，`scan` 仍以 0 退出（要在漂移时让 CI 任务失败，请用 `check`）。没有模板文件时，一切照旧。

扫描目录时，`scanDir` 会跳过 `node_modules`、`.git*` 以及常见的构建输出目录（`dist`、`build`、`coverage`、`.next`、`out`、`target`），因此旧的构建产物不会让未使用的键看起来像正在使用；在 CLI 中，`scan` 和 `check` 都支持（可重复使用的）`--exclude <pattern>` 来排除额外的目录或 glob 模式，例如 `fixtures` 或 `'src/generated/**'`。扫描读取的是代码，而不是注释或字符串、模板字面量中的文本：只在注释中出现的名字（`// set process.env.FOO first`）、字符串（`'see process.env.BAR'`）或模板文本中出现的名字不会被报告，因此它们无法悄悄满足 `check` 或进入 `example` 草稿。模板 `${...}` 内部的读取仍然算读取，`process.env['X']`、``process.env[`X`]`` 和解构也一样。可选链也算读取：`process.env?.MAYBE` 和 `import.meta.env?.VITE_MAYBE` 会像普通点号形式一样被报告（`process.env?.['X']` 和 ``process.env?.[`X`]`` 也是如此）。Vite 的 `import.meta.env` 读取也会以同样方式被找到（点访问、方括号访问和解构），因此 Vite 项目也能正确扫描。

当真正的 `.env` 位于模板旁边时，`check` 还会比较两者的键：在 `.env` 中但未记录的键（`EXTRA in .env: FOO (not in .env.example)`）通常是拼写错误，而模板中有但本地没有值的键会报告为 `MISSING in .env: BAR (in .env.example, not set locally)`。`--file` 为这两种比较选择模板；没有 `.env` 文件时，这一额外检查会被跳过。在 `--json` 模式下，结果会以 `envExtra` 和 `envMissing` 的形式出现在已有的 `missing`、`extra`、`unused` 和 `invalid` 字段旁边——`unused` 以 `scan --json` 使用的相同名称列出已记录但未使用的键，`extra` 则为兼容性保留同一份列表。

扫描器能通过用 `const`、`let` 或 `var` 声明的简单本地别名找到点访问和静态方括号键，例如 `const env = process.env; env.PORT`。这对 `import.meta.env` 同样有效。文本扫描器会跟踪声明之后的读取。重新赋值、遮蔽、别名链以及通过别名解构不在其范围内。

只要打印出任何结果，`check` 就会以 1 退出，`--json` 的 `ok` 也携带相同的值，因此 CI 任务恰好在输出报告问题时失败；完全干净的项目以 0 退出。`UNUSED` 也算一个结果：某个键在其代码用法消失后仍留在模板中，会让运行失败，因此在删除最后一次使用时，请同时把它从模板中删除。唯一的例外是完全没有 `process.env` 用法的项目——例如一个全新的脚手架：此时 `check` 会通过并附带一条说明（在 `--json` 中是一个 `note` 字段），而不是每个键一行 `UNUSED`，因为还没有代码可供模板漂移。

`env-saaf print` 会根据 schema 加载并校验环境文件（默认为 `.env`，或通过 `--file` 指定），并打印生效的配置（包含转换后的值和默认值），同时将所有 `sensitive: true` 规则以及名称看似密钥的键的值掩码处理，文本和 `--json` 输出均如此；`--json` 会打印同一个对象。`--reveal` 会打印真实值，仅用于本地调试——切勿在 CI 日志中使用。校验失败时会输出与 `check --schema` 相同的消息并以 1 退出，因此它也可以作为启动前检查。该命令必须提供 `--schema`。

`--schema` 是可选启用的：没有它时，`check` 只比较键是否存在。有了它，`check` 会加载 schema 文件（`module.exports = { PORT: { type: 'port', required: true } }`，相对于被检查的目录解析），并对真正的 `.env` 文件中的值运行库本身使用的同一个 `validateEnv`。类型错误会报告为 `INVALID: PORT: expected a port (0-65535, e.g. 3000), got "not-a-port"`，并使 check 失败（退出码 1）；在 `--json` 模式下，失败会出现在 `invalid` 字段中。在指定要按 schema 校验的值文件时，`--values <file>` 具有更高优先级（例如 `.env.production` 或 `.env.staging`），同时保留 `.env.example`（或 `--file`）作为模板，且文件不存在属于用法错误；未传 `--values` 时，显式的 `--file` 会选择模板并同时作为被校验的值文件；当没有 `.env` 文件、也没有 `--values` 和显式 `--file` 时，会跳过值校验步骤（模板的占位符不是真实值）。使用 `--schema` 时，`check` 还会将 schema 与示例文件核对：在 schema 中声明但 `.env.example` 中缺失的键会报告为 `NOT DOCUMENTED`，而示例中有但 schema 未声明的键会报告为 `NOT IN SCHEMA`（分组 schema 按展平后的名称比较，例如 `DB_HOST`）。这两种情况都会使检查失败，并在 `--json` 中显示为 `schemaNotDocumented` 和 `documentedNotInSchema`。无法加载（或没有导出 schema 对象）的 schema 文件属于用法错误：给出清晰的消息并以 2 退出。使用 `--json-schema` 时，`check` 会把 `--schema` 文件作为 draft 2020-12 JSON Schema 文档打印到 stdout，而不是运行检查，这样编辑器和 CI 校验器可以直接消费它；`.env.example` 永远不会被读取，因此即使示例文件还不存在，schema 也能转换。没有 `--schema` 时就没有可转换的东西，因此该标志属于用法错误（退出码 2）。

### 在 GitHub Actions 中运行 `check`

一个最小的工作流，当代码与 `.env.example` 发生漂移时让 pull request 失败。把它复制到 `.github/workflows/env-check.yml`：

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

真正的密钥来自仓库的 Actions secrets（Settings、Secrets and variables、Actions），永远不要来自仓库本身：只提交 `.env.example`，并把 `.env` 放在 `.gitignore` 中。上面的 `.env` 只存在于该 job 的临时检出中。`check` 只比较键名，从不打印值，因此密钥不会进入日志。没有 `.env` 时，该 job 仍会比较代码和 `.env.example`；有了它，还会报告 `EXTRA in .env` / `MISSING in .env` 键（自 1.4.0 起可用；1.3.0 时 `check` 只比较代码和 `.env.example`）。任何结果都会以 1 退出并使 job 失败。

可选 `.env` 步骤的两个限制：只有当键缺失时它才算*缺失*，因此一个未设置的密钥仍会写入空值的 `API_KEY=` 并通过键检查（`check` 不是值检查；值检查请在启动时使用 `validateEnv`）。另外，`printf` 会逐字写入每个密钥，因此请让每个密钥保持单行；多行密钥会被读作额外的 `NAME=value` 条目。

### 从 schema 生成 `.env.example`

schema 已经知道每个键——从它生成示例文件，而不是手写：

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

看起来像密钥的键（`API_KEY`、`DB_PASSWORD` 等）会得到一个空占位符——没有什么安全的值可供建议。其他键会得到基于类型的占位符，显式的 `default` 则按原样使用。带有 `aliases` 的键会注明已弃用的后备名称（`# type: url, required; also accepts DATABASE_URL (deprecated)`），带有 `requiredIf` 的键会注明条件（`# type: url; required when MODE is 'production'`，对于 `in` 形式则是 `required when MODE is one of 'staging', 'production'`）。

### 从你的 schema 导出 JSON Schema

`toJsonSchema(schema)` 返回一个 [draft 2020-12 JSON Schema](https://json-schema.org/draft/2020-12)，用于文档、编辑器工具，或校验**转换后的值**，而不是原始的 `.env` 字符串。它不读取环境变量，也不运行自定义回调。分组 schema 会嵌套为对象 schema，内部规则作为 `properties`，其必填键列在该分组自己的 `required` 列表中。

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

数值、长度和元素数量的界限会变成 JSON Schema 关键字。数组描述其转换后的元素，duration 是毫秒，date 序列化为 ISO 日期时间字符串（该 schema 也接受 `date` 格式）。`json` 类型允许任何 JSON 形状。与 JSON 兼容的 `choices` 会变成 `enum` 值，不做重新转换。可表示的默认值会以转换后的形式作为注记导出；JSON Schema 不会填补缺失的值。避免把密钥放进将被共享的 schema 默认值或 choices 中。

**未表示的内容：** `transform`、`validate`、`requiredIf`、`aliases`、`sensitive`、输入修剪与拆分、正则表达式标志（带标志的 pattern 会被省略），以及无法无损转换为 JSON 或依赖本地时间的默认值。文件存在性以及详细的 `base64` 和 `semver` 检查仍然只在运行时进行。标准格式默认是注记，其规则可能与 env-saaf 的检查不同。JSON Schema 按 Unicode 字符计算字符串长度；env-saaf 按 JavaScript UTF-16 代码单元计算。运行时校验请使用 `validateEnv` 或 `loadEnv`。

### 记录配置而不泄漏密钥

```js
const { maskSecrets } = require('env-saaf');
console.log(maskSecrets(process.env)); // values masked: sk***56
```

空值保持为空——`maskValue('')` 返回 `''`，因此未设置的密钥在日志中不会再看起来像已设置。

`maskSecrets` 还会递归处理：嵌套的普通对象和数组保持其形状，每个标量叶子都用相同的 `maskValue` 规则掩码，因此解析后的配置可以安全地记录（`maskSecrets({ DB: { PASSWORD: 'hunter2' }, TAGS: ['a', 'b'] })` → `{ DB: { PASSWORD: 'hu***r2' }, TAGS: ['****', '****'] }`）。非普通值（`Date`、类实例）被当作叶子处理，重复引用（例如循环引用）会被替换为固定占位符 `'[Circular]'` 而不是陷入死循环，并且输入对象永远不会被修改。在 TypeScript 中，返回类型会递归地镜像输入形状（`Masked<T>`），每个叶子的类型都是 `string`。

## env-saaf 与 envalid、joi、zod 的对比

| | `env-saaf` | `envalid` | `joi` | `zod` |
| --- | --- | --- | --- | --- |
| **范围** | 仅环境变量（扁平键值映射） | 仅环境变量 | 通用 schema 校验（请求、负载、配置） | 通用 schema 校验（请求、表单、配置） |
| **运行时依赖** | 零 | 零 | 多个 `@hapi/*` 包 | 零 |
| **`.env` 加载与 CLI 工具** | 内置 `.env` 解析器（`loadEnv`/`parseEnvFile`）、`scan`/`check`/`example`/`init` CLI、密钥掩码 | 仅校验（需搭配 Node `--env-file` 或 `dotenv`） | 仅校验（需搭配 Node `--env-file` 或 `dotenv`） | 仅校验（需搭配 Node `--env-file` 或 `dotenv`） |
| **错误聚合** | 一次收集所有错误（`EnvSaafError`，或使用 `throwOnError: false` 时的 `{ env, errors }`） | 一次收集所有错误（传给默认或自定义的 `reporter`） | 默认在第一个错误处停止；传入 `{ abortEarly: false }` 可收集全部 | 一次收集所有问题（通过 `parse` 得到 `ZodError`，或通过 `safeParse` 得到 `{ success, error }`） |
| **TypeScript 推断** | 附带 `index.d.ts`；从内联 / `as const` schema 推断扁平对象类型（`json` 推断为 `unknown`，`choices` 保持拓宽类型） | 用 TypeScript 编写；推断校验器的返回类型，包括 `choices` 的字面量联合 | 附带类型，但不从 schema 推断静态 TS 类型（需单独定义接口或使用代码生成） | TypeScript 优先的静态推断（`z.infer<typeof schema>`），涵盖嵌套对象、联合、字面量和 transform |

不过，对比并不是迁移路径——从 `dotenv`、`dotenv-safe` 和 `envalid` 迁移的具体前后步骤，见下文[迁移到 env-saaf](#migrating-to-env-saaf)。

### env-saaf 适合的场景

- 你想要启动时的 env 校验、`.env` 文件加载（带分层和 `${VAR}` 插值）、密钥掩码，以及一个让 `.env.example` 与代码保持同步的 CI CLI（`env-saaf check`）——全部集成在一个零依赖的 Node.js 包中。

### 其他库更适合的场景

- **校验 HTTP 请求、API 负载、表单或嵌套 JSON：** `env-saaf` 只校验扁平的环境变量映射，没有嵌套对象 schema 或跨字段条件规则。当你需要通用数据校验时，请使用 **zod**（尤其在 TypeScript 中）或 **joi**。
- **你的项目已经在用 `zod` 或 `joi`：** 如果你已经依赖其中之一做请求/数据校验，并且不需要 `env-saaf` 的 `.env` 解析器或 `scan`/`check` CLI，那么用现有库校验 `process.env` 可以避免再引入一个工具。
- **更丰富的 TypeScript 推断或非 Node 运行时：** 如果需要完整的静态类型推断（嵌套形状、可辨识联合、收窄的字面量枚举）或浏览器/边缘运行时支持，请使用 **zod**（`env-saaf` 使用 Node 内置模块 `node:fs`、`node:net` 和 `node:path`）。如果你想要仅针对 env 的校验，并带有 `devDefault`、代理守卫的 env 访问，或从 `choices` 推断字面量联合，请使用 **envalid**。

## 迁移到 env-saaf

三条简短路径，每条最后都有一个针对当前 API 的完整可运行代码片段（已按此版本核实）。`.env` 文件本身永远不需要改动。

### 从 `dotenv` 迁移（手动读取 `process.env`）

`.env` 文件保持原样。把散落各处的 `process.env.X` 读取替换为一个 schema 加 `loadEnv`——它解析 `.env`、校验每个值并返回带类型的结果——并先运行 `env-saaf scan` 找出你的每一处读取。

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

### 从 `dotenv-safe` 迁移（`.env.example` 契约）

`dotenv-safe` 会在启动时因 `.env` 缺少 `.env.example` 声明的键而失败。env-saaf 保留同一个 `.env.example` 文件，并把契约检查移到漂移真正发生的地方——CI——外加启动时的 schema 检查。

| `dotenv-safe` | env-saaf |
| --- | --- |
| 在代码中 `require('dotenv-safe').config({ example: '.env.example' })`；键缺失时启动崩溃 | `.env.example` 保持不变；`npx env-saaf check` 把它与你的代码和真正的 `.env` 比较（任何 `MISSING` / `EXTRA` / `UNUSED` / `INVALID` 结果都会以 1 退出） |
| 没有类型校验——每个值都保持字符串 | `loadEnv(schema)` 在启动时转换并校验每个值（`port`、`url`、`boolean` 等） |
| `allowEmptyValues: false` 选项 | `sensitive: true` 在错误/输出中掩码该值，并让它的 `.env.example` 占位符留空；空的*可选*值仍然被允许 |

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

### 从 `envalid` 迁移（校验器映射）

常用的校验器与 env-saaf 的规则类型一一对应：

| envalid | env-saaf 规则 | 重要的差异 |
| --- | --- | --- |
| `str()` | `{ type: 'string' }` | 默认修剪（`trim: false` 可保留空白）；可用 `pattern` / `minLength` / `maxLength` |
| `str({ default: 'dev' })` | `{ type: 'string', default: 'dev' }` | 默认值会像所提供的值一样被校验 |
| `str({ choices: ['dev', 'prod'] })` | `{ choices: ['dev', 'prod'] }` | `choices` 匹配*转换后*的值（对数字/布尔值同样有效） |
| `num()` | `{ type: 'number' }` | `min` / `max` 限定解析后的数字 |
| `port()` | `{ type: 'port' }` | 0–65535 的整数，解析为数字 |
| `bool()` | `{ type: 'boolean' }` | 接受 `true/false`、`yes/no`、`on/off`、`1/0`、`y/n` |
| `url()` | `{ type: 'url' }` | `protocols: ['https']` 是协议白名单 |
| `email()` | `{ type: 'email' }` | — |
| `json()` | `{ type: 'json' }` | 解析为真正的 JS 值，而不是字符串 |

两个库都会在一次处理中聚合所有错误；env-saaf 抛出一个 `EnvSaafError`，其 `.errors` 列出每个问题（或在使用 `throwOnError: false` 时返回 `{ env, errors }`）。

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

## 版本历史

- **v0.1.0** — 核心 `validateEnv`：类型（string/number/boolean/url/port）、required、默认值、choices、一次性报告所有错误。
- **v0.2.0** — `.env` 文件解析、代码扫描（已使用与已记录的差异）、CLI（`check` / `scan`）。
- **v1.0.0** — 密钥掩码、从 schema 和代码扫描生成 `.env.example`、TypeScript 定义、稳定的 API。
- **v1.1.0** — CLI `--help` 以 0 退出、boolean 的 `on`/`off`/`y`/`n`、`scanCode` 能找到 `let`/`var` 解构、`parseEnvFile` 中剥离行内注释、扫描 `.mts`/`.cts` 文件。
- **v1.2.0** — `email` 类型和 `pattern` 选项、CLI `--json` 输出、每个键的 `transform`、`${VAR}` 插值、多文件 `loadEnv`、多行带引号的值、CLI `--no-color`、带 `min`/`max` 的 `int` 类型、README 实用示例。
- **v1.5.0** — `duration` 和 `host` 类型、`date` 和 `file` 类型、非抛出模式、`${VAR:-default}` 插值、CLI `--schema` 校验、`.env` 文件中的重复键和裸行错误、`scan`/`check`/`example` 的目录校验、Express 示例、README 类型参考表。
- **v1.6.0** — `bigint` 与 `ipv6` 类型、分组（嵌套）模式、带逐项强制转换的 `array` 类型、`requiredIf`/`aliases`/`conflictsWith`/`deprecated` 规则选项、`loadEnvAsync`、`toJsonSchema` 导出、CLI `init` 与 `print` 命令、`check --fix`、`check` 中的真实密钥检测、单文件 `scan`/`check`、基于属性的模糊测试——迄今最大的版本，包含许多外部贡献。
- **v1.7.0** — 用于校验 JSON Web Token 结构的 `jwt` 类型、更严格的模式（非数组 `choices` 与 `hex` 之外的 `length` 会被预先拒绝）、跨文件的分层 `loadEnv` 插值、`scanCode` 别名解构、非字符串密钥掩码、`int`/`number` 的不安全整数拒绝、`print` 中的密钥掩码，以及空项目 `scan --json` 测试的修复。
- **v1.4.0** — `ipv4`、`semver` 和 `base64` 类型、CLI `check` 比较真正的 `.env` 键、CLI `--version`、`example --write`、`scan` 的 UNUSED 警告、`check` 对任何结果都以 1 退出、`scanCode` 忽略注释/字符串、默认值像所提供的值一样被校验、子命令之后的 `--help`、`parseEnvFile` 中的转义引号、`port` 接受 0、GitHub Actions 工作流文档。
- **v1.3.0** — `json`、`uuid` 和 `hex` 类型、`minLength`/`maxLength` 和 `hex` 的 `length` 选项、`trim: false`、`loadEnv` 返回类型推断、为密钥键更安全地生成 `.env.example`、`assign: true` 的 JSON 修复。

## 参与贡献

欢迎提交 issue 和 pull request——包括很小的。先从标有 [`good first issue`](https://github.com/abhi478jeetur-rgb/env-saaf/labels/good%20first%20issue) 的 issue 开始，并请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)：它解释了零依赖规则和如何运行测试。

## 贡献者

env-saaf 的存在要感谢每一位贡献了代码、修复和想法的人。迄今为止，维护者之外已有 **23 人**提交了被合并的 pull request：

- [@abdul-karim-mia](https://github.com/abdul-karim-mia) — 第一位外部贡献者
- `@HarshRajSinghania` — CLI `--json` 输出
- [@Golden007-prog](https://github.com/Golden007-prog)
- [@harshit3355](https://github.com/harshit3355)
- [@bfs2021](https://github.com/bfs2021)
- [@enidchen0125](https://github.com/enidchen0125)
- [@theroimasters1-dev](https://github.com/theroimasters1-dev)
- [@kamrullab](https://github.com/kamrullab)
- [@Veeramanikandanr48](https://github.com/Veeramanikandanr48)
- [@rise11hx-cmyk](https://github.com/rise11hx-cmyk)
- `@P1LOTRX` — 默认值会像所提供的值一样被校验
- [@emreocell](https://github.com/emreocell)
- [@IG-ABHINAV](https://github.com/IG-ABHINAV)
- [@flipcyde101](https://github.com/flipcyde101)
- [@swpswpswp](https://github.com/swpswpswp)
- [@tnalbant](https://github.com/tnalbant)
- [@jamesyshd19-cmyk](https://github.com/jamesyshd19-cmyk) — `init` 使用自定义 schema 路径
- [@abhinavrastogi2627](https://github.com/abhinavrastogi2627) — 含糊不清的别名会被拒绝
- `DeviousCardi` — 分组 schema、CLI 监视模式、迁移指南等（共九个 PR）
- [@ghosh-shrestha](https://github.com/ghosh-shrestha) — 未知的规则选项会被拒绝
- [@echuq](https://github.com/echuq) — 带进制前缀的数字和无效的 env 文件键会被拒绝
- [@sharkohark1234](https://github.com/sharkohark1234) — `toJsonSchema` 处理分组 schema；`check --json-schema`
- [@saadBinMumtaz](https://github.com/saadBinMumtaz) — `init --from-example --groups`

随着新的 pull request 不断合并，这面墙会自己生长：

<a href="https://github.com/abhi478jeetur-rgb/env-saaf/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=abhi478jeetur-rgb/env-saaf" alt="env-saaf contributors" />
</a>

新的指南位于[项目 wiki](https://github.com/abhi478jeetur-rgb/env-saaf/wiki)——从那里的 CLI 指南和类型参考开始。

## 许可证

MIT © Abhijeet Kumar
