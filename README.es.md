# env-saaf

Validador de variables de entorno para Node.js, sin dependencias. Falla rápido al arrancar, con errores claros, y recibe valores **con tipos**.

[![npm version](https://img.shields.io/npm/v/env-saaf.svg)](https://www.npmjs.com/package/env-saaf) [![npm downloads](https://img.shields.io/npm/dm/env-saaf.svg)](https://www.npmjs.com/package/env-saaf) [![GitHub stars](https://img.shields.io/github/stars/abhi478jeetur-rgb/env-saaf.svg)](https://github.com/abhi478jeetur-rgb/env-saaf/stargazers) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/abhi478jeetur-rgb/env-saaf/blob/main/LICENSE)

**Lee esto en otros idiomas:** [English](README.md) · [Português](README.pt-BR.md) · [हिंदी](README.hi.md) · [简体中文](README.zh-CN.md)

## El problema

Al investigar los problemas reales que sufren los desarrolladores aparecen una y otra vez los mismos errores con `.env`:

- Todo valor de `process.env` es una **cadena**: `DEBUG=false` se evalúa como verdadero, y `"3000" + 1` se convierte en `"30001"`.
- Una variable que falta no falla al arrancar: falla **en producción**, en la primera petición que la necesita.
- `.env.example` solo dice lo que *debería* existir, no lo que tu código *realmente usa*: ambas cosas se van separando en silencio.
- Comprobar las variables una a una es tedioso, y el primer error oculta todos los demás.

Las soluciones existentes (zod, envalid) son potentes pero pesadas para proyectos pequeños. `env-saaf` (`saaf` = साफ़, limpio/claro) hace el trabajo esencial con **cero dependencias**.

## Instalación

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

`validateEnv` trata una cadena vacía (`''`) igual que una variable no definida: una clave opcional sin `default` se omite del resultado, una clave `required` falla como ausente (`missing required variable`), y una clave con `default` usa ese valor por defecto. Esto coincide con `${VAR:-fallback}` en [Cargar un archivo `.env` real](#loading-a-real-env-file), que también trata una expansión vacía como no definida. Solo `''` cuenta como no definida: una entrada de solo espacios, como `'   '`, se trata como proporcionada (recortada a `''` para `string` por defecto, o conservada tal cual con `trim: false`).

### Referencia de tipos

Las entradas del entorno son cadenas. La salida siguiente es anterior a un `transform` opcional.

| Tipo | Entrada aceptada | Salida en JavaScript | Opciones de regla adicionales |
| --- | --- | --- | --- |
| `string` | Cualquier texto presente (tipo por defecto) | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `number` | Texto decimal no vacío, con fracciones y notación exponencial. Rechaza prefijos de base (`0x`, `0b`, `0o`), `NaN` y valores no finitos. | `number` | `trim`, `min`, `max` |
| `int` | Literal entero en base 10: signo opcional y dígitos, p. ej. `42`, `-3`, `007`. Se rechazan las grafías decimales y científicas (`1.0`, `1e3`), así como los prefijos de base. | `number` | `trim`, `min`, `max` |
| `boolean` | `true/false`, `1/0`, `yes/no`, `on/off`, `y/n`, sin distinguir mayúsculas | `boolean` | Ninguna |
| `url` | URL absoluta aceptada por `new URL()`, sin normalización | `string` | `trim`, `minLength`, `maxLength`, `pattern`, `protocols` |
| `file` | Ruta a un archivo normal existente y legible. Las rutas relativas usan el directorio de trabajo del proceso. | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `port` | Literal entero en base 10 de 0 a 65535 (signo `+` opcional y dígitos, p. ej. `3000`, `+42`). Se rechazan las grafías decimales y científicas (`8080.0`, `1e3`), así como los prefijos de base. | `number` | `min`, `max` |
| `email` | Una `@`, parte local no vacía, dominio con un punto interior, sin punto inicial ni final en el dominio, sin espacios | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `json` | Texto JSON válido (objeto, arreglo o primitivo). Acepta valores por defecto ya analizados. | Valor JSON analizado | `trim`. Para resultados numéricos, `min` y `max`. |
| `uuid` | Grupos hexadecimales canónicos 8-4-4-4-12, en cualquier caso | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `hex` | Uno o más caracteres hexadecimales, sin prefijo `0x` | `string` | `trim`, `length`, `minLength`, `maxLength`, `pattern` |
| `ipv4` | Cuatro octetos decimales, cada uno de 0 a 255; sin ceros a la izquierda | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `ipv6` | Cualquier dirección que `net.isIP` reconozca como IPv6, incluidas formas comprimidas, mapeadas desde IPv4 y con `%zone` | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `semver` | `MAJOR.MINOR.PATCH`, sufijos opcionales de preversión y compilación, y un prefijo `v` minúscula opcional (`v1.2.3`). Se rechazan los ceros numéricos a la izquierda y la `V` mayúscula. | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `base64` | Alfabeto estándar o seguro para URL, con relleno opcional. | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `date` | `YYYY-MM-DD` válido, o fecha y hora con `T` y horas/minutos; segundos, fracción y `Z` o desplazamiento numérico opcionales. Acepta valores por defecto `Date` válidos. | `Date` | `trim`, `min`, `max` (cadenas de fecha ISO) |
| `duration` | Duración legible: `500ms`, `30s`, `15m`, `2h`, `1d`, `1w`, compuestos como `1h30m`; un número sin más son milisegundos | `number` (milisegundos) | `trim`, `min`, `max` (milisegundos o cadenas de duración, p. ej. `min: '30s'`) |
| `host` | Nombre de host (`db.internal`, `localhost`, `example.com.`) o dirección IPv4/IPv6; se conserva un punto raíz DNS final; sin esquema, ruta ni puerto | `string` | `trim`, `minLength`, `maxLength`, `pattern` |
| `array` | Lista delimitada dividida por `separator` (por defecto `,`) con cada elemento convertido según `of` (por defecto `string`). Los elementos vacíos se rechazan. Acepta valores por defecto de tipo arreglo. | Arreglo con tipos (`T[]`) | `of`, `separator`, `trim`, `protocols` (cuando `of: 'url'`), `minItems`, `maxItems`, `unique`, `skipEmpty` |

Todos los tipos admiten `required`, `requiredIf`, `conflictsWith`, `default`, `description`, `validate`, `transform`, `sensitive` y `aliases`. Con `sensitive: true`, el valor de la clave queda siempre enmascarado en los errores de validación y en la salida de la CLI, sea cual sea su nombre (p. ej. `SESSION_ID`, `LICENSE_KEY`), y su marcador queda vacío en `generateExample`. Con `aliases: ['OLD_NAME']` se aceptan nombres de variable obsoletos como alternativa y se emite una advertencia (véase más abajo). Las funciones `validate(value, env)` personalizadas se ejecutan después de la conversión y de las comprobaciones integradas (también sobre los valores por defecto), antes de `transform`. Las transformaciones se ejecutan sobre los valores proporcionados, después de la validación. Las claves opcionales ausentes se omiten y los valores por defecto se validan. La opción `choices` compara cadenas, números o booleanos ya convertidos. Un valor JSON analizado puede coincidir con una opción cuando es de uno de esos tres tipos. La entrada de texto se recorta por defecto. Con `trim: false` se conservan los espacios en los tipos de tipo texto. En `number` e `int`, los espacios alrededor de un valor numérico se aceptan en cualquier caso, pero un texto de solo espacios se rechaza por defecto y se convierte a `0` con `trim: false`. La comparación booleana siempre ignora los espacios circundantes. La opción `length` se aplica solo a `hex`. Las opciones `pattern`, `minLength` y `maxLength` se aplican solo a los tipos con valor de texto (`string`, `email`, `url`, `file`, `uuid`, `hex`, `ipv4`, `ipv6`, `semver`, `base64`, `host`) y se rechazan de entrada en cualquier otro tipo. Consulta las secciones siguientes para ver ejemplos.

### Requisitos condicionales (`requiredIf`)

Exige una variable solo cuando otra variable coincide con un valor concreto (`equals`) o con uno de varios valores (`in`):

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  SENTRY_DSN:    { type: 'url', requiredIf: { key: 'MODE', equals: 'production' } },
  ALERT_WEBHOOK: { type: 'url', requiredIf: { key: 'MODE', in: ['staging', 'production'] } },
  MODE:          { type: 'string', choices: ['development', 'staging', 'production'], default: 'development' },
});
```

`validateEnv` evalúa los esquemas en **dos pasadas**:

1. **Pasada 1:** convierte cada variable proporcionada, aplica los valores `default`, ejecuta todas las comprobaciones por clave (`min`/`max`, `minLength`/`maxLength`, `length`, `choices`, `pattern`, `transform`) y registra los errores incondicionales de `required: true`.
2. **Pasada 2:** evalúa cada regla `requiredIf` para las claves que estaban ausentes y no tenían `default`, comparando con los valores validados de la pasada 1 (con el objeto `env` sin procesar como respaldo si la clave referenciada no está declarada en el esquema).

Como la pasada 2 se ejecuta después de que termina la pasada 1, el orden de declaración de las claves en el esquema no importa (`SENTRY_DSN` puede declararse antes que `MODE`), y las condiciones comparan valores ya convertidos (como el `boolean` `true` o el `int` `3`), además de los valores `default`. Cuando la condición se cumple y la clave falta, `validateEnv` reporta el error habitual `<KEY>: missing required variable` (o lo recoge en `errors` con `{ throwOnError: false }`). Cuando la condición es falsa —o cuando la clave referenciada está ausente o no superó la validación de la pasada 1—, la clave sigue siendo opcional. Si la clave se proporciona de todos modos, se convierte y se valida como siempre. Dos combinaciones se rechazan de entrada como errores de esquema: `required: true` junto con `requiredIf` en la misma clave, y un `requiredIf` que nombre a su propia clave: ambas son contradictorias, así que el esquema falla en lugar de ignorar la condición en silencio.
### Modo sin excepciones: recoger los errores en lugar de lanzar

Una comprobación de salud, una CLI o un servidor que quiere arrancar en modo degradado no pueden usar una API que lanza ante el primer valor incorrecto. Pasa `{ throwOnError: false }` y `validateEnv` devolverá `{ env, errors }` en su lugar: `env` contiene cada valor que se validó, y `errors` es la misma lista que habría llevado `EnvSaafError`.

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

El comportamiento por defecto no cambia: sin la opción, o con `{ throwOnError: true }`, un valor no válido sigue lanzando un único `EnvSaafError` que enumera todos los problemas. Un esquema mal formado también sigue lanzando: eso es un error en el código, no en el entorno. `loadEnv` también sigue lanzando, porque con `{ assign: true }` escribe en `process.env` y una escritura aplicada a medias es peor que un arranque fallido; llama a `validateEnv` cuando quieras la lista de errores.

### Mensajes de error personalizados: `formatError`

`EnvSaafError.message` es una lista con viñetas fija. Para enviar los fallos a registros estructurados, una alerta de Slack o un banner de arranque, pasa un `formatError(errors, context)` opcional a `validateEnv` (o a `loadEnv`, que lo reenvía):

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

- `errors` es una copia de solo lectura de los mismos diagnósticos sin procesar que lleva `error.errors`. Son los mensajes existentes, así que pueden incluir ejemplos de entrada no sensibles (los valores de las claves con `sensitive: true` permanecen enmascarados, como antes). `context` va aparte y contiene solo `{ keys }`, los nombres de las claves del esquema; el objeto de entorno y las reglas del esquema nunca se pasan.
- La cadena que devuelvas se convierte en `error.message`. `error.errors` no cambia, y sin la opción el mensaje es idéntico, carácter a carácter, al de antes.
- Un gancho que lanza, o que devuelve algo que no sea una cadena, recurre al mensaje por defecto. Un `formatError` que no sea una función es un `TypeError`.
- Con `{ throwOnError: false }` no se lanza ningún error, así que el gancho no se llama y `errors` en el resultado se queda sin procesar. `loadEnv` siempre lanza, así que reenvía el gancho para los fallos de validación. Los fallos anteriores a la validación, como un archivo `.env` ilegible o imposible de analizar, lanzan sus propios errores y quedan fuera del alcance del gancho. Los errores de esquema mal formado tampoco se formatean.

En TypeScript, `{ throwOnError: false }` (no `formatError`) reduce el tipo de retorno a `ValidateResult<S>` (`{ env: EnvResult<S>; errors: string[] }`), de modo que `env.PORT` conserva el tipo inferido del esquema.

### Modo estricto: detecta erratas en los nombres de variable

Por defecto, `validateEnv` solo mira las claves del esquema. Con `{ strict: true }` también marca las variables que están definidas pero no están en el esquema, de modo que una errata como `DATABSE_URL` junto a la verdadera `DATABASE_URL` ya no pasa desapercibida:

```js
const env = validateEnv(schema, process.env, { strict: true });
// throws EnvSaafError listing e.g. "DATABSE_URL: set but not in schema (strict mode)"
```

Se nombra una coincidencia cercana: cuando falta una clave requerida y hay una clave definida pero no declarada con el mismo nombre sin distinguir mayúsculas o a una edición de distancia (un intercambio `PROT`/`PORT`), el mensaje termina con `(did you mean PROT? it is set but not in the schema)`. El aviso extra del modo estricto recibe la sugerencia correspondiente en el sentido inverso. Solo se sugieren nombres de clave; nunca se muestran los valores, ni siquiera en reglas `sensitive`.

Sigue desactivado por defecto: muchas aplicaciones comparten un mismo entorno con otras herramientas.

### Renombrar variables de forma segura con `aliases`

Renombrar una variable de entorno en toda una flota suele significar que los nombres viejo y nuevo conviven durante semanas. Declara los nombres viejos con `aliases` en la clave canónica:

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

- Cuando `DATABASE_URL` no está definida (o está vacía, `""`) y `DB_URL` sí lo está, el primer alias con valor aporta el valor bajo `env.DATABASE_URL`, pasa por la conversión, la validación y `transform` normales, y emite una advertencia de obsolescencia (`env-saaf: DB_URL is deprecated; use DATABASE_URL instead`).
- Cuando están definidas tanto `DATABASE_URL` como `DB_URL`, gana `DATABASE_URL` y una advertencia señala que el alias se ignora (`env-saaf: DB_URL is ignored because DATABASE_URL is set`).
- Las advertencias nunca hacen fallar la validación. Por defecto se registran con `console.warn`; pasa `onWarn: fn` a `validateEnv` o `loadEnv` para dirigirlas a tu propio registrador (o `() => {}` para silenciarlas).
- En el modo `{ strict: true }`, los alias declarados se reconocen y no se marcan como variables desconocidas.
- Un alias no puede ser igual a una clave declarada en el esquema (incluida su propia clave) ni compartirse entre reglas distintas. Estos errores de esquema lanzan `EnvSaafError` antes de leer los valores, incluso con `{ throwOnError: false }`. Repetir un alias dentro de una misma regla sí está permitido.

### Esquemas agrupados (anidados) con un prefijo de clave

Los esquemas que repiten un prefijo pueden agrupar las reglas bajo él:

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

- Un grupo es una regla con un objeto `schema` y sin `type`, más un `prefix` no vacío. Cada regla interna se lee de `prefix + INNER_NAME`, así que los errores siempre nombran la variable de entorno completa (`DB_HOST: missing required variable`).
- El resultado se anida bajo la clave del grupo: `{ DB: { HOST, PORT } }`. Si no hay ninguna clave interna presente, la clave del grupo se omite, igual que una clave plana opcional ausente.
- `strict`, `aliases`, `requiredIf` y `default` funcionan dentro de los grupos; dentro de un grupo, `aliases` y `requiredIf.key` usan **nombres completos de variable de entorno** (p. ej. `aliases: ['DATABASE_HOST']`, `requiredIf: { key: 'NODE_ENV', equals: 'production' }`, o el `'DB_HOST'` de otro grupo).
- `generateExample` sigue emitiendo nombres de entorno planos (`DB_HOST=...`) con un comentario `# group DB` sobre las claves del grupo.
- `loadEnv(..., { assign: true })` vuelve a escribir los nombres planos (`DB_HOST=...`), nunca un objeto anidado.
- Los grupos mal formados los rechaza de entrada `validateSchema` (ahora exportada): un `prefix` ausente o vacío, un `schema` que no sea un objeto o esté vacío, un `type` en el grupo, grupos anidados, opciones extra en el grupo, o un prefijo que choca con otra clave (p. ej. un `DB_HOST` declarado junto a un grupo `DB_`) lanzan un `EnvSaafError` que nombra el problema.
- En TypeScript, `EnvResult` también anida los grupos: `env.DB` es `{ HOST: string; PORT: number; ... } | undefined` (la clave del grupo es opcional; las claves internas conservan su propia opcionalidad según `required`/`default`). `EnvGroupRule` se exporta para tipar una regla de grupo independiente.
### `validate` por clave: reglas de validación personalizadas

Algunas reglas son propias de la aplicación: una ruta debe ser un directorio existente, o dos claves deben diferir. Pasa una función `validate(value, env)` en la clave en lugar de bifurcar la biblioteca:

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

`validate` se ejecuta después de la conversión de tipos y de las comprobaciones integradas (`min`/`max`, `minLength`/`maxLength`, `length`, `choices`, `pattern`), antes de `transform`, y también valida los valores `default`. Recibe el `value` convertido y el objeto `env` de entrada. Devuelve `true` (o `undefined`/`null`) para aprobar, `false` para un error genérico que nombra la clave, o un mensaje de error en forma de cadena no vacía para fallar. Un validador que lanza se recoge en `EnvSaafError` (o en `errors` con `{ throwOnError: false }`) como un fallo de validación que nombra la clave, en lugar de tumbar el proceso, y respeta el enmascaramiento de `sensitive: true`.

### `transform` por clave: un paso personalizado tras la conversión

Algunos valores necesitan un pequeño paso personalizado tras la conversión de tipos que env-saaf no puede adivinar: normalizar el caso, ajustar una unidad numérica o posprocesar un arreglo analizado:

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  ALLOWED_ORIGINS: { type: 'array', transform: xs => xs.map(s => s.toLowerCase()) },
  SHOUTY_NAME:     { type: 'string', transform: v => v.toUpperCase() },
});
// env.ALLOWED_ORIGINS is a lower-cased string[], env.SHOUTY_NAME is upper-cased
```

La transformación se ejecuta después de la conversión, de las comprobaciones integradas (`min`/`max`, `minLength`/`maxLength`, `length`, `choices`, `pattern`) y del `validate` personalizado; si lanza, el error se recoge como cualquier otro error de validación (con la clave nombrada). Su valor de retorno se verifica contra el `type` declarado en la regla (p. ej. `number`/`int`/`port`/`duration` deben seguir siendo un número finito/entero/puerto, `boolean` un booleano, `date` un `Date` válido, `array` un arreglo de elementos `of`, y `string` y las reglas de tipo texto una cadena válida): devolver el tipo equivocado produce un error de validación que nombra la clave y el tipo esperado. Solo se ejecuta sobre valores realmente proporcionados, no sobre los valores `default` (los valores por defecto igualmente se convierten y se validan como cualquier valor, así que un valor por defecto incorrecto falla con un error que nombra la clave). En TypeScript, el tipo del resultado para esa clave se infiere del tipo de retorno de la transformación.

### Tipo `email` y `pattern`: validar formatos

```js
const env = validateEnv({
  ADMIN_EMAIL: { type: 'email', required: true },
  SLUG:        { type: 'string', pattern: /^[a-z0-9-]+$/ },
  API_KEY:     { type: 'string', pattern: /^sk_[A-Za-z0-9]+$/ },
});
```

La comprobación de `email` es pragmática (una `@`, una parte local y un dominio no vacíos, y un punto en el dominio), no la RFC 5322 completa. `pattern` acepta un `RegExp` con el que debe coincidir un valor de texto (`string`, `email`, `url`, `file`, `uuid`, `hex`, `ipv4`, `ipv6`, `semver`, `base64`, `host`); se ejecuta después de la conversión y de la comprobación de `choices`, un error de no coincidencia nombra el patrón que falló, y usar `pattern` en un tipo que no es de texto se rechaza de entrada.

### Tipo `int` y `min`/`max`: números enteros y rangos

```js
const env = validateEnv({
  MAX_RETRIES: { type: 'int', min: 0, max: 5, default: 3 },
  TIMEOUT_MS:  { type: 'number', min: 100, max: 30000 },
});
```

`int` es como `number`, pero rechaza los valores fraccionarios (`3.5` falla; `42` y `1e3` pasan). `min` y `max` funcionan en `number`, `int` y `port`; cualquiera de los dos puede usarse solo, y un valor fuera de rango se rechaza con un error que nombra el rango permitido.

### Tipo `json` y `minLength`/`maxLength`: valores estructurados y longitudes de texto

```js
const env = validateEnv({
  FEATURE_FLAGS: { type: 'json', default: { beta: false } },
  API_TOKEN:     { type: 'string', minLength: 10, maxLength: 64, required: true },
});
```

`json` analiza el valor con `JSON.parse`: objetos, arreglos y primitivos vuelven ya analizados; un JSON no válido se rechaza con un error que nombra la clave. Un `default` puede darse como un objeto ya analizado. `minLength` y `maxLength` funcionan en los tipos con valor de texto (`string`, `email`, `url`, `file`, `uuid`, `hex`, `ipv4`, `ipv6`, `semver`, `base64`, `host`) y se rechazan de entrada en cualquier otro tipo; cualquiera de los dos puede usarse solo, y un valor demasiado corto o demasiado largo se rechaza con un error que nombra la longitud permitida. Se combinan con `pattern`: primero se comprueba la longitud y después el patrón.

### Tipos `uuid` y `hex`: identificadores y cadenas hexadecimales

```js
const env = validateEnv({
  TENANT_ID: { type: 'uuid', required: true },
  API_HASH:  { type: 'hex', length: 64 },
});
```

`uuid` acepta un UUID canónico (grupos hexadecimales `8-4-4-4-12`, en mayúsculas o minúsculas) y lo devuelve sin cambios; un valor mal formado se rechaza con un error que nombra la clave. `hex` acepta solo cadenas hexadecimales (`deadBEEF42` pasa, `0x1234` no); la opción opcional `length` fija el tamaño exacto en caracteres, para tokens y hashes de tamaño fijo.

### Tipos `ipv4`, `semver` y `base64`: direcciones de red, versiones y valores codificados

```js
const env = validateEnv({
  BIND_ADDR: { type: 'ipv4', required: true },
  APP_VERSION: { type: 'semver', required: true },
  WEBHOOK_SECRET: { type: 'base64', required: true },
});
```

`ipv4` acepta una dirección de cuatro octetos separados por puntos (`192.168.0.1` pasa; `256.1.1.1` y `1.2.3` no); un octeto con un cero a la izquierda (`01.2.3.4`) se rechaza porque es ambiguo. `semver` acepta `MAJOR.MINOR.PATCH` con sufijos opcionales de preversión y compilación (`1.2.3-beta.1` pasa) y un prefijo `v` minúscula opcional (`v1.2.3` pasa y se devuelve sin cambios: la forma que emiten `git describe` y las canalizaciones de publicación); `1.2`, `vv1.2.3` y la `V1.2.3` mayúscula no pasan. `base64` acepta el alfabeto estándar (`A-Za-z0-9+/`) o el alfabeto seguro para URL (`A-Za-z0-9-_`). El relleno puede omitirse. Cuando está presente, debe ser completo y aparecer al final. Los tres devuelven el valor sin cambios, y `minLength`/`maxLength` funcionan en ellos como en cualquier otro tipo de texto.

### Tipo `date`: fechas ISO 8601 como objetos `Date`

```js
const env = validateEnv({
  LAUNCH_DATE: { type: 'date', required: true },
  CUTOFF:      { type: 'date' },
}, process.env);

if (env.LAUNCH_DATE < new Date()) console.log('Launched!');
```

`date` analiza una fecha ISO 8601 (`2026-01-31`) o una fecha y hora (`2026-01-31T10:00:00Z`, con segundos opcionales, segundos fraccionarios y un desplazamiento `Z` o `±HH:MM`) y devuelve un `Date` de JavaScript, de modo que las fechas límite, de lanzamiento y de caducidad no necesitan análisis manual. Las fechas imposibles se rechazan con un error que nombra la clave: `2026-02-31` falla en lugar de pasar en silencio a marzo, y lo mismo ocurre con valores mal formados como `31-01-2026` o `2026/01/31`. Un `Date` dado como `default` pasa sin cambios, y `generateExample` sugiere `2026-01-31` para el tipo.

### Tipo `duration`: tiempos legibles como milisegundos

```js
const env = validateEnv({
  CACHE_TTL: { type: 'duration', required: true },
  TIMEOUT:   { type: 'duration', default: '30s' },
}, process.env);

setTimeout(refresh, env.CACHE_TTL); // 900000 for '15m'
```

`duration` analiza una duración legible (`500ms`, `30s`, `15m`, `2h`, `1d`, `1w`) y la convierte en un número de milisegundos; los valores compuestos suman sus partes, así que `1h30m` son 5,400,000 ms y `2d12h` son 216,000,000 ms (cada parte necesita una unidad: `1h30` se rechaza); un número sin más ya son milisegundos, así que `'250'` y `250` significan ambos 250 ms. Las unidades no distinguen mayúsculas y se permiten decimales (`1.5h` son 5,400,000 ms); `w` es una semana de 7 días, así que `1w` son 604,800,000 ms. Las unidades desconocidas (`15min`, `15sec`), los negativos y los valores mal formados se rechazan con un error que nombra la clave. Un número dado como `default` se toma como milisegundos, y `min`/`max` funcionan sobre el resultado en milisegundos como sobre cualquier otro número. `generateExample` sugiere `15m` para el tipo.

### Tipo `host`: un nombre de host o una dirección IP, sin esquema ni puerto

```js
const env = validateEnv({
  DB_HOST: { type: 'host', required: true },
  BIND_ADDR: { type: 'host', default: 'localhost' },
}, process.env);
```

`host` acepta un nombre de host (`db.internal`, `localhost`) o una dirección IPv4/IPv6 (`10.0.0.5`, `::1`) y lo devuelve sin cambios. Un valor con esquema (`https://db.internal`), ruta (`db/x`) o puerto (`example.com:8080`) se rechaza con un error que nombra la clave: eso corresponde al tipo `url` o a una variable de puerto aparte. `minLength`/`maxLength` y `pattern` funcionan en él como en cualquier otro tipo de texto, y `generateExample` sugiere `localhost` para el tipo.

### Tipo `url` y `protocols`: esquemas permitidos

```js
const env = validateEnv({
  WEBHOOK_URL: { type: 'url', protocols: ['https'], required: true },
});
```

`url` valida con `new URL()` y devuelve el valor exactamente como se dio (sin normalización: un origen sin más no gana una barra final). `protocols` establece la lista de esquemas que un valor puede usar (`['https']` rechaza `ftp://...` y `javascript:...` con un error que nombra los esquemas permitidos); la comparación no distingue mayúsculas, y las entradas pueden escribirse con o sin dos puntos finales (`'https'` y `'https:'` significan lo mismo). Sin la opción, cualquier URL válida pasa, como antes.

### Tipo `array`: dividir una cadena delimitada en un arreglo con tipos

```js
const env = validateEnv({
  ALLOWED_ORIGINS: { type: 'array', of: 'url', protocols: ['https'], required: true },
  PORTS:           { type: 'array', of: 'port', separator: ';', default: [80, 443] },
  ADMIN_EMAILS:    { type: 'array', of: 'email' },
});
```

`array` divide una cadena delimitada por `separator` (por defecto `','`), recorta cada elemento por defecto (`trim: false` conserva los espacios circundantes) y convierte cada elemento con `of` (por defecto `'string'`; se admite cualquier tipo escalar integrado, y un `'array'` anidado se rechaza de entrada). Los elementos vacíos (como `a,,b` o una coma final `a,b,`) se rechazan en lugar de descartarse en silencio, y cualquier elemento no válido reporta su índice (empezando en 0) y el valor problemático (`PORTS[1]: expected a port (0-65535, e.g. 3000), got "abc"`, enmascarado cuando `sensitive: true`). `minItems` y `maxItems` limitan el número de elementos (ambos enteros no negativos, y `minItems` no debe superar a `maxItems`); una infracción reporta la clave con el conteo y el límite (`TAGS: expected at least 2 items, got 1`), y los límites también se aplican a los valores `default`. Los valores mal formados y el uso en una regla que no sea `array` se rechazan de entrada. Un arreglo ya analizado puede pasarse como `default` (incluido `[]`), y `generateExample` sugiere tres elementos de ejemplo del tipo `of` unidos por `separator` —`a,b,c` para el `string` por defecto, pero `1,2,3` para `int`, `3000,8080,5432` para `port`, y así sucesivamente—, de modo que el valor generado valida por sí mismo contra la regla; el comentario sobre cada clave de arreglo nombra el tipo de los elementos (`# type: array, items: int`). En TypeScript, el tipo de los elementos se infiere de `of`.

### `trim: false`: conservar los espacios cuando importan

Por defecto, los valores se recortan antes de la validación: útil para secretos pegados desde paneles con espacios de más. Cuando el espacio *es* el valor, desactiva el recorte para esa clave:

```js
const env = validateEnv({
  TOKEN: { type: 'string', trim: false, required: true },
});
// TOKEN: '  secret  ' stays '  secret  '
```

`trim: false` solo afecta a los tipos de tipo texto; los números y los booleanos no se ven afectados (`' 42 '` sigue analizándose como `42`, `' true '` sigue analizándose como `true`).

### Cargar un archivo `.env` real

Una sola llamada lo hace: leer el archivo, analizarlo, validarlo:

```js
const { loadEnv } = require('env-saaf');

const env = loadEnv({
  PORT:    { type: 'port', required: true },
  API_URL: { type: 'url', required: true },
}); // reads `.env` by default
```

Opciones: `{ path: '.env.local' }` para leer otro archivo, `{ override: true }` para que el archivo gane a `process.env` (por defecto ganan los valores existentes de `process.env`), `{ assign: true }` para volver a escribir los valores validados en `process.env` como cadenas. Una `path` pasada explícitamente que no existe lanza un error que nombra la ruta: un archivo con una errata no debe arrancar en silencio. Sin una opción `path`, el `.env` predeterminado implícito puede no existir (en ese caso, cada variable necesita un valor por defecto o ser opcional), y las entradas ausentes de una lista de archivos (`paths: [...]` o `path` como arreglo) se omiten; una lista solo lanza cuando no se encuentra ningún archivo y falta una variable requerida. Por defecto, `process.env` nunca se modifica.

Varios archivos pueden superponerse: los archivos posteriores tienen prioridad sobre los anteriores:

```js
const env = loadEnv(schema, { paths: ['.env', '.env.local'] });
// or: { path: ['.env', '.env.local'] }
```

Los valores pueden referenciar otros valores con `${VAR}`: útil para construir URL a partir de partes. Las referencias se resuelven primero desde el mismo archivo y después desde `process.env`; los valores entre comillas simples y los escapes `\${VAR}` se quedan literales:

```env
HOST=example.com
API_URL=https://${HOST}/api
```

Usa `${VAR:-fallback}` para proporcionar un valor alternativo cuando un valor no está definido o se expande a una cadena vacía. Usa `${VAR-fallback}` para proporcionarlo solo cuando el nombre no está definido. Por ejemplo, `API_URL=https://${HOST:-localhost}/api` usa `localhost` cuando `HOST` no tiene valor. Los valores por defecto pueden incluir referencias como `${HOST:-${DEFAULT_HOST}}`.

Los valores entre comillas también pueden abarcar varias líneas (claves PEM, bloques JSON): el análisis continúa hasta la comilla de cierre. Una comilla escapada con barra invertida (`\'` dentro de comillas simples, `\"` dentro de comillas dobles) se queda como parte del valor, así que `B='it\'s'` es `it's`; las demás barras invertidas, como las de una ruta de Windows, se conservan tal cual.

Una línea sin más y sin `=`, o una asignación con una clave no válida (como `MY KEY`), produce un error de sintaxis con su número de línea, sin repetir el valor. Las claves de asignación deben coincidir con `[A-Za-z_][A-Za-z0-9_.-]*`: se admiten puntos y guiones después del primer carácter (como en `app.name` y `MY-KEY`), pero no espacios dentro de la clave. Usa `KEY=` para un valor vacío.

En código asíncrono, usa `loadEnvAsync` para leer archivos sin bloquear en la E/S del sistema de archivos.

```js
const { loadEnvAsync } = require('env-saaf');

async function readConfig() {
  return await loadEnvAsync(
    { PORT: { type: 'port', default: 3000 } },
    { paths: ['.env', '.env.local'] }
  );
}
```

Acepta las mismas opciones que `loadEnv`, incluida la precedencia de archivos, `override` y `assign`. La promesa se resuelve con los valores validados y se rechaza con los mismos errores que lanza `loadEnv`.

La forma manual también sigue funcionando: analiza el archivo y pásalo:

```js
const fs = require('node:fs');
const { parseEnvFile, validateEnv } = require('env-saaf');

const fileEnv = parseEnvFile(fs.readFileSync('.env', 'utf8'));
const env = validateEnv({
  PORT:    { type: 'port', required: true },
  API_URL: { type: 'url', required: true },
}, fileEnv);
```

Los módulos ES también funcionan:

```js
import { validateEnv } from 'env-saaf';
```

### TypeScript: el tipo de retorno se infiere del esquema

El tipo de retorno de `validateEnv` se infiere del esquema: una clave con `type: 'port'` se convierte en `number`, una clave `boolean` se convierte en `boolean`, y una clave sin `required` ni `default` es `| undefined`:

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

Pasa el esquema en línea a `validateEnv(...)` (o usa `as const`) para que TypeScript pueda ver los tipos literales. Los tipos `EnvResult<S>` y `EnvValue<R>` también se exportan por separado.

## Recetas

Estos patrones cortos usan solo opciones de `validateEnv` disponibles en la API actual.

### URL de base de datos y tamaño del grupo de conexiones

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  DATABASE_URL: { type: 'url', required: true },
  DB_POOL_SIZE: { type: 'number', default: 10 },
});
// env.DATABASE_URL is present; env.DB_POOL_SIZE is a number.
```

`url` valida la sintaxis de la URL, mientras que `number` convierte el tamaño del grupo desde su cadena de entorno.

### Banderas de funcionalidad

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  ENABLE_EXPORTS: { type: 'boolean', default: false },
  ENABLE_PREVIEW: { type: 'boolean', default: false },
});

if (env.ENABLE_EXPORTS) console.log('Exports are enabled');
```

El tipo booleano acepta `true`/`false`, `yes`/`no`, `on`/`off` y `1`/`0` (también `y`/`n`),
sin distinguir mayúsculas.

### Clave de analíticas opcional

```js
const { validateEnv } = require('env-saaf');

const env = validateEnv({
  ANALYTICS_WRITE_KEY: { type: 'string' },
});

if (env.ANALYTICS_WRITE_KEY !== undefined) {
  console.log('Analytics is configured'); // Use the key with your analytics client; do not log it.
}
```

Sin `required` ni `default`, una clave ausente se omite del resultado y tiene el tipo de TypeScript
`string | undefined`.

### Requisitos distintos en desarrollo y producción

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

Valida primero el modo, y después elige un esquema ordinario en el código de la aplicación cuando necesites valores
`default` o tipos distintos según el entorno. Para hacer que una clave sea requerida solo en un modo concreto, usa
`requiredIf` en un único esquema.

### Fastify

Valida la configuración al arrancar **antes** de registrar complementos o llamar a `fastify.listen(...)`, y después adjunta el objeto de configuración con tipos e inmutable a la instancia de Fastify con `fastify.decorate('config', config)`. Ejecutar la validación antes de `register` y `listen` garantiza que el proceso falle rápido, antes de que los complementos abran grupos de conexiones a la base de datos o el servidor ocupe un puerto, y decorar la instancia da a las rutas y los complementos acceso con tipos mediante `fastify.config`, sin volver a leer `process.env`:

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

Para el desarrollo local con un archivo `.env`, sustituye `validateEnv(schema)` por `loadEnv(schema)` (o `loadEnv(schema, { paths: ['.env', '.env.local'] })`) en el mismo bloque de arranque.

### Next.js

Coloca tu esquema de solo servidor en un módulo compartido (como `lib/env.ts`) e impórtalo desde el gancho `register()` de `instrumentation.ts` de Next.js, que se ejecuta **una vez cuando arranca el servidor de Node.js**, antes de atender peticiones, Route Handlers o Server Components. Protégelo con `process.env.NEXT_RUNTIME === 'nodejs'` si tu aplicación también usa el runtime Edge, ya que `env-saaf` usa módulos integrados de Node (`node:fs`, `node:net`, `node:path`). También puedes importar el mismo módulo de validación al principio de `next.config.mjs` si quieres que `next build` falle rápido cuando falte configuración de compilación.

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

Next.js carga los archivos `.env`, `.env.local` y los `.env.*` específicos de cada entorno en `process.env` automáticamente antes de que se ejecute `instrumentation.ts`, así que `validateEnv` los lee directamente sin llamar a `loadEnv`.

**Las variables `NEXT_PUBLIC_` quedan fuera del ámbito de los secretos:** Next.js incrusta cada variable `NEXT_PUBLIC_*` en el paquete del navegador en tiempo de compilación. Nunca guardes secretos (claves de API, URL de bases de datos, secretos de firma) en variables `NEXT_PUBLIC_*`: guarda los secretos en variables de solo servidor sin prefijo, validadas en módulos de solo servidor como `lib/env.ts`. Si también quieres validar ajustes públicos del cliente (como `NEXT_PUBLIC_SITE_URL`), pasa un objeto explícito (`validateEnv({ NEXT_PUBLIC_SITE_URL: { type: 'url', required: true } }, { NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL })`), porque Next.js sustituye estáticamente las referencias literales a `process.env.NEXT_PUBLIC_*` en los paquetes del cliente en lugar de exponer un objeto `process.env` completo.

### Mantén honesto `.env.example` (CLI)

La salida de la CLI es texto plano por defecto, también en tuberías y en CI. Para los scripts que establecen una preferencia de color compartida, pasa `--no-color` antes o después del comando, o define `NO_COLOR=1`.

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

¿Empiezas un proyecto nuevo? `env-saaf init` escribe un `env.schema.js` inicial con ejemplos comentados de los tipos principales (`string`, `int`, `boolean`, `port`, `url`, `email`, `duration`, `host`) y genera un `.env.example` a juego. Cada marcador sugerido es un valor que valida contra su propia regla, así que un `.env.example` generado pasa `check` desde el primer momento (el tipo `file` es la excepción: su ruta `./config.json` debe existir antes). En un proyecto cuyo `package.json` tenga `"type": "module"`, el archivo inicial se escribe como `env.schema.cjs`, para que siga cargándose con `require()`: nombra también tu propio esquema con la extensión `.cjs` en ese caso. El primer `check` después de `init` pasa con una nota hasta que el código lea las variables: las claves que el andamiaje declara pero que ningún código usa todavía no se tratan como desviación. En cuanto el código lee al menos una variable, las claves sin usar vuelven a hacer fallar la comprobación, como antes. Que cualquiera de los dos archivos esté presente es motivo de rechazo (salida 1, nombrando los archivos), salvo que se pase `--force`; `--schema <file>` nombra el archivo de esquema en lugar de `env.schema.js`.

¿Ya tienes un `.env.example` y ningún esquema? `env-saaf init --from-example` (opcionalmente `--from-example=FILE` para otro nombre) analiza el archivo de ejemplo e infiere una regla inicial por clave a partir de su valor de muestra, en este orden de prioridad: un UUID -> `uuid`, un JWT válido (tres segmentos base64url con cabecera y contenido JSON) -> `jwt`, una fecha o fecha y hora ISO -> `date`, una duración como `30m` o `1h30m` -> `duration`, una versión semántica como `1.4.2` -> `semver`, un objeto o arreglo que analice como JSON -> `json`, una cadena hexadecimal de longitud par de al menos ocho caracteres -> `hex`, un número con aspecto de puerto (un entero entre 1024 y 65535) -> `port`, cualquier otro entero -> `int`, `true`/`false` -> `boolean`, una URL `http(s)` -> `url`, una dirección de correo -> `email`, un decimal -> `number`, cualquier otra cosa (incluidos los valores vacíos y las cadenas ambiguas como `cafe`) -> `string`. Cada candidato se confirma con el validador real, de modo que una regla inferida siempre acepta la muestra de la que proviene. Cada regla inferida se escribe con un comentario que dice que fue inferida y que debe revisarse: los valores de muestra en sí no se copian en el esquema, así que una contraseña del ejemplo no puede filtrarse al archivo confirmado. Las claves que el escaneo de código encuentra y que el ejemplo no enumera se incorporan como reglas `string`, igual que con el andamiaje fijo. El archivo de ejemplo nunca se escribe ni se sobrescribe en este modo: solo el archivo de esquema, que sigue negándose a sobrescribirse sin `--force`. El esquema generado valida contra los valores de muestra del propio ejemplo, así que `env-saaf check . --file .env.example --schema env.schema.js` pasa justo después. Pasa `--groups` (`env-saaf init --from-example --groups`) para plegar las claves que comparten un prefijo común en un esquema agrupado (p. ej. `DB_HOST` y `DB_PORT` se convierten en un grupo `DB` con `prefix: 'DB_'`) cuando el prefijo tiene al menos dos caracteres y al menos dos claves lo comparten.

Cuando `.env.example` (o el archivo dado con `--file`) está en el directorio escaneado, `scan` también advierte sobre las claves declaradas ahí que ningún código lee, una por línea en stderr: `UNUSED: OLD_KEY (in .env.example, never used in code)`. Con `--json` aparecen en un arreglo `unused` junto a `vars`. Es solo una advertencia: stdout sigue conteniendo solo las variables usadas, y `scan` sigue saliendo con 0 (usa `check` para hacer fallar un trabajo de CI por desviación). Sin un archivo de plantilla, nada cambia.

Al escanear un directorio, `scanDir` omite `node_modules`, `.git*` y salidas de compilación habituales (`dist`, `build`, `coverage`, `.next`, `out`, `target`), de modo que un paquete antiguo no haga que una clave sin usar parezca en uso; en la CLI, tanto `scan` como `check` aceptan `--exclude <pattern>` (repetible) para dejar fuera directorios o patrones glob como `fixtures` o `'src/generated/**'`. Un escaneo lee código, no comentarios ni el texto dentro de literales de cadena y de plantilla: una variable nombrada solo en un comentario (`// set process.env.FOO first`), una cadena (`'see process.env.BAR'`) o el texto de una plantilla no se reporta, así que no puede satisfacer `check` en silencio ni acabar en un borrador de `example`. Una lectura dentro del `${...}` de una plantilla sí es una lectura, y también lo son `process.env['X']`, ``process.env[`X`]`` y la desestructuración. El encadenamiento opcional también es una lectura: `process.env?.MAYBE` e `import.meta.env?.VITE_MAYBE` se reportan igual que la forma con punto (y también `process.env?.['X']` y ``process.env?.[`X`]``). Las lecturas de `import.meta.env` de Vite se encuentran de la misma manera (acceso con punto, acceso con corchetes y desestructuración), así que los proyectos de Vite también se escanean correctamente.

Cuando hay un `.env` real junto a la plantilla, `check` también compara sus claves: una clave en `.env` que no está documentada (`EXTRA in .env: FOO (not in .env.example)`) suele ser una errata, y una clave de la plantilla sin valor local se reporta como `MISSING in .env: BAR (in .env.example, not set locally)`. `--file` selecciona la plantilla para ambas comparaciones; sin un archivo `.env`, esta comprobación extra se omite. En el modo `--json`, los hallazgos aparecen como `envExtra` y `envMissing` junto a los campos existentes `missing`, `extra`, `unused` e `invalid`: `unused` enumera las claves documentadas pero sin usar con el mismo nombre que usa `scan --json`, y `extra` conserva la lista idéntica por compatibilidad.

El escáner encuentra el acceso con punto y las claves estáticas con corchetes a través de alias locales simples declarados con `const`, `let` o `var`, como `const env = process.env; env.PORT`. Esto también funciona con `import.meta.env`. El escáner de texto sigue las lecturas posteriores a la declaración. La reasignación, el sombreado, las cadenas de alias y la desestructuración a través de un alias quedan fuera de su alcance.

`check` sale con 1 siempre que imprime algún hallazgo, y el `ok` de `--json` lleva el mismo valor, así que un trabajo de CI falla exactamente cuando la salida reporta un problema; un proyecto completamente limpio sale con 0. `UNUSED` también cuenta como hallazgo: una clave que queda en la plantilla después de que desaparece su uso en el código hace fallar la ejecución, así que elimínala de la plantilla cuando elimines el último uso. La única excepción es un proyecto sin ningún uso de `process.env` —un andamiaje recién creado, por ejemplo—: entonces `check` pasa con una única nota (un campo `note` en `--json`) en lugar de una línea `UNUSED` por clave, porque todavía no hay código del que la plantilla pueda desviarse.

`env-saaf print` carga y valida el archivo de entorno (`.env` por defecto, o `--file`) contra el esquema e imprime la configuración efectiva (valores convertidos y valores por defecto) con todas las reglas `sensitive: true` y las claves con nombre de secreto enmascaradas, tanto en texto como en `--json`; `--json` imprime el mismo objeto. `--reveal` muestra los valores reales, solo para depuración local — nunca lo uses en registros de CI. Un fallo de validación usa los mismos mensajes y salida 1 que `check --schema`, así que también sirve como comprobación previa. Requiere `--schema`.

`--schema` es opcional: sin él, `check` solo compara la presencia de claves. Con él, `check` carga el archivo de esquema (`module.exports = { PORT: { type: 'port', required: true } }`, resuelto en relación con el directorio comprobado) y ejecuta el mismo `validateEnv` que usa la biblioteca sobre los valores del archivo `.env` real. Un error de tipo se reporta como `INVALID: PORT: expected a port (0-65535, e.g. 3000), got "not-a-port"` y hace fallar la comprobación (salida 1); en el modo `--json`, los fallos aparecen en el campo `invalid`. Para elegir qué archivo de valores validar, `--values <file>` tiene prioridad (por ejemplo `.env.production` o `.env.staging`) mientras mantiene `.env.example` (o `--file`) como plantilla, y un archivo inexistente es un error de uso; sin `--values`, un `--file` explícito selecciona la plantilla y también sirve como archivo cuyos valores se validan; sin un `.env` ni `--values` ni un `--file` explícito, el paso de validación de valores se omite porque los marcadores de la plantilla no son valores reales. Con `--schema`, `check` también concilia el esquema con el archivo de ejemplo: una clave declarada en el esquema pero ausente de `.env.example` se reporta como `NOT DOCUMENTED`, y una clave del ejemplo que el esquema no declara se reporta como `NOT IN SCHEMA` (los esquemas agrupados comparan por nombres planos como `DB_HOST`). Ambos casos hacen fallar la comprobación y aparecen en `--json` como `schemaNotDocumented` y `documentedNotInSchema`. Un archivo de esquema que no puede cargarse (o que no exporta un objeto de esquema) es un error de uso: un mensaje claro y salida 2. Con `--json-schema`, `check` imprime el archivo `--schema` como un documento JSON Schema (borrador 2020-12) en stdout en lugar de ejecutar la comprobación, para que los editores y los validadores de CI puedan consumirlo directamente; el `.env.example` nunca se lee, así que un esquema se convierte incluso antes de que exista un archivo de ejemplo. Sin `--schema` no hay nada que convertir, así que la opción es un error de uso (salida 2).

### Ejecutar `check` en GitHub Actions

Un flujo de trabajo mínimo que hace fallar un pull request cuando el código y `.env.example` se separan. Cópialo en `.github/workflows/env-check.yml`:

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

Los secretos reales vienen de los secretos de Actions del repositorio (Settings, Secrets and variables, Actions), nunca del repositorio: confirma solo `.env.example` y mantén `.env` en `.gitignore`. El `.env` anterior solo existe dentro de la copia temporal del trabajo. `check` compara solo nombres de claves y nunca imprime valores, así que un secreto no acaba en el registro. Sin un `.env`, el trabajo sigue comparando el código y `.env.example`; con uno, también reporta las claves `EXTRA in .env` / `MISSING in .env` (disponible desde 1.4.0; con 1.3.0, `check` compara solo el código y `.env.example`). Cualquier hallazgo sale con 1 y hace fallar el trabajo.

Dos límites del paso opcional de `.env`: una clave solo está *ausente* cuando no está, así que un secreto que no está definido igualmente escribe `API_KEY=` con un valor vacío y pasa la comprobación de claves (`check` no es una comprobación de valores; usa `validateEnv` al arrancar para eso). Y `printf` escribe cada secreto tal cual, así que mantén cada secreto en una sola línea; un secreto de varias líneas se leería como entradas `NAME=value` extra.

### Generar `.env.example` desde un esquema

El esquema ya conoce cada clave: genera el archivo de ejemplo desde él en lugar de escribirlo a mano:

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

Las claves que parecen secretos (`API_KEY`, `DB_PASSWORD`, …) reciben un marcador vacío: no hay nada seguro que sugerir para ellas. Otras claves reciben un marcador según el tipo, y un `default` explícito se usa tal cual. Las claves con `aliases` anotan los nombres alternativos obsoletos (`# type: url, required; also accepts DATABASE_URL (deprecated)`), y las claves con `requiredIf` anotan la condición (`# type: url; required when MODE is 'production'`, o `required when MODE is one of 'staging', 'production'` para la forma con `in`).

### Exportar JSON Schema desde tu esquema

`toJsonSchema(schema)` devuelve un [JSON Schema del borrador 2020-12](https://json-schema.org/draft/2020-12)
para documentación, herramientas de edición o validación de **valores convertidos**, no de cadenas `.env` sin procesar.
No lee variables de entorno ni ejecuta devoluciones de llamada personalizadas.
Los esquemas agrupados se anidan como esquemas de objeto, con las reglas internas como `properties`
y sus claves requeridas en la propia lista `required` del grupo.

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

Los límites numéricos, de longitud y de elementos se convierten en palabras clave de JSON Schema. Los arreglos describen
sus elementos convertidos, las duraciones son milisegundos y las fechas se serializan como cadenas ISO
de fecha y hora (el esquema también acepta el formato `date`). El tipo `json`
permite cualquier forma JSON. Las `choices` compatibles con JSON se convierten en valores `enum` sin
volver a convertirlas. Los valores por defecto representables se exportan en forma convertida como anotaciones;
JSON Schema no rellena los valores ausentes. Evita poner secretos en los valores por defecto del esquema
o en las opciones que se vayan a compartir.

**No representado:** `transform`, `validate`, `requiredIf`, `aliases`, `sensitive`,
el recorte y la división de la entrada, las banderas de expresiones regulares (los patrones con banderas se omiten),
y los valores por defecto que no pueden convertirse a JSON sin pérdida o que dependen de la hora local.
La existencia de archivos y las comprobaciones detalladas de `base64` y `semver` siguen siendo solo de tiempo de ejecución.
Los formatos estándar son anotaciones por defecto, y sus reglas pueden diferir de
las comprobaciones de env-saaf. JSON Schema cuenta caracteres Unicode para las longitudes de cadena;
env-saaf cuenta unidades de código UTF-16 de JavaScript. Usa `validateEnv` o `loadEnv`
para la validación en tiempo de ejecución.

### Registrar la configuración sin filtrar secretos

```js
const { maskSecrets } = require('env-saaf');
console.log(maskSecrets(process.env)); // values masked: sk***56
```

Un valor vacío se queda vacío: `maskValue('')` devuelve `''`, así que un secreto no definido ya no parece definido en los registros.

`maskSecrets` también es recursivo: los objetos planos anidados y los arreglos conservan su forma, y cada hoja escalar se enmascara con las mismas reglas de `maskValue`, de modo que una configuración analizada se registra de forma segura (`maskSecrets({ DB: { PASSWORD: 'hunter2' }, TAGS: ['a', 'b'] })` → `{ DB: { PASSWORD: 'hu***r2' }, TAGS: ['****', '****'] }`). Los valores que no son planos (`Date`, instancias de clases) se tratan como hojas, una referencia repetida como un ciclo se sustituye por el marcador fijo `'[Circular]'` en lugar de colgarse, y el objeto de entrada nunca se modifica. En TypeScript, el tipo de retorno refleja la forma de la entrada de manera recursiva (`Masked<T>`), con cada hoja tipada como `string`.

## Cómo se compara env-saaf con envalid, joi y zod

| | `env-saaf` | `envalid` | `joi` | `zod` |
| --- | --- | --- | --- | --- |
| **Alcance** | Solo variables de entorno (mapas planos de clave-valor) | Solo variables de entorno | Validación de esquemas de propósito general (peticiones, cargas útiles, configuración) | Validación de esquemas de propósito general (peticiones, formularios, configuración) |
| **Dependencias en tiempo de ejecución** | Cero | Cero | Varios paquetes `@hapi/*` | Cero |
| **Carga de `.env` y herramientas CLI** | Analizador de `.env` integrado (`loadEnv`/`parseEnvFile`), CLI `scan`/`check`/`example`/`init`, enmascaramiento de secretos | Solo validación (combínalo con `--env-file` de Node o `dotenv`) | Solo validación (combínalo con `--env-file` de Node o `dotenv`) | Solo validación (combínalo con `--env-file` de Node o `dotenv`) |
| **Agregación de errores** | Recoge todos los errores en una pasada (`EnvSaafError`, o `{ env, errors }` con `throwOnError: false`) | Recoge todos los errores en una pasada (pasados al `reporter` por defecto o a uno personalizado) | Se detiene en el primer error por defecto; pasa `{ abortEarly: false }` para recogerlos todos | Recoge todos los problemas en una pasada (`ZodError` mediante `parse`, o `{ success, error }` mediante `safeParse`) |
| **Inferencia de TypeScript** | Incluye `index.d.ts`; infiere tipos de objeto planos a partir de esquemas en línea / `as const` (`json` se infiere como `unknown`, `choices` se queda ampliado) | Escrito en TypeScript; infiere los tipos de retorno de los validadores, incluidas uniones literales para `choices` | Incluye tipos, pero no infiere tipos estáticos de TS a partir de los esquemas (define las interfaces aparte o usa generación de código) | Inferencia estática ante todo en TypeScript (`z.infer<typeof schema>`) a través de objetos anidados, uniones, literales y transformaciones |

Sin embargo, una comparación no es una ruta de migración: consulta [Migrar a env-saaf](#migrating-to-env-saaf) más abajo para ver los pasos concretos de antes/después desde `dotenv`, `dotenv-safe` y `envalid`.

### Cuándo encaja bien `env-saaf`

- Quieres validación de entorno al arrancar, carga de archivos `.env` (con capas e interpolación `${VAR}`), enmascaramiento de secretos y una CLI de CI (`env-saaf check`) para mantener `.env.example` sincronizado con el código, todo en un único paquete de Node.js sin dependencias.

### Cuándo encaja mejor otra biblioteca

- **Validar peticiones HTTP, cargas útiles de API, formularios o JSON anidado:** `env-saaf` solo valida mapas planos de variables de entorno y no tiene esquemas de objetos anidados ni reglas condicionales entre campos. Usa **zod** (sobre todo en TypeScript) o **joi** cuando necesites validación de datos general.
- **Ya usas `zod` o `joi` en el proyecto:** si ya dependes de una de ellas para la validación de peticiones/datos y no necesitas el analizador de `.env` ni la CLI `scan`/`check` de `env-saaf`, validar `process.env` con tu biblioteca actual evita añadir otra herramienta.
- **Inferencia de TypeScript más rica o runtimes que no son Node:** usa **zod** para una inferencia de tipos estática completa (formas anidadas, uniones discriminadas, enumeraciones literales reducidas) o compatibilidad con runtimes de navegador/perímetro (`env-saaf` usa los integrados de Node `node:fs`, `node:net` y `node:path`). Usa **envalid** si quieres validación solo de entorno con `devDefault`, acceso al entorno protegido por proxy, o inferencia de uniones literales a partir de `choices`.

## Migrar a env-saaf

Tres caminos cortos, cada uno con un fragmento completo al final que funciona contra la API actual (verificado contra esta versión). El propio archivo `.env` nunca tiene que cambiar.

### Desde `dotenv` (lecturas manuales de `process.env`)

Mantén el archivo `.env` exactamente como está. Sustituye las lecturas dispersas de `process.env.X` por un esquema más `loadEnv`, que analiza `.env`, valida cada valor y devuelve resultados con tipos, y ejecuta antes `env-saaf scan` para encontrar cada lectura que tengas.

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

### Desde `dotenv-safe` (el contrato de `.env.example`)

`dotenv-safe` falla al arrancar cuando a `.env` le falta una clave que `.env.example` declara. env-saaf conserva el mismo archivo `.env.example` y traslada la comprobación del contrato a donde la desviación ocurre de verdad —CI—, más una comprobación de esquema al arrancar.

| `dotenv-safe` | env-saaf |
| --- | --- |
| `require('dotenv-safe').config({ example: '.env.example' })` en el código; caída al arrancar si falta una clave | mantén `.env.example` sin cambios; `npx env-saaf check` lo compara con tu código y tu `.env` real (salida 1 ante cualquier hallazgo `MISSING` / `EXTRA` / `UNUSED` / `INVALID`) |
| sin validación de tipos: cada valor se queda como cadena | `loadEnv(schema)` convierte y valida cada valor (`port`, `url`, `boolean`, …) al arrancar |
| opción `allowEmptyValues: false` | `sensitive: true` enmascara el valor en errores/salida y deja vacío su marcador en `.env.example`; los valores *opcionales* vacíos siguen permitidos |

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

### Desde `envalid` (correspondencia de validadores)

Los validadores habituales se corresponden uno a uno con los tipos de regla de env-saaf:

| envalid | env-saaf rule | difference that matters |
| --- | --- | --- |
| `str()` | `{ type: 'string' }` | recortado por defecto (`trim: false` para conservar los espacios); `pattern` / `minLength` / `maxLength` disponibles |
| `str({ default: 'dev' })` | `{ type: 'string', default: 'dev' }` | los valores por defecto se validan igual que los valores proporcionados |
| `str({ choices: ['dev', 'prod'] })` | `{ choices: ['dev', 'prod'] }` | `choices` compara el valor *convertido* (también funciona con números/booleanos) |
| `num()` | `{ type: 'number' }` | `min` / `max` limitan el número analizado |
| `port()` | `{ type: 'port' }` | entero 0–65535, analizado a número |
| `bool()` | `{ type: 'boolean' }` | acepta `true/false`, `yes/no`, `on/off`, `1/0`, `y/n` |
| `url()` | `{ type: 'url' }` | `protocols: ['https']` limita los esquemas permitidos |
| `email()` | `{ type: 'email' }` | — |
| `json()` | `{ type: 'json' }` | analizado a un valor JS real, no a una cadena |

Ambas bibliotecas agregan todos los errores en una pasada; env-saaf lanza un `EnvSaafError` cuyo `.errors` enumera cada problema (o devuelve `{ env, errors }` con `throwOnError: false`).

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

## Versiones

- **v0.1.0** — `validateEnv` básico: tipos (string/number/boolean/url/port), required, valores por defecto, choices, todos los errores a la vez.
- **v0.2.0** — análisis de archivos `.env`, escaneo de código (diferencia entre usado y documentado), CLI (`check` / `scan`).
- **v1.0.0** — enmascaramiento de secretos, generación de `.env.example` desde el esquema y desde el escaneo de código, definiciones de TypeScript, API estable.
- **v1.1.0** — `--help` de la CLI sale con 0, `on`/`off`/`y`/`n` en booleanos, `scanCode` encuentra la desestructuración con `let`/`var`, comentarios en línea eliminados en `parseEnvFile`, archivos `.mts`/`.cts` escaneados.
- **v1.2.0** — tipo `email` y opción `pattern`, salida `--json` de la CLI, `transform` por clave, interpolación `${VAR}`, `loadEnv` con varios archivos, valores entre comillas de varias líneas, `--no-color` en la CLI, tipo `int` con `min`/`max`, recetas en el README.
- **v1.5.0** — tipos `duration` y `host`, tipos `date` y `file`, modo sin excepciones, interpolación `${VAR:-default}`, validación con `--schema` en la CLI, errores por claves duplicadas y líneas sin más en archivos `.env`, validación de directorios en `scan`/`check`/`example`, ejemplo de Express, tabla de referencia de tipos en el README.
- **v1.6.0** — tipos `bigint` e `ipv6`, esquemas agrupados (anidados), tipo `array` con coerción por elemento, opciones `requiredIf`/`aliases`/`conflictsWith`/`deprecated`, `loadEnvAsync`, exportación `toJsonSchema`, comandos CLI `init` y `print`, `check --fix`, detección de secretos reales en `check`, `scan`/`check` de un solo archivo, pruebas fuzz basadas en propiedades — la versión más grande hasta ahora, con muchas contribuciones externas.
- **v1.7.0** — tipo `jwt` para validar la forma de JSON Web Tokens, esquemas más estrictos (`choices` no-array y `length` fuera de `hex` se rechazan de entrada), interpolación de `loadEnv` por capas entre archivos, desestructuración de alias en `scanCode`, secretos no-string enmascarados, rechazo de enteros inseguros en `int`/`number`, enmascarado de secretos en `print` y la corrección de la prueba de `scan --json` en proyecto vacío.
- **v1.4.0** — tipos `ipv4`, `semver` y `base64`, `check` de la CLI compara las claves reales de `.env`, `--version` en la CLI, `example --write`, advertencias UNUSED en `scan`, `check` sale con 1 ante cualquier hallazgo, `scanCode` ignora comentarios/cadenas, valores por defecto validados igual que los proporcionados, `--help` tras un subcomando, comillas escapadas en `parseEnvFile`, `port` acepta 0, documentación del flujo de trabajo de GitHub Actions.
- **v1.3.0** — tipos `json`, `uuid` y `hex`, opciones `minLength`/`maxLength` y `length` de `hex`, `trim: false`, inferencia del tipo de retorno de `loadEnv`, generación de `.env.example` más segura para claves secretas, corrección de JSON en `assign: true`.

## Contribuir

Los issues y los pull requests son bienvenidos, incluidos los pequeños. Empieza por los issues con la etiqueta [`good first issue`](https://github.com/abhi478jeetur-rgb/env-saaf/labels/good%20first%20issue), y lee antes [CONTRIBUTING.md](CONTRIBUTING.md): explica la regla de cero dependencias y cómo ejecutar las pruebas.

## Colaboradores

env-saaf existe gracias a todas las personas que han contribuido con código, correcciones e ideas. **23 personas** ajenas al mantenedor han logrado fusionar pull requests hasta ahora:

- [@abdul-karim-mia](https://github.com/abdul-karim-mia) — el primer colaborador externo
- `@HarshRajSinghania` — salida `--json` de la CLI
- [@Golden007-prog](https://github.com/Golden007-prog)
- [@harshit3355](https://github.com/harshit3355)
- [@bfs2021](https://github.com/bfs2021)
- [@enidchen0125](https://github.com/enidchen0125)
- [@theroimasters1-dev](https://github.com/theroimasters1-dev)
- [@kamrullab](https://github.com/kamrullab)
- [@Veeramanikandanr48](https://github.com/Veeramanikandanr48)
- [@rise11hx-cmyk](https://github.com/rise11hx-cmyk)
- `@P1LOTRX` — los valores por defecto se validan igual que los valores proporcionados
- [@emreocell](https://github.com/emreocell)
- [@IG-ABHINAV](https://github.com/IG-ABHINAV)
- [@flipcyde101](https://github.com/flipcyde101)
- [@swpswpswp](https://github.com/swpswpswp)
- [@tnalbant](https://github.com/tnalbant)
- [@jamesyshd19-cmyk](https://github.com/jamesyshd19-cmyk) — `init` usa la ruta de esquema personalizada
- [@abhinavrastogi2627](https://github.com/abhinavrastogi2627) — los alias ambiguos se rechazan
- `DeviousCardi` — esquemas agrupados, modo de vigilancia de la CLI, guía de migración y más (nueve PR)
- [@ghosh-shrestha](https://github.com/ghosh-shrestha) — las opciones de regla desconocidas se rechazan
- [@echuq](https://github.com/echuq) — los números con prefijo de base y las claves de archivo env no válidas se rechazan
- [@sharkohark1234](https://github.com/sharkohark1234) — `toJsonSchema` maneja los esquemas agrupados; `check --json-schema`
- [@saadBinMumtaz](https://github.com/saadBinMumtaz) — `init --from-example --groups`

Este muro crece por sí solo a medida que llegan nuevos pull requests:

<a href="https://github.com/abhi478jeetur-rgb/env-saaf/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=abhi478jeetur-rgb/env-saaf" alt="env-saaf contributors" />
</a>

Las guías nuevas están en la [wiki del proyecto](https://github.com/abhi478jeetur-rgb/env-saaf/wiki): empieza por la guía de la CLI y la referencia de tipos que hay allí.

## Licencia

MIT © Abhijeet Kumar
