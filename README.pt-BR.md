# env-saaf

Validador de variáveis de ambiente para Node.js, sem dependências. Falhe rápido na inicialização, com erros claros, e receba valores **tipados** de volta.

[![npm version](https://img.shields.io/npm/v/env-saaf.svg)](https://www.npmjs.com/package/env-saaf) [![npm downloads](https://img.shields.io/npm/dm/env-saaf.svg)](https://www.npmjs.com/package/env-saaf) [![GitHub stars](https://img.shields.io/github/stars/abhi478jeetur-rgb/env-saaf.svg)](https://github.com/abhi478jeetur-rgb/env-saaf/stargazers) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/abhi478jeetur-rgb/env-saaf/blob/main/LICENSE)

**Leia em outros idiomas:** [English](README.md) · [Español](README.es.md) · [हिंदी](README.hi.md) · [简体中文](README.zh-CN.md)

## O problema

Pesquisas sobre os problemas reais que os desenvolvedores enfrentam mostram os mesmos bugs de `.env` repetidamente:

- Todo valor de `process.env` é uma **string**: `DEBUG=false` é truthy, e `"3000" + 1` vira `"30001"`.
- Uma variável ausente não falha na inicialização — ela falha **em produção**, na primeira requisição que precisa dela.
- O `.env.example` só diz o que *deveria* existir, não o que o seu código *realmente usa* — e os dois se distanciam silenciosamente.
- Verificar as variáveis uma a uma é tedioso, e o primeiro erro esconde todos os outros.

As soluções existentes (zod, envalid) são poderosas, mas pesadas para projetos pequenos. O `env-saaf` (`saaf` = साफ़, limpo/claro) faz o trabalho essencial com **zero dependências**.

## Instalação

```bash
npm install env-saaf
```

## Uso

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

O `validateEnv` trata uma string vazia (`''`) da mesma forma que uma variável não definida: uma chave opcional sem `default` é omitida do resultado, uma chave `required` falha como ausente (`missing required variable`), e uma chave com `default` usa esse valor padrão. Isso corresponde ao `${VAR:-fallback}` em [Carregando um arquivo `.env` de verdade](#carregando-um-arquivo-env-de-verdade), que também trata uma expansão vazia como não definida. Somente `''` conta como não definida — uma entrada só com espaços, como `'   '`, é tratada como fornecida (reduzida a `''` para `string` por padrão, ou mantida como está com `trim: false`).

### Referência de tipos

As entradas de ambiente são strings. A saída abaixo é anterior a um `transform` opcional.

| Tipo | Entrada aceita | Saída em JavaScript | Opções de regra adicionais |
| --- | --- | --- | --- |
| `string` | Qualquer texto não ausente (tipo padrão) | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `number` | Texto decimal não vazio, incluindo frações e notação exponencial. Rejeita prefixos de base (`0x`, `0b`, `0o`), `NaN` e valores não finitos. | `number` | `trim`, `min`, `max` |
| `int` | Literal inteiro em base 10: sinal opcional e dígitos, p. ex. `42`, `-3`, `007`. Grafias decimais e científicas (`1.0`, `1e3`) são rejeitadas, assim como prefixos de base. | `number` | `trim`, `min`, `max` |
| `boolean` | `true/false`, `1/0`, `yes/no`, `on/off`, `y/n`, sem distinção de maiúsculas e minúsculas | `boolean` | Nenhuma |
| `url` | URL absoluta aceita por `new URL()`, sem normalização | `string` | `trim`, `minLength`, `maxLength`, `pattern`, `protocols` |
| `file` | Caminho para um arquivo regular existente e legível. Caminhos relativos usam o diretório de trabalho do processo. | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `port` | Literal inteiro em base 10 de 0 a 65535 (sinal `+` opcional e dígitos, p. ex. `3000`, `+42`). Grafias decimais e científicas (`8080.0`, `1e3`) são rejeitadas, assim como prefixos de base. | `number` | `min`, `max` |
| `email` | Um `@`, parte local não vazia, domínio com um ponto no meio, sem ponto no início ou no fim do domínio, sem espaços em branco | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `json` | Texto JSON válido (objeto, array ou primitivo). Aceita valores padrão já analisados. | Valor JSON analisado | `trim`. Para resultados numéricos, `min` e `max`. |
| `uuid` | Grupos hexadecimais canônicos 8-4-4-4-12, em qualquer caixa | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `hex` | Um ou mais caracteres hexadecimais, sem prefixo `0x` | `string` | `trim`, `length`, `minLength`, `maxLength`, `pattern` |
| `ipv4` | Quatro octetos decimais, cada um de 0 a 255; sem zeros à esquerda | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `ipv6` | Qualquer endereço que `net.isIP` reconheça como IPv6, incluindo formas comprimidas, mapeadas para IPv4 e com `%zone` | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `semver` | `MAJOR.MINOR.PATCH`, sufixos opcionais de pré-lançamento e de build, e um prefixo `v` minúsculo opcional (`v1.2.3`). Zeros numéricos à esquerda e `V` maiúsculo são rejeitados. | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `base64` | Alfabeto padrão ou seguro para URL, com preenchimento opcional. | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `date` | `YYYY-MM-DD` válido ou data e hora com `T` e horas/minutos; segundos, fração e `Z` ou deslocamento numérico opcionais. Aceita valores padrão `Date` válidos. | `Date` | `trim`, `min`, `max` (strings de data ISO) |
| `duration` | Duração legível: `500ms`, `30s`, `15m`, `2h`, `1d`, `1w`, compostos como `1h30m`; um número puro é milissegundos | `number` (milissegundos) | `trim`, `min`, `max` (milissegundos ou strings de duração, p. ex. `min: '30s'`) |
| `host` | Nome de host (`db.internal`, `localhost`, `example.com.`) ou endereço IPv4/IPv6; um ponto raiz DNS final é preservado; sem esquema, caminho ou porta | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `array` | Lista delimitada dividida por `separator` (padrão `,`) com cada item convertido como `of` (padrão `string`). Itens vazios são rejeitados. Aceita valores padrão em array. | Array tipado (`T[]`) | `of`, `separator`, `trim`, `protocols` (quando `of: 'url'`), `minItems`, `maxItems`, `unique`, `skipEmpty` |

Todos os tipos oferecem suporte a `required`, `requiredIf`, `conflictsWith`, `default`, `description`, `validate`, `transform`, `sensitive` e `aliases`. Definir `sensitive: true` sempre mascara o valor da chave nos erros de validação e na saída da CLI, seja qual for o nome dela (p. ex. `SESSION_ID`, `LICENSE_KEY`), e deixa seu espaço reservado vazio no `generateExample`. Definir `aliases: ['OLD_NAME']` aceita nomes de variáveis obsoletos como alternativas e emite um aviso (veja abaixo). Funções `validate(value, env)` personalizadas são executadas após a conversão e as verificações internas (inclusive sobre valores padrão), antes do `transform`. Os transforms são executados sobre os valores fornecidos, após a validação. Chaves opcionais ausentes são omitidas e os valores padrão são validados. A opção `choices` corresponde a strings, números ou booleanos já convertidos. Um valor JSON analisado pode corresponder a uma choice quando tem um desses três tipos. A entrada em string é aparada por padrão. Definir `trim: false` mantém os espaços em branco nos tipos semelhantes a string. Para `number` e `int`, espaços em torno de um valor numérico são aceitos de qualquer forma, mas um texto só com espaços é rejeitado por padrão e convertido para `0` com `trim: false`. A correspondência de booleanos sempre ignora os espaços ao redor. A opção `length` se aplica somente ao `hex`. As opções `pattern`, `minLength` e `maxLength` se aplicam somente a tipos com valor em string (`string`, `email`, `url`, `file`, `uuid`, `hex`, `ipv4`, `ipv6`, `semver`, `base64`, `host`) e são rejeitadas de antemão em qualquer outro tipo. Veja exemplos nas seções abaixo.

### Requisitos condicionais (`requiredIf`)

Exija uma variável somente quando outra variável corresponder a um valor específico (`equals`) ou a um de vários valores (`in`):

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  SENTRY_DSN:    { type: 'url', requiredIf: { key: 'MODE', equals: 'production' } },
  ALERT_WEBHOOK: { type: 'url', requiredIf: { key: 'MODE', in: ['staging', 'production'] } },
  MODE:          { type: 'string', choices: ['development', 'staging', 'production'], default: 'development' },
});
```

O `validateEnv` avalia os esquemas em **duas passagens**:

1. **Passagem 1** converte cada variável fornecida, aplica os valores `default`, executa todas as verificações por chave (`min`/`max`, `minLength`/`maxLength`, `length`, `choices`, `pattern`, `transform`) e registra os erros incondicionais de `required: true`.
2. **Passagem 2** avalia cada regra `requiredIf` para as chaves que estavam ausentes e não tinham `default`, comparando com os valores validados da Passagem 1 (recorrendo ao objeto `env` bruto se a chave referenciada não estiver declarada no esquema).

Como a Passagem 2 é executada depois que a Passagem 1 termina, a ordem de declaração das chaves no esquema não importa (`SENTRY_DSN` pode ser declarada antes de `MODE`), e as condições correspondem a valores convertidos (como o `boolean` `true` ou o `int` `3`), bem como a valores `default`. Quando a condição é verdadeira e a chave está ausente, o `validateEnv` relata o erro usual `<KEY>: missing required variable` (ou o coleta em `errors` com `{ throwOnError: false }`). Quando a condição é falsa — ou quando a chave referenciada está ausente ou falhou na validação da Passagem 1 — a chave permanece opcional. Se a chave for fornecida mesmo assim, ela continua sendo convertida e validada normalmente. Duas combinações são rejeitadas de antemão como erros de esquema: `required: true` junto com `requiredIf` na mesma chave, e um `requiredIf` que nomeia a própria chave — ambas são contraditórias, então o esquema falha em vez de ignorar a condição silenciosamente.
### Modo sem exceção — colete os erros em vez de lançar

Uma verificação de integridade, uma CLI ou um servidor que queira iniciar em modo degradado não pode usar uma API que lança exceção no primeiro valor inválido. Passe `{ throwOnError: false }` e o `validateEnv` retorna `{ env, errors }`: `env` contém cada valor que foi validado, e `errors` é a mesma lista que o `EnvSaafError` carregaria.

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

O padrão não muda: sem a opção, ou com `{ throwOnError: true }`, um valor inválido ainda lança um único `EnvSaafError` listando todos os problemas. Um esquema malformado também continua lançando — isso é um bug no código, não no ambiente. O `loadEnv` também continua lançando, porque com `{ assign: true }` ele escreve em `process.env` e uma escrita aplicada pela metade é pior do que uma inicialização falha; chame `validateEnv` quando quiser a lista de erros.

### Mensagens de erro personalizadas: `formatError`

A `EnvSaafError.message` é uma lista fixa com marcadores. Para alimentar logs estruturados, um alerta no Slack ou um banner de inicialização com as falhas, passe um `formatError(errors, context)` opcional ao `validateEnv` (ou ao `loadEnv`, que o repassa):

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

- `errors` é uma cópia somente leitura dos mesmos diagnósticos brutos que `error.errors` carrega. São as mensagens existentes, então elas podem incluir exemplos de entrada não confidenciais (os valores de chaves `sensitive: true` permanecem mascarados, como antes). O `context` é separado e contém apenas `{ keys }`, os nomes das chaves do esquema; o objeto de ambiente e as regras do esquema nunca são passados.
- A string que você retorna se torna `error.message`. O `error.errors` não muda e, sem a opção, a mensagem é idêntica, byte a byte, ao que era antes.
- Um hook que lança exceção, ou retorna qualquer coisa que não seja uma string, volta à mensagem padrão. Um `formatError` que não é uma função é um `TypeError`.
- Com `{ throwOnError: false }`, nenhum erro é lançado, então o hook não é chamado e o `errors` do resultado permanece bruto. O `loadEnv` sempre lança, então ele encaminha o hook para falhas de validação. Falhas anteriores à validação, como um arquivo `.env` ilegível ou impossível de analisar, lançam seus próprios erros e estão fora do escopo do hook. Erros de esquema malformado também não são formatados.

Em TypeScript, `{ throwOnError: false }` (não `formatError`) estreita o tipo de retorno para `ValidateResult<S>` (`{ env: EnvResult<S>; errors: string[] }`), então `env.PORT` mantém o tipo inferido do esquema.

### Modo estrito — detecte erros de digitação nos nomes das variáveis

Por padrão, o `validateEnv` só olha as chaves do esquema. Com `{ strict: true }`, ele também sinaliza variáveis que estão definidas, mas não estão no esquema — assim, um erro de digitação como `DATABSE_URL` ao lado do verdadeiro `DATABASE_URL` não passa mais despercebido:

```js
const env = validateEnv(schema, process.env, { strict: true });
// throws EnvSaafError listing e.g. "DATABSE_URL: set but not in schema (strict mode)"
```

Uma quase-correspondência é nomeada: quando uma chave obrigatória está ausente e uma chave definida, mas não declarada, tem o mesmo nome ignorando maiúsculas/minúsculas ou está a uma edição de distância (uma troca `PROT`/`PORT`), a mensagem termina com `(did you mean PROT? it is set but not in the schema)`. O aviso extra do modo estrito recebe a dica correspondente na outra direção. Apenas nomes de chaves são sugeridos; os valores nunca são exibidos, nem mesmo para regras `sensitive`.

O padrão continua desativado — muitos aplicativos compartilham um mesmo ambiente com outras ferramentas.

### Renomeando variáveis com segurança usando `aliases`

Renomear uma variável de ambiente em uma frota inteira geralmente significa que nomes antigos e novos coexistem por semanas. Declare os nomes antigos com `aliases` na chave canônica:

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

- Quando `DATABASE_URL` não está definida (ou está vazia `""`) e `DB_URL` está definida, o primeiro alias preenchido fornece o valor em `env.DATABASE_URL`, passa pela conversão, validação e `transform` normais, e emite um aviso de obsolescência (`env-saaf: DB_URL is deprecated; use DATABASE_URL instead`).
- Quando tanto `DATABASE_URL` quanto `DB_URL` estão definidas, `DATABASE_URL` vence e um aviso observa que o alias é ignorado (`env-saaf: DB_URL is ignored because DATABASE_URL is set`).
- Os avisos nunca fazem a validação falhar. Por padrão, eles são registrados com `console.warn`; passe `onWarn: fn` ao `validateEnv` ou ao `loadEnv` para direcioná-los ao seu próprio logger (ou `() => {}` para silenciá-los).
- No modo `{ strict: true }`, os aliases declarados são reconhecidos e não são sinalizados como variáveis desconhecidas.
- Um alias não pode ser igual a uma chave declarada do esquema (incluindo a própria chave) nem ser compartilhado por regras diferentes. Esses erros de esquema lançam `EnvSaafError` antes da leitura dos valores, mesmo com `{ throwOnError: false }`. Repetir um alias dentro de uma mesma regra é permitido.

### Esquemas agrupados (aninhados) com um prefixo de chave

Esquemas que repetem um prefixo podem agrupar as regras sob ele:

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

- Um grupo é uma regra com um objeto `schema` e sem `type`, mais um `prefix` não vazio. Cada regra interna é lida de `prefix + INNER_NAME`, então os erros sempre nomeiam a variável de ambiente completa (`DB_HOST: missing required variable`).
- O resultado se aninha sob a chave do grupo: `{ DB: { HOST, PORT } }`. Se nenhuma chave interna estiver presente, a chave do grupo é omitida, assim como uma chave simples opcional ausente.
- `strict`, `aliases`, `requiredIf` e `default` funcionam dentro de grupos; dentro de um grupo, `aliases` e `requiredIf.key` usam **nomes completos de variáveis de ambiente** (p. ex. `aliases: ['DATABASE_HOST']`, `requiredIf: { key: 'NODE_ENV', equals: 'production' }`, ou o `'DB_HOST'` de outro grupo).
- O `generateExample` continua emitindo nomes de ambiente simples (`DB_HOST=...`) com um comentário `# group DB` acima das chaves do grupo.
- `loadEnv(..., { assign: true })` grava os nomes simples de volta (`DB_HOST=...`), nunca um objeto aninhado.
- Grupos malformados são rejeitados de antemão pelo `validateSchema` (agora exportado): um `prefix` ausente/vazio, um `schema` que não é objeto ou está vazio, um `type` no grupo, grupos aninhados, opções extras no grupo, ou um prefixo que colide com outra chave (p. ex. um `DB_HOST` declarado mais um grupo `DB_`) — tudo isso lança `EnvSaafError` nomeando o problema.
- Em TypeScript, o `EnvResult` também aninha os grupos: `env.DB` é `{ HOST: string; PORT: number; ... } | undefined` (a chave do grupo é opcional; as chaves internas mantêm sua própria opcionalidade de required/default). O `EnvGroupRule` é exportado para tipar uma regra de grupo isolada.
### `validate` por chave — regras de validação personalizadas

Algumas regras são específicas do aplicativo — um caminho precisa ser um diretório existente, ou duas chaves precisam ser diferentes. Passe uma função `validate(value, env)` na chave em vez de fazer um fork da biblioteca:

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

O `validate` é executado após a conversão de tipo e as verificações internas (`min`/`max`, `minLength`/`maxLength`, `length`, `choices`, `pattern`), antes do `transform`, e também valida os valores `default`. Ele recebe o `value` convertido e o objeto `env` de entrada. Retorne `true` (ou `undefined`/`null`) para aprovar, `false` para um erro genérico nomeando a chave, ou uma mensagem de erro em string não vazia para falhar. Um validador que lança exceção é coletado no `EnvSaafError` (ou em `errors` com `{ throwOnError: false }`) como uma falha de validação nomeando a chave, em vez de travar, e respeita o mascaramento de `sensitive: true`.

### `transform` por chave — um passo personalizado após a conversão

Alguns valores precisam de um pequeno passo personalizado após a conversão de tipo que o env-saaf não tem como adivinhar — normalizar a caixa, ajustar uma unidade numérica ou pós-processar um array analisado:

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  ALLOWED_ORIGINS: { type: 'array', transform: xs => xs.map(s => s.toLowerCase()) },
  SHOUTY_NAME:     { type: 'string', transform: v => v.toUpperCase() },
});
// env.ALLOWED_ORIGINS is a lower-cased string[], env.SHOUTY_NAME is upper-cased
```

O transform é executado após a conversão, as verificações internas (`min`/`max`, `minLength`/`maxLength`, `length`, `choices`, `pattern`) e o `validate` personalizado; se ele lançar uma exceção, o erro é coletado como qualquer outro erro de validação (com a chave nomeada). Seu valor de retorno é verificado em relação ao `type` declarado da regra (p. ex. `number`/`int`/`port`/`duration` precisam continuar sendo um número finito/inteiro/porta, `boolean` um booleano, `date` um `Date` válido, `array` um array de itens de `of`, `string` e regras com tipo de string uma string válida) — retornar o tipo errado produz um erro de validação nomeando a chave e o tipo esperado. Ele é executado apenas sobre valores realmente fornecidos — não sobre valores `default` (os padrões continuam sendo convertidos e validados como qualquer valor, então um padrão inválido falha com um erro nomeando a chave). Em TypeScript, o tipo do resultado dessa chave é inferido do tipo de retorno do transform.

### Tipo `email` e `pattern` — valide formatos

```js
const env = validateEnv({
  ADMIN_EMAIL: { type: 'email', required: true },
  SLUG:        { type: 'string', pattern: /^[a-z0-9-]+$/ },
  API_KEY:     { type: 'string', pattern: /^sk_[A-Za-z0-9]+$/ },
});
```

A verificação de `email` é pragmática (um `@`, uma parte local e um domínio não vazios, e um ponto no domínio), e não a RFC 5322 completa. O `pattern` recebe um `RegExp` ao qual um valor em string precisa corresponder (`string`, `email`, `url`, `file`, `uuid`, `hex`, `ipv4`, `ipv6`, `semver`, `base64`, `host`); ele é executado após a conversão e a verificação de `choices`, um erro de incompatibilidade nomeia o pattern que falhou, e usar `pattern` em um tipo que não é de string é rejeitado de antemão.

### Tipo `int` e `min`/`max` — números inteiros e intervalos

```js
const env = validateEnv({
  MAX_RETRIES: { type: 'int', min: 0, max: 5, default: 3 },
  TIMEOUT_MS:  { type: 'number', min: 100, max: 30000 },
});
```

O `int` é como o `number`, mas rejeita valores fracionários (`3.5` falha, `42` e `1e3` passam). `min` e `max` funcionam em `number`, `int` e `port`; qualquer um deles pode ser usado sozinho, e um valor fora do intervalo é rejeitado com um erro nomeando o intervalo permitido.

### Tipo `json` e `minLength`/`maxLength` — valores estruturados e comprimentos de string

```js
const env = validateEnv({
  FEATURE_FLAGS: { type: 'json', default: { beta: false } },
  API_TOKEN:     { type: 'string', minLength: 10, maxLength: 64, required: true },
});
```

O `json` analisa o valor com `JSON.parse` (objetos, arrays e primitivos voltam todos analisados); um JSON inválido é rejeitado com um erro nomeando a chave. Um `default` pode ser fornecido como um objeto já analisado. `minLength` e `maxLength` funcionam em tipos com valor em string (`string`, `email`, `url`, `file`, `uuid`, `hex`, `ipv4`, `ipv6`, `semver`, `base64`, `host`) e são rejeitados de antemão em qualquer outro tipo; qualquer um deles pode ser usado sozinho, e um valor curto ou longo demais é rejeitado com um erro nomeando o comprimento permitido. Eles se combinam com `pattern` (o comprimento é verificado primeiro, depois o pattern).

### Tipos `uuid` e `hex` — IDs e strings hexadecimais

```js
const env = validateEnv({
  TENANT_ID: { type: 'uuid', required: true },
  API_HASH:  { type: 'hex', length: 64 },
});
```

O `uuid` aceita um UUID canônico (grupos hexadecimais `8-4-4-4-12`, em maiúsculas e minúsculas) e o retorna sem alterações; um valor malformado é rejeitado com um erro nomeando a chave. O `hex` aceita apenas strings hexadecimais (`deadBEEF42` passa, `0x1234` não); a opção opcional `length` fixa o tamanho exato em caracteres, para tokens e hashes de tamanho fixo.

### Tipos `ipv4`, `semver` e `base64` — endereços de rede, versões e valores codificados

```js
const env = validateEnv({
  BIND_ADDR: { type: 'ipv4', required: true },
  APP_VERSION: { type: 'semver', required: true },
  WEBHOOK_SECRET: { type: 'base64', required: true },
});
```

O `ipv4` aceita um endereço com pontos (`192.168.0.1` passa, `256.1.1.1` e `1.2.3` não); um octeto com zero à esquerda (`01.2.3.4`) é rejeitado porque é ambíguo. O `semver` aceita `MAJOR.MINOR.PATCH` com sufixos opcionais de pré-lançamento e de build (`1.2.3-beta.1` passa) e um prefixo `v` minúsculo opcional (`v1.2.3` passa, retornado sem alterações — a forma que o `git describe` e os pipelines de release emitem); `1.2`, `vv1.2.3` e `V1.2.3` maiúsculo não passam. O `base64` aceita tanto o alfabeto padrão (`A-Za-z0-9+/`) quanto o alfabeto seguro para URL (`A-Za-z0-9-_`). O preenchimento pode ser omitido. Quando presente, ele precisa estar completo e aparecer no final. Os três retornam o valor sem alterações, e `minLength`/`maxLength` funcionam neles como em qualquer outro tipo de string.

### Tipo `date` — datas ISO 8601 como objetos `Date`

```js
const env = validateEnv({
  LAUNCH_DATE: { type: 'date', required: true },
  CUTOFF:      { type: 'date' },
}, process.env);

if (env.LAUNCH_DATE < new Date()) console.log('Launched!');
```

O `date` analisa uma data ISO 8601 (`2026-01-31`) ou data e hora (`2026-01-31T10:00:00Z`, com segundos opcionais, segundos fracionários e um deslocamento `Z` ou `±HH:MM`) e retorna um `Date` do JavaScript, então datas de corte, datas de lançamento e datas de expiração não precisam de análise manual. Datas impossíveis são rejeitadas com um erro nomeando a chave — `2026-02-31` falha em vez de rolar silenciosamente para março, e o mesmo acontece com valores malformados como `31-01-2026` ou `2026/01/31`. Um `Date` fornecido como `default` passa sem alterações, e o `generateExample` sugere `2026-01-31` para o tipo.

### Tipo `duration` — tempos limite legíveis em milissegundos

```js
const env = validateEnv({
  CACHE_TTL: { type: 'duration', required: true },
  TIMEOUT:   { type: 'duration', default: '30s' },
}, process.env);

setTimeout(refresh, env.CACHE_TTL); // 900000 for '15m'
```

O `duration` analisa uma duração legível (`500ms`, `30s`, `15m`, `2h`, `1d`, `1w`) em um número de milissegundos; valores compostos somam suas partes, então `1h30m` é 5.400.000 ms e `2d12h` é 216.000.000 ms (cada parte precisa de uma unidade — `1h30` é rejeitado); um número puro já é milissegundos, então `'250'` e `250` significam ambos 250 ms. As unidades não distinguem maiúsculas de minúsculas e decimais são permitidos (`1.5h` é 5.400.000 ms); `w` é uma semana de 7 dias, então `1w` é 604.800.000 ms. Unidades desconhecidas (`15min`, `15sec`), negativos e valores malformados são rejeitados com um erro nomeando a chave. Um número fornecido como `default` é interpretado como milissegundos, e `min`/`max` funcionam sobre o resultado em milissegundos como em qualquer outro número. O `generateExample` sugere `15m` para o tipo.

### Tipo `host` — um nome de host ou endereço IP, sem esquema nem porta

```js
const env = validateEnv({
  DB_HOST: { type: 'host', required: true },
  BIND_ADDR: { type: 'host', default: 'localhost' },
}, process.env);
```

O `host` aceita um nome de host (`db.internal`, `localhost`) ou um endereço IPv4/IPv6 (`10.0.0.5`, `::1`) e o retorna sem alterações. Um valor com esquema (`https://db.internal`), caminho (`db/x`) ou porta (`example.com:8080`) é rejeitado com um erro nomeando a chave — isso pertence ao tipo `url` ou a uma variável de porta separada. `minLength`/`maxLength` e `pattern` funcionam nele como em qualquer outro tipo de string, e o `generateExample` sugere `localhost` para o tipo.

### Tipo `url` e `protocols` — esquemas permitidos

```js
const env = validateEnv({
  WEBHOOK_URL: { type: 'url', protocols: ['https'], required: true },
});
```

O `url` valida com `new URL()` e retorna o valor exatamente como fornecido (sem normalização — uma origem pura não ganha uma barra final). O `protocols` define a lista de esquemas que um valor pode usar (`['https']` rejeita `ftp://...` e `javascript:...` com um erro nomeando os esquemas permitidos); a correspondência não distingue maiúsculas de minúsculas, e as entradas podem ser escritas com ou sem dois-pontos no final (`'https'` e `'https:'` significam a mesma coisa). Sem a opção, qualquer URL válida passa, como antes.

### Tipo `array` — divida uma string delimitada em um array tipado

```js
const env = validateEnv({
  ALLOWED_ORIGINS: { type: 'array', of: 'url', protocols: ['https'], required: true },
  PORTS:           { type: 'array', of: 'port', separator: ';', default: [80, 443] },
  ADMIN_EMAILS:    { type: 'array', of: 'email' },
});
```

O `array` divide uma string delimitada pelo `separator` (padrão `','`), apara cada item por padrão (`trim: false` mantém os espaços ao redor) e converte cada item com `of` (padrão `'string'`; qualquer tipo escalar interno é aceito, e um `'array'` aninhado é rejeitado de antemão). Itens vazios (como `a,,b` ou uma vírgula no final `a,b,`) são rejeitados em vez de descartados silenciosamente, e qualquer item inválido relata seu índice baseado em 0 e o valor problemático (`PORTS[1]: expected a port (0-65535, e.g. 3000), got "abc"` — mascarado quando `sensitive: true`). `minItems` e `maxItems` limitam o número de itens (ambos inteiros não negativos, `minItems` não pode exceder `maxItems`); uma violação relata a chave com a contagem e o limite (`TAGS: expected at least 2 items, got 1`), e os limites também se aplicam aos valores `default`. Valores malformados e o uso em uma regra que não é `array` são rejeitados de antemão. Um array já analisado pode ser passado como `default` (inclusive `[]`), e o `generateExample` sugere três itens de exemplo do tipo `of` unidos pelo `separator` — `a,b,c` para o `string` padrão, mas `1,2,3` para `int`, `3000,8080,5432` para `port`, e assim por diante — de modo que o próprio valor gerado valida em relação à regra; o comentário acima de cada chave de array nomeia o tipo do item (`# type: array, items: int`). Em TypeScript, o tipo do elemento é inferido de `of`.

### `trim: false` — mantenha os espaços em branco quando eles importam

Os valores são aparados antes da validação por padrão — útil para segredos colados de painéis com espaços perdidos. Quando o espaço em branco *é* o valor, desative o corte para essa chave:

```js
const env = validateEnv({
  TOKEN: { type: 'string', trim: false, required: true },
});
// TOKEN: '  secret  ' stays '  secret  '
```

O `trim: false` afeta apenas os tipos semelhantes a string; números e booleanos não são afetados (`' 42 '` ainda é analisado como `42`, `' true '` ainda é analisado como `true`).

### Carregando um arquivo `.env` de verdade

Uma única chamada resolve — leia o arquivo, analise-o, valide-o:

```js
const { loadEnv } = require('env-saaf');

const env = loadEnv({
  PORT:    { type: 'port', required: true },
  API_URL: { type: 'url', required: true },
}); // reads `.env` by default
```

Opções: `{ path: '.env.local' }` para ler outro arquivo, `{ override: true }` para deixar o arquivo vencer o `process.env` (por padrão, os valores existentes de `process.env` vencem), `{ assign: true }` para gravar os valores validados de volta em `process.env` como strings. Um `path` passado explicitamente que não existe lança um erro nomeando o caminho — um arquivo com nome digitado errado não pode iniciar silenciosamente. Sem a opção `path`, o padrão implícito `.env` pode estar ausente (cada variável então precisa de um padrão ou ser opcional), e entradas ausentes de uma lista de arquivos (`paths: [...]` ou `path` como array) são ignoradas; uma lista só lança exceção quando nenhum arquivo é encontrado e uma variável obrigatória está ausente. Por padrão, o `process.env` nunca é alterado.

Vários arquivos podem ser sobrepostos — os arquivos posteriores sobrescrevem os anteriores:

```js
const env = loadEnv(schema, { paths: ['.env', '.env.local'] });
// or: { path: ['.env', '.env.local'] }
```

Os valores podem referenciar outros valores com `${VAR}` — útil para montar URLs a partir de partes. As referências são resolvidas primeiro no mesmo arquivo, depois em `process.env`; valores entre aspas simples e escapes `\${VAR}` permanecem literais:

```env
HOST=example.com
API_URL=https://${HOST}/api
```

Use `${VAR:-fallback}` para fornecer uma alternativa quando um valor não está definido ou se expande para uma string vazia. Use `${VAR-fallback}` para fornecê-la apenas quando o nome não está definido. Por exemplo, `API_URL=https://${HOST:-localhost}/api` usa `localhost` quando `HOST` não tem valor. Os valores padrão podem incluir referências como `${HOST:-${DEFAULT_HOST}}`.

Valores entre aspas também podem se estender por várias linhas (chaves PEM, blocos JSON) — a análise continua até a aspa de fechamento. Uma aspa escapada com barra invertida (`\'` dentro de aspas simples, `\"` dentro de aspas duplas) permanece parte do valor, então `B='it\'s'` é `it's`; outras barras invertidas, como em um caminho do Windows, são mantidas como estão.

Uma linha solta sem `=`, ou uma atribuição com uma chave inválida (como `MY KEY`), gera um erro de sintaxe com o número da linha, sem ecoar o valor. As chaves de atribuição precisam corresponder a `[A-Za-z_][A-Za-z0-9_.-]*`: pontos e hífens são permitidos após o primeiro caractere (como em `app.name` e `MY-KEY`), mas espaços dentro da chave não são permitidos. Use `KEY=` para um valor vazio.

Em código assíncrono, use `loadEnvAsync` para ler arquivos sem bloquear com E/S do sistema de arquivos.

```js
const { loadEnvAsync } = require('env-saaf');

async function readConfig() {
  return await loadEnvAsync(
    { PORT: { type: 'port', default: 3000 } },
    { paths: ['.env', '.env.local'] }
  );
}
```

Ele aceita as mesmas opções do `loadEnv`, incluindo precedência de arquivos, `override` e `assign`. A promessa é resolvida com os valores validados e rejeitada com os mesmos erros que o `loadEnv` lança.

A forma manual também continua funcionando — analise o arquivo e passe-o:

```js
const fs = require('node:fs');
const { parseEnvFile, validateEnv } = require('env-saaf');

const fileEnv = parseEnvFile(fs.readFileSync('.env', 'utf8'));
const env = validateEnv({
  PORT:    { type: 'port', required: true },
  API_URL: { type: 'url', required: true },
}, fileEnv);
```

Módulos ES também funcionam:

```js
import { validateEnv } from 'env-saaf';
```

### TypeScript: o tipo de retorno é inferido do esquema

O tipo de retorno do `validateEnv` é inferido do esquema — uma chave com `type: 'port'` se torna `number`, uma chave `boolean` se torna `boolean`, e uma chave sem `required` ou `default` é `| undefined`:

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

Passe o esquema embutido no `validateEnv(...)` (ou use `as const`) para que o TypeScript enxergue os tipos literais. Os tipos `EnvResult<S>` e `EnvValue<R>` também são exportados separadamente.

## Receitas

Esses padrões curtos usam apenas opções do `validateEnv` disponíveis na API atual.

### URL do banco de dados e tamanho do pool de conexões

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  DATABASE_URL: { type: 'url', required: true },
  DB_POOL_SIZE: { type: 'number', default: 10 },
});
// env.DATABASE_URL is present; env.DB_POOL_SIZE is a number.
```

O `url` valida a sintaxe da URL, enquanto o `number` converte o tamanho do pool a partir da sua string de ambiente.

### Feature flags

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  ENABLE_EXPORTS: { type: 'boolean', default: false },
  ENABLE_PREVIEW: { type: 'boolean', default: false },
});

if (env.ENABLE_EXPORTS) console.log('Exports are enabled');
```

O tipo booleano aceita `true`/`false`, `yes`/`no`, `on`/`off` e `1`/`0` (também `y`/`n`),
sem distinção de maiúsculas e minúsculas.

### Chave de analytics opcional

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  ANALYTICS_WRITE_KEY: { type: 'string' },
});

if (env.ANALYTICS_WRITE_KEY !== undefined) {
  console.log('Analytics is configured'); // Use the key with your analytics client; do not log it.
}
```

Sem `required` ou `default`, uma chave ausente é omitida do resultado e tem o tipo TypeScript
`string | undefined`.

### Requisitos diferentes para desenvolvimento e produção

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

Valide o modo primeiro e depois escolha um esquema comum no código do aplicativo quando precisar de valores `default` ou tipos diferentes por ambiente. Para tornar uma chave obrigatória apenas em um modo específico, use `requiredIf` em um único esquema.

### Fastify

Valide a configuração na inicialização **antes** de registrar plugins ou chamar `fastify.listen(...)` e, em seguida, anexe o objeto de configuração tipado e congelado à instância do Fastify com `fastify.decorate('config', config)`. Executar a validação antes de `register` e `listen` garante que o processo falhe rápido, antes que os plugins abram pools de banco de dados ou o servidor vincule uma porta, e decorar a instância dá às rotas e aos plugins acesso tipado via `fastify.config`, sem reler o `process.env`:

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

Para desenvolvimento local com um arquivo `.env`, substitua `validateEnv(schema)` por `loadEnv(schema)` (ou `loadEnv(schema, { paths: ['.env', '.env.local'] })`) no mesmo bloco de inicialização.

### Next.js

Coloque seu esquema exclusivo do servidor em um módulo compartilhado (como `lib/env.ts`) e importe-o do hook `register()` do `instrumentation.ts` do Next.js, que é executado **uma vez, quando o servidor Node.js sobe** — antes de lidar com requisições, Route Handlers ou Server Components. Proteja com `process.env.NEXT_RUNTIME === 'nodejs'` se o seu aplicativo também usar o runtime Edge, já que o `env-saaf` usa recursos internos do Node (`node:fs`, `node:net`, `node:path`). Você também pode importar o mesmo módulo de validação no topo do `next.config.mjs` se quiser que o `next build` falhe rápido quando faltar configuração de tempo de build.

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

O Next.js carrega os arquivos `.env`, `.env.local` e `.env.*` específicos de ambiente em `process.env` automaticamente, antes de o `instrumentation.ts` ser executado, então o `validateEnv` os lê diretamente, sem chamar o `loadEnv`.

**Variáveis `NEXT_PUBLIC_` estão fora do escopo de segredos:** o Next.js embute cada variável `NEXT_PUBLIC_*` no pacote do navegador em tempo de build. Nunca armazene segredos (chaves de API, URLs de banco de dados, segredos de assinatura) em variáveis `NEXT_PUBLIC_*` — mantenha os segredos em variáveis sem prefixo, exclusivas do servidor, validadas em módulos exclusivos do servidor como `lib/env.ts`. Se você também quiser validar configurações públicas do cliente (como `NEXT_PUBLIC_SITE_URL`), passe um objeto explícito (`validateEnv({ NEXT_PUBLIC_SITE_URL: { type: 'url', required: true } }, { NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL })`), porque o Next.js substitui estaticamente as referências literais a `process.env.NEXT_PUBLIC_*` nos pacotes do cliente, em vez de expor um objeto `process.env` completo.

### Mantenha o `.env.example` honesto (CLI)

A saída da CLI é texto simples por padrão, inclusive em pipes e em CI. Para scripts que definem uma preferência de cor compartilhada, passe `--no-color` antes ou depois do comando, ou defina `NO_COLOR=1`.

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

Começando um projeto novo? O `env-saaf init` escreve um `env.schema.js` inicial com exemplos comentados dos principais tipos (`string`, `int`, `boolean`, `port`, `url`, `email`, `duration`, `host`) e gera um `.env.example` correspondente a partir dele. Cada espaço reservado sugerido é um valor que valida em relação à sua própria regra, então um `.env.example` gerado passa no `check` de imediato (o tipo `file` é a exceção — seu caminho `./config.json` precisa existir primeiro). Em um projeto cujo `package.json` tenha `"type": "module"`, o arquivo inicial é escrito como `env.schema.cjs`, para que ele ainda carregue com `require()` — nomeie também o seu próprio esquema com a extensão `.cjs` nesse caso. O primeiro `check` após o `init` passa com uma observação até que o código leia as variáveis — as chaves que o scaffold declara, mas que nenhum código usa ainda, não são tratadas como desvio. Quando o código lê pelo menos uma variável, as chaves não utilizadas voltam a falhar no check, como antes. A presença de qualquer um dos dois arquivos é uma recusa (saída 1, nomeando os arquivos), a menos que `--force` seja passado; `--schema <file>` nomeia o arquivo de esquema em vez de `env.schema.js`.

Já tem um `.env.example` e nenhum esquema? O `env-saaf init --from-example` (opcionalmente `--from-example=FILE` para outro nome) analisa o arquivo de exemplo e infere uma regra inicial por chave a partir do seu valor de amostra, nesta ordem de prioridade: um UUID -> `uuid`, um JWT válido (três segmentos base64url com cabeçalho e payload JSON) -> `jwt`, uma data ou data e hora ISO -> `date`, uma duração como `30m` ou `1h30m` -> `duration`, uma versão semântica como `1.4.2` -> `semver`, um objeto ou array válido como JSON -> `json`, uma string hexadecimal de comprimento par com pelo menos oito caracteres -> `hex`, um número com cara de porta (um número inteiro entre 1024-65535) -> `port`, qualquer outro inteiro -> `int`, `true`/`false` -> `boolean`, uma URL `http(s)` -> `url`, um endereço de e-mail -> `email`, um decimal -> `number`, qualquer outra coisa (incluindo valores vazios e strings ambíguas como `cafe`) -> `string`. Cada candidato é confirmado com o validador real, para que uma regra inferida sempre aceite a amostra de onde veio. Cada regra inferida é escrita com um comentário dizendo que ela foi inferida e deve ser revisada (os próprios valores de amostra não são copiados para o esquema, então uma senha no exemplo não pode vazar para o arquivo versionado). As chaves que a varredura de código encontra e que o exemplo não lista são incorporadas como regras `string`, como no scaffold fixo. O arquivo de exemplo nunca é escrito nem sobrescrito nesse modo: apenas o arquivo de esquema é, ainda recusando sobrescrever sem `--force`. O esquema gerado valida em relação aos valores de amostra do próprio exemplo, então `env-saaf check . --file .env.example --schema env.schema.js` passa logo em seguida. Passe `--groups` (`env-saaf init --from-example --groups`) para dobrar as chaves que compartilham um prefixo comum em um esquema agrupado (p. ex. `DB_HOST` e `DB_PORT` se tornam um grupo `DB` com `prefix: 'DB_'`) quando o prefixo tem pelo menos dois caracteres e pelo menos duas chaves o compartilham.

Quando o `.env.example` (ou o arquivo fornecido com `--file`) está no diretório varrido, o `scan` também avisa sobre chaves declaradas ali que nenhum código lê, uma por linha no stderr: `UNUSED: OLD_KEY (in .env.example, never used in code)`. Com `--json`, elas são listadas em um array `unused` ao lado de `vars`. É apenas um aviso: o stdout ainda contém somente as variáveis usadas, e o `scan` ainda sai com 0 (use o `check` para falhar um job de CI por desvio). Sem um arquivo de modelo, nada muda.

Ao varrer um diretório, o `scanDir` ignora `node_modules`, `.git*` e saídas de build comuns (`dist`, `build`, `coverage`, `.next`, `out`, `target`), para que um bundle antigo não faça uma chave não utilizada parecer em uso; na CLI, tanto `scan` quanto `check` aceitam `--exclude <pattern>` (repetível) para deixar de fora diretórios ou padrões glob como `fixtures` ou `'src/generated/**'`. Uma varredura lê código, não comentários nem o texto dentro de strings e template literals: uma variável nomeada apenas em um comentário (`// set process.env.FOO first`), uma string (`'see process.env.BAR'`) ou o texto de um template não é relatada, então ela não pode satisfazer o `check` silenciosamente nem cair em um rascunho de `example`. Uma leitura dentro do `${...}` de um template continua sendo uma leitura, assim como `process.env['X']`, ``process.env[`X`]`` e a desestruturação. O encadeamento opcional também é uma leitura: `process.env?.MAYBE` e `import.meta.env?.VITE_MAYBE` são relatados exatamente como a forma com ponto simples (assim como `process.env?.['X']` e ``process.env?.[`X`]``). As leituras de `import.meta.env` do Vite são encontradas da mesma forma (acesso com ponto, acesso com colchetes e desestruturação), então os projetos Vite também são varridos corretamente.

Quando um `.env` de verdade está ao lado do modelo, o `check` também compara suas chaves: uma chave no `.env` que não está documentada (`EXTRA in .env: FOO (not in .env.example)`) geralmente é um erro de digitação, e uma chave do modelo sem valor local é relatada como `MISSING in .env: BAR (in .env.example, not set locally)`. O `--file` seleciona o modelo para ambas as comparações; sem um arquivo `.env`, essa verificação extra é ignorada. No modo `--json`, os achados aparecem como `envExtra` e `envMissing`, ao lado dos campos existentes `missing`, `extra`, `unused` e `invalid` — `unused` lista as chaves documentadas, mas não utilizadas, sob o mesmo nome que o `scan --json` usa, e `extra` mantém a lista idêntica para compatibilidade.

O scanner encontra acessos com ponto e chaves estáticas com colchetes por meio de aliases locais simples declarados com `const`, `let` ou `var`, como `const env = process.env; env.PORT`. Isso também funciona com `import.meta.env`. O scanner de texto rastreia as leituras após a declaração. Reatribuição, sombreamento, cadeias de aliases e desestruturação por meio de um alias estão fora do seu escopo.

O `check` sai com 1 sempre que imprime qualquer achado, e o `ok` do `--json` carrega o mesmo valor, então um job de CI falha exatamente quando a saída relata um problema; um projeto totalmente limpo sai com 0. O `UNUSED` também conta como achado: uma chave deixada no modelo depois que seu uso no código acabou faz a execução falhar, então remova-a do modelo quando remover o último uso. A única exceção é um projeto sem nenhum uso de `process.env` — um scaffold novo, por exemplo: o `check` então passa com uma única observação (um campo `note` no `--json`) em vez de uma linha `UNUSED` por chave, porque ainda não há código do qual o modelo possa se distanciar.

`env-saaf print` carrega e valida o arquivo de ambiente (`.env` por padrão, ou `--file`) contra o esquema e imprime a configuração efetiva (valores convertidos e valores padrão) com todas as regras `sensitive: true` e as chaves com nome de segredo mascaradas, em texto e em `--json`; `--json` imprime o mesmo objeto. `--reveal` mostra os valores reais, somente para depuração local — nunca use em registros de CI. Uma falha de validação usa as mesmas mensagens e saída 1 que `check --schema`, então também funciona como uma verificação prévia. Ele exige `--schema`.

O `--schema` é opcional: sem ele, o `check` só compara a presença das chaves. Com ele, o `check` carrega o arquivo de esquema (`module.exports = { PORT: { type: 'port', required: true } }`, resolvido em relação ao diretório verificado) e executa o mesmo `validateEnv` que a biblioteca usa sobre os valores do arquivo `.env` de verdade. Um erro de tipo é relatado como `INVALID: PORT: expected a port (0-65535, e.g. 3000), got "not-a-port"` e faz o check falhar (saída 1); no modo `--json`, as falhas aparecem no campo `invalid`. Para escolher qual arquivo de valores validar contra o esquema, `--values <file>` tem precedência (por exemplo `.env.production` ou `.env.staging`) mantendo `.env.example` (ou `--file`) como modelo, e um arquivo ausente é um erro de uso; sem `--values`, um `--file` explícito seleciona o modelo e também serve como arquivo validado; sem um arquivo `.env`, sem `--values` e sem um `--file` explícito, a etapa de validação de valores é ignorada (os espaços reservados do modelo não são valores reais). Com `--schema`, o `check` também concilia o esquema com o arquivo de exemplo: uma chave declarada no esquema mas ausente do `.env.example` é relatada como `NOT DOCUMENTED`, e uma chave do exemplo que o esquema não declara é relatada como `NOT IN SCHEMA` (esquemas agrupados comparam por nomes planos como `DB_HOST`). Ambos fazem o check falhar e aparecem no `--json` como `schemaNotDocumented` e `documentedNotInSchema`. Um arquivo de esquema que não pode ser carregado (ou não exporta um objeto de esquema) é um erro de uso: uma mensagem clara e saída 2. Com `--json-schema`, o `check` imprime o arquivo `--schema` como um documento JSON Schema rascunho 2020-12 no stdout, em vez de executar o check, para que editores e validadores de CI possam consumi-lo diretamente; o `.env.example` nunca é lido, então um esquema é convertido mesmo antes de existir um arquivo de exemplo. Sem `--schema`, não há nada para converter, então a flag é um erro de uso (saída 2).

### Execute o `check` no GitHub Actions

Um workflow mínimo que faz um pull request falhar quando o código e o `.env.example` se distanciam. Copie-o para `.github/workflows/env-check.yml`:

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

Os segredos de verdade vêm dos segredos de Actions do repositório (Settings, Secrets and variables, Actions), nunca do repositório: versione apenas o `.env.example` e mantenha o `.env` no `.gitignore`. O `.env` acima existe apenas dentro do checkout temporário do job. O `check` compara apenas nomes de chaves e nunca imprime valores, então um segredo não acaba no log. Sem um `.env`, o job ainda compara código e `.env.example`; com um, ele também relata chaves `EXTRA in .env` / `MISSING in .env` (disponível desde a 1.4.0; com a 1.3.0, o `check` compara apenas código e `.env.example`). Qualquer achado sai com 1 e faz o job falhar.

Dois limites da etapa opcional do `.env`: uma chave só está *ausente* quando ela não existe, então um segredo que não está definido ainda escreve `API_KEY=` com um valor vazio e passa na verificação de chave (o `check` não é uma verificação de valor; use o `validateEnv` na inicialização para isso). E o `printf` escreve cada segredo literalmente, então mantenha cada segredo em uma única linha; um segredo de várias linhas seria lido como entradas `NAME=value` extras.

### Gere o `.env.example` a partir de um esquema

O esquema já conhece cada chave — gere o arquivo de exemplo a partir dele em vez de escrevê-lo à mão:

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

Chaves que parecem segredos (`API_KEY`, `DB_PASSWORD`, …) recebem um espaço reservado vazio — não há nada seguro para sugerir para elas. Outras chaves recebem um espaço reservado baseado no tipo, e um `default` explícito é usado como está. Chaves com `aliases` anotam os nomes alternativos obsoletos (`# type: url, required; also accepts DATABASE_URL (deprecated)`), e chaves com `requiredIf` anotam a condição (`# type: url; required when MODE is 'production'`, ou `required when MODE is one of 'staging', 'production'` para a forma `in`).

### Exporte JSON Schema a partir do seu esquema

O `toJsonSchema(schema)` retorna um [JSON Schema rascunho 2020-12](https://json-schema.org/draft/2020-12)
para documentação, ferramentas de editor ou validação de **valores convertidos**, não de strings brutas de `.env`.
Ele não lê variáveis de ambiente nem executa callbacks personalizados.
Esquemas agrupados se aninham como esquemas de objeto, com as regras internas como `properties`
e suas chaves obrigatórias na lista `required` do próprio grupo.

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

Limites numéricos, de comprimento e de itens se tornam palavras-chave do JSON Schema. Os arrays descrevem
seus itens convertidos, as durações são milissegundos, e as datas são serializadas como strings ISO
de data e hora (o esquema também aceita o formato `date`). O tipo `json`
permite qualquer forma de JSON. Os `choices` compatíveis com JSON se tornam valores `enum` sem
nova conversão. Os valores padrão representáveis são exportados na forma convertida como anotações;
o JSON Schema não preenche valores ausentes. Evite colocar segredos em valores padrão de esquema
ou em choices que serão compartilhados.

**Não representado:** `transform`, `validate`, `requiredIf`, `aliases`, `sensitive`,
corte e divisão de entrada, flags de expressões regulares (patterns com flags são omitidos),
e valores padrão que não podem ser convertidos para JSON sem perda ou que dependem do horário local.
A existência de arquivos e as verificações detalhadas de `base64` e `semver` continuam sendo apenas em tempo de execução.
Os formatos padrão são anotações por padrão, e suas regras podem diferir das
verificações do env-saaf. O JSON Schema conta caracteres Unicode para comprimentos de string;
o env-saaf conta unidades de código UTF-16 do JavaScript. Use `validateEnv` ou `loadEnv`
para validação em tempo de execução.

### Registre a configuração em log sem vazar segredos

```js
const { maskSecrets } = require('env-saaf');
console.log(maskSecrets(process.env)); // values masked: sk***56
```

Um valor vazio continua vazio — `maskValue('')` retorna `''`, então um segredo não definido não parece mais definido nos logs.

O `maskSecrets` também é recursivo: objetos simples aninhados e arrays mantêm sua forma, e cada folha escalar é mascarada com as mesmas regras do `maskValue`, então uma configuração analisada é registrada em log com segurança (`maskSecrets({ DB: { PASSWORD: 'hunter2' }, TAGS: ['a', 'b'] })` → `{ DB: { PASSWORD: 'hu***r2' }, TAGS: ['****', '****'] }`). Valores que não são objetos simples (`Date`, instâncias de classes) são tratados como folhas, uma referência repetida como um ciclo é substituída pelo espaço reservado fixo `'[Circular]'` em vez de travar, e o objeto de entrada nunca é alterado. Em TypeScript, o tipo de retorno espelha a forma da entrada recursivamente (`Masked<T>`), com cada folha tipada como `string`.

## Como o env-saaf se compara a envalid, joi e zod

| | `env-saaf` | `envalid` | `joi` | `zod` |
| --- | --- | --- | --- | --- |
| **Escopo** | Apenas variáveis de ambiente (mapas simples de chave-valor) | Apenas variáveis de ambiente | Validação de esquemas de uso geral (requisições, payloads, configuração) | Validação de esquemas de uso geral (requisições, formulários, configuração) |
| **Dependências em tempo de execução** | Zero | Zero | Vários pacotes `@hapi/*` | Zero |
| **Carregamento de `.env` e ferramentas de CLI** | Analisador de `.env` integrado (`loadEnv`/`parseEnvFile`), CLI `scan`/`check`/`example`/`init`, mascaramento de segredos | Apenas validação (combine com Node `--env-file` ou `dotenv`) | Apenas validação (combine com Node `--env-file` ou `dotenv`) | Apenas validação (combine com Node `--env-file` ou `dotenv`) |
| **Agregação de erros** | Coleta todos os erros em uma passagem (`EnvSaafError`, ou `{ env, errors }` com `throwOnError: false`) | Coleta todos os erros em uma passagem (passados a um `reporter` padrão ou personalizado) | Para no primeiro erro por padrão; passe `{ abortEarly: false }` para coletar todos | Coleta todos os problemas em uma passagem (`ZodError` via `parse`, ou `{ success, error }` via `safeParse`) |
| **Inferência em TypeScript** | Inclui `index.d.ts`; infere tipos de objetos simples a partir de esquemas embutidos / `as const` (`json` é inferido como `unknown`, `choices` permanece ampliado) | Escrito em TypeScript; infere os tipos de retorno dos validadores, incluindo uniões literais para `choices` | Inclui tipos, mas não infere tipos TS estáticos a partir de esquemas (defina interfaces separadamente ou use geração de código) | Inferência estática TypeScript-first (`z.infer<typeof schema>`) em objetos aninhados, uniões, literais e transforms |

Mas uma comparação não é um caminho de migração — veja [Migrando para o env-saaf](#migrando-para-o-env-saaf) abaixo para os passos concretos de antes/depois a partir de `dotenv`, `dotenv-safe` e `envalid`.

### Quando o `env-saaf` é uma boa escolha

- Você quer validação de ambiente na inicialização, carregamento de arquivos `.env` (com sobreposição e interpolação `${VAR}`), mascaramento de segredos e uma CLI de CI (`env-saaf check`) para manter o `.env.example` em sincronia com o código — tudo em um único pacote Node.js sem dependências.

### Quando outra biblioteca é uma escolha melhor

- **Validar requisições HTTP, payloads de API, formulários ou JSON aninhado:** o `env-saaf` valida apenas mapas simples de variáveis de ambiente e não tem esquemas de objetos aninhados nem regras condicionais entre campos. Use **zod** (especialmente em TypeScript) ou **joi** quando precisar de validação de dados de uso geral.
- **Você já usa `zod` ou `joi` no projeto:** se você já depende de um deles para validação de requisições/dados e não precisa do analisador de `.env` nem da CLI `scan`/`check` do `env-saaf`, validar o `process.env` com a sua biblioteca atual evita adicionar outra ferramenta.
- **Inferência TypeScript mais rica ou runtimes que não são Node:** use **zod** para inferência estática completa de tipos (formas aninhadas, uniões discriminadas, enums literais estreitados) ou suporte a runtimes de navegador/edge (o `env-saaf` usa os recursos internos do Node `node:fs`, `node:net` e `node:path`). Use **envalid** se quiser validação apenas de ambiente com `devDefault`, acesso ao ambiente protegido por proxy, ou inferência de união literal a partir de `choices`.

## Migrando para o env-saaf

Três caminhos curtos, cada um terminando com um trecho completo que funciona com a API atual (verificado nesta versão). O próprio arquivo `.env` nunca precisa mudar.

### A partir do `dotenv` (leituras manuais de `process.env`)

Mantenha o arquivo `.env` exatamente como ele é. Substitua as leituras espalhadas de `process.env.X` por um esquema mais o `loadEnv`, que analisa o `.env`, valida cada valor e retorna resultados tipados — e execute `env-saaf scan` primeiro para encontrar cada leitura que você tem.

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

### A partir do `dotenv-safe` (o contrato do `.env.example`)

O `dotenv-safe` falha na inicialização quando o `.env` não tem uma chave que o `.env.example` declara. O env-saaf mantém o mesmo arquivo `.env.example` e move a verificação do contrato para onde o desvio realmente acontece — o CI — mais uma verificação de esquema na inicialização.

| `dotenv-safe` | env-saaf |
| --- | --- |
| `require('dotenv-safe').config({ example: '.env.example' })` no código; travamento na inicialização por uma chave ausente | mantenha o `.env.example` sem alterações; `npx env-saaf check` o compara com o seu código e o seu `.env` de verdade (saída 1 em qualquer achado `MISSING` / `EXTRA` / `UNUSED` / `INVALID`) |
| sem validação de tipo — cada valor continua uma string | `loadEnv(schema)` converte e valida cada valor (`port`, `url`, `boolean`, …) na inicialização |
| opção `allowEmptyValues: false` | `sensitive: true` mascara o valor nos erros/na saída e deixa seu espaço reservado no `.env.example` vazio; valores *opcionais* vazios continuam permitidos |

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

### A partir do `envalid` (mapeamento de validadores)

Os validadores comuns correspondem um a um aos tipos de regra do env-saaf:

| envalid | regra do env-saaf | diferença que importa |
| --- | --- | --- |
| `str()` | `{ type: 'string' }` | aparado por padrão (`trim: false` para manter os espaços); `pattern` / `minLength` / `maxLength` disponíveis |
| `str({ default: 'dev' })` | `{ type: 'string', default: 'dev' }` | os valores padrão são validados como valores fornecidos |
| `str({ choices: ['dev', 'prod'] })` | `{ choices: ['dev', 'prod'] }` | `choices` corresponde ao valor *convertido* (funciona também para números/booleanos) |
| `num()` | `{ type: 'number' }` | `min` / `max` limitam o número analisado |
| `port()` | `{ type: 'port' }` | inteiro 0–65535, analisado como número |
| `bool()` | `{ type: 'boolean' }` | aceita `true/false`, `yes/no`, `on/off`, `1/0`, `y/n` |
| `url()` | `{ type: 'url' }` | `protocols: ['https']` define os esquemas permitidos |
| `email()` | `{ type: 'email' }` | — |
| `json()` | `{ type: 'json' }` | analisado como um valor JS de verdade, não uma string |

Ambas as bibliotecas agregam todos os erros em uma passagem; o env-saaf lança um `EnvSaafError` cujo `.errors` lista cada problema (ou retorna `{ env, errors }` com `throwOnError: false`).

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

## Versões

- **v0.1.0** — `validateEnv` central: tipos (string/number/boolean/url/port), required, valores padrão, choices, todos os erros de uma vez.
- **v0.2.0** — análise de arquivos `.env`, varredura de código (diferença entre usado e documentado), CLI (`check` / `scan`).
- **v1.0.0** — mascaramento de segredos, geração de `.env.example` a partir do esquema e da varredura de código, definições TypeScript, API estável.
- **v1.1.0** — `--help` da CLI sai com 0, booleano `on`/`off`/`y`/`n`, `scanCode` encontra desestruturação com `let`/`var`, comentários embutidos removidos no `parseEnvFile`, arquivos `.mts`/`.cts` varridos.
- **v1.2.0** — tipo `email` e opção `pattern`, saída `--json` da CLI, `transform` por chave, interpolação `${VAR}`, `loadEnv` de vários arquivos, valores entre aspas de várias linhas, `--no-color` da CLI, tipo `int` com `min`/`max`, receitas no README.
- **v1.5.0** — tipos `duration` e `host`, tipos `date` e `file`, modo sem exceção, interpolação `${VAR:-default}`, validação `--schema` da CLI, erros de chave duplicada e de linha solta em arquivos `.env`, validação de diretório em `scan`/`check`/`example`, exemplo com Express, tabela de referência de tipos no README.
- **v1.6.0** — tipos `bigint` e `ipv6`, esquemas agrupados (aninhados), tipo `array` com coerção por item, opções `requiredIf`/`aliases`/`conflictsWith`/`deprecated`, `loadEnvAsync`, exportação `toJsonSchema`, comandos CLI `init` e `print`, `check --fix`, detecção de segredos reais no `check`, `scan`/`check` de arquivo único, testes fuzz baseados em propriedades — a maior versão até agora, com muitas contribuições externas.
- **v1.7.0** — tipo `jwt` para validar o formato de JSON Web Tokens, esquemas mais rígidos (`choices` fora de array e `length` fora de `hex` rejeitados de antemão), interpolação de `loadEnv` em camadas entre arquivos, desestruturação de aliases no `scanCode`, segredos não-string mascarados, rejeição de inteiros inseguros em `int`/`number`, mascaramento de segredos no `print` e a correção do teste de `scan --json` em projeto vazio.
- **v1.4.0** — tipos `ipv4`, `semver` e `base64`, `check` da CLI compara as chaves do `.env` de verdade, `--version` da CLI, `example --write`, avisos UNUSED do `scan`, `check` sai com 1 em cada achado, `scanCode` ignora comentários/strings, valores padrão validados como valores fornecidos, `--help` após um subcomando, aspas escapadas no `parseEnvFile`, `port` aceita 0, documentação de workflow do GitHub Actions.
- **v1.3.0** — tipos `json`, `uuid` e `hex`, opções `minLength`/`maxLength` e `length` do `hex`, `trim: false`, inferência do tipo de retorno do `loadEnv`, geração mais segura de `.env.example` para chaves secretas, correção do JSON com `assign: true`.

## Contribuindo

Issues e pull requests são bem-vindos — inclusive os pequenos. Comece pelas issues com o rótulo [`good first issue`](https://github.com/abhi478jeetur-rgb/env-saaf/labels/good%20first%20issue) e leia o [CONTRIBUTING.md](CONTRIBUTING.md) primeiro: ele explica a regra de zero dependências e como executar os testes.

## Contribuidores

O env-saaf existe graças a todos que contribuíram com código, correções e ideias. **23 pessoas** além do mantenedor tiveram pull requests mesclados até agora:

- [@abdul-karim-mia](https://github.com/abdul-karim-mia) — o primeiro contribuidor externo
- `@HarshRajSinghania` — saída `--json` da CLI
- [@Golden007-prog](https://github.com/Golden007-prog)
- [@harshit3355](https://github.com/harshit3355)
- [@bfs2021](https://github.com/bfs2021)
- [@enidchen0125](https://github.com/enidchen0125)
- [@theroimasters1-dev](https://github.com/theroimasters1-dev)
- [@kamrullab](https://github.com/kamrullab)
- [@Veeramanikandanr48](https://github.com/Veeramanikandanr48)
- [@rise11hx-cmyk](https://github.com/rise11hx-cmyk)
- `@P1LOTRX` — valores padrão validados como valores fornecidos
- [@emreocell](https://github.com/emreocell)
- [@IG-ABHINAV](https://github.com/IG-ABHINAV)
- [@flipcyde101](https://github.com/flipcyde101)
- [@swpswpswp](https://github.com/swpswpswp)
- [@tnalbant](https://github.com/tnalbant)
- [@jamesyshd19-cmyk](https://github.com/jamesyshd19-cmyk) — o `init` usa o caminho de esquema personalizado
- [@abhinavrastogi2627](https://github.com/abhinavrastogi2627) — aliases ambíguos são rejeitados
- `DeviousCardi` — esquemas agrupados, modo watch da CLI, guia de migração e mais (nove PRs)
- [@ghosh-shrestha](https://github.com/ghosh-shrestha) — opções de regra desconhecidas são rejeitadas
- [@echuq](https://github.com/echuq) — números com prefixo de base e chaves inválidas de arquivo env são rejeitados
- [@sharkohark1234](https://github.com/sharkohark1234) — o `toJsonSchema` trata esquemas agrupados; `check --json-schema`
- [@saadBinMumtaz](https://github.com/saadBinMumtaz) — `init --from-example --groups`

Este mural cresce sozinho à medida que novos pull requests são mesclados:

<a href="https://github.com/abhi478jeetur-rgb/env-saaf/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=abhi478jeetur-rgb/env-saaf" alt="env-saaf contributors" />
</a>

Novos guias estão na [wiki do projeto](https://github.com/abhi478jeetur-rgb/env-saaf/wiki) — comece pelo guia da CLI e pela referência de tipos de lá.

## Licença

MIT © Abhijeet Kumar
