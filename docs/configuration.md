# ⚙️ Configuration

The complete `GenieConfig` reference — every option, its default, and how GenieOS behaves in development, production, and server-side rendering.

← [Docs home](./README.md)

---

## The `GenieConfig` type

Both entry points — `provideGenie(config)` and `GenieModule.forRoot(config)` — accept a `Partial<GenieConfig>`. Every field is optional; anything you omit falls back to the default below.

```ts
interface GenieConfig {
  hotkey: string | null;
  enabled: boolean;
  visibleOnStart: boolean;
}
```

| Option           | Type            | Default | Description                                                              |
|------------------|-----------------|---------|--------------------------------------------------------------------------|
| `hotkey`         | `string \| null`| `'F1'`  | The keyboard key that toggles the overlay open and closed. `null` disables the shortcut. |
| `enabled`        | `boolean`       | `true`  | Master switch. When `false`, GenieOS registers nothing and captures nothing. |
| `visibleOnStart` | `boolean`       | `false` | Whether the overlay opens automatically once the application stabilizes. |

---

## Options in detail

### `hotkey`

The hotkey is matched against a single [`KeyboardEvent.key`](https://developer.mozilla.org/docs/Web/API/KeyboardEvent/key) value. When you press a key whose `key` equals your `hotkey`, GenieOS **toggles** the overlay (open if closed, closed if open).

Because the match is against one `key` value, `hotkey` should be a single key name rather than a modifier combination. Valid examples:

```ts
provideGenie({hotkey: 'F1'});      // a function key (default)
provideGenie({hotkey: 'F2'});
provideGenie({hotkey: 'Escape'});
provideGenie({hotkey: '`'});       // backtick
```

Set `hotkey: null` to remove the keyboard shortcut entirely — useful when the key clashes with your application. With no hotkey, open the overlay by setting `visibleOnStart: true`.

> The hotkey listener is only attached in the browser and only when `enabled` is `true` and `hotkey` is not `null`.

### `enabled`

The master switch. When `enabled` is `false`, GenieOS does not register its registry service, does not patch any injectors, and does not attach the hotkey listener — it becomes inert. This is the recommended way to keep GenieOS out of production (see [Development vs. production](#development-vs-production)).

### `visibleOnStart`

When `true`, the overlay opens automatically once Angular reports the application as stable. When `false` (the default), the overlay stays closed until you press the hotkey. GenieOS only records DI activity while the overlay is open, so leaving this `false` keeps startup completely untouched until you ask for it.

---

## Typing a configuration

`GenieConfig` is exported from the package, so you can type a shared configuration object and get full editor support:

```ts
import {GenieConfig, provideGenie} from 'ngx-genie';

const genieConfig: Partial<GenieConfig> = {
  hotkey: 'F2',
  visibleOnStart: false
};

// app.config.ts
providers: [
  provideGenie(genieConfig)
];
```

---

## Development vs. production

GenieOS reads Angular's global debug hooks (`window.ng`) and internal runtime metadata to reconstruct the DI graph. Those hooks exist in **development builds** and are stripped from **production builds**, where minification also shortens service and component names. The graph structure still resolves, but names become opaque and diagnostic value drops sharply.

Because GenieOS is a developer tool, the cleanest approach is to disable it in production builds using your environment flag:

```ts
import {environment} from '../environments/environment';
import {provideGenie} from 'ngx-genie';

providers: [
  provideGenie({
    enabled: !environment.production
  })
];
```

With `enabled: false`, GenieOS is fully inert — no injector patching, no hotkey listener, no capture — so it adds no runtime cost to production.

---

## Server-side rendering (SSR)

GenieOS is **browser-only and SSR-safe**. Its initializer checks the platform and only starts the registry (which installs the DI-capture spy) when running in the browser. During server-side rendering nothing is patched and nothing is captured, so there is no risk of state leaking across requests. You can leave `provideGenie` / `GenieModule.forRoot` in a shared configuration without special-casing the server.

---

## Related

- [Getting started](./getting-started.md) — where these options are wired up.
- [Architecture](./architecture.md) — how the browser-only, open-only capture works under the hood.
- [Troubleshooting](./troubleshooting.md) — when the overlay does not appear.
