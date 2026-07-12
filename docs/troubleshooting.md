# 🩹 Troubleshooting

Common issues and how to resolve them when GenieOS does not behave as expected.

← [Docs home](./README.md)

---

## The panel does not appear

Work through these checks in order:

- **Did you add `<ngx-genie/>` to the template?** Registering the provider (`provideGenie` or `GenieModule.forRoot`) is not enough on its own — the overlay only renders where the `<ngx-genie/>` component is placed. See [Getting started → Add the panel component](./getting-started.md#add-the-panel-component-ngx-genie).
- **Is `enabled` `true`?** When `enabled` is `false`, GenieOS is fully inert: no injector patching, no hotkey listener, nothing to open. Check your `GenieConfig`.
- **Is the hotkey what you think it is?** The overlay opens when a key press whose [`KeyboardEvent.key`](https://developer.mozilla.org/docs/Web/API/KeyboardEvent/key) equals your configured `hotkey`. The default is `F1`. If `hotkey` is `null` there is no keyboard shortcut at all — set `visibleOnStart: true` to open the overlay instead. See [Configuration → `hotkey`](./configuration.md#hotkey).
- **Are you running a development build?** GenieOS reads Angular's global debug hooks (`window.ng`), which exist in development (`ng serve`) but are stripped from production builds. See [Development vs. production](#development-vs-production) below.
- **Is the browser blocking scripts or `window.ng`?** A strict content-security policy or an extension may prevent access to the debug hooks GenieOS depends on.
- **Does the application ever become stable?** GenieOS starts its analysis after Angular reports the application as stable (`ApplicationRef.isStable`). If the app never stabilizes — for example an infinite async loop, or a `setInterval` running outside `NgZone` — the deferred initialization may never run and the overlay may fail to populate.

---

## Development vs. production

GenieOS is a development tool. In production builds:

- Angular's global debug hooks are not available, so the inspector has far less to read.
- Minification shortens service and component names, so the graph becomes hard to read even where it resolves.

The graph structure can still be reconstructed, but the diagnostic value is limited. The recommended approach is to disable GenieOS in production entirely:

```ts
import {environment} from '../environments/environment';
import {provideGenie} from 'ngx-genie';

providers: [
  provideGenie({
    enabled: !environment.production
  })
];
```

Installing GenieOS as a **devDependency** (see [Getting started → Installation](./getting-started.md#installation)) reinforces the same intent — the tool should not ship to production.

---

## Server-side rendering

GenieOS never runs during server-side rendering. Its initializer detects the platform and only starts capturing in the browser, so it is safe to leave the provider in a shared configuration. If you expected activity during SSR, that is by design — there is nothing to inspect until the application is running in a browser. See [Configuration → SSR](./configuration.md#server-side-rendering-ssr).

---

## Error: "No instance available"

If you see this message in the Inspector after clicking an element in the **Matrix** view, it is a known limitation related to how the matrix is generated in a **Web Worker** — the worker computes relationships from serialized data and does not carry the live instance across the worker boundary.

**Workaround:** select the same service from the **Tree View**, where the live instance is available and the Inspector can show its state snapshot, signals, and injection path.

---

## Related

- [Getting started](./getting-started.md) — the full setup flow.
- [Configuration](./configuration.md) — every option and its default.
- [Runtime scope](./runtime-scope.md) — why a component or service you expected may not be in the graph yet.
