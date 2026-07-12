# 🧞‍♂️ GenieOS Documentation

**GenieOS** (`ngx-genie`) is an in-browser Dependency Injection inspector for Angular 21. It overlays your running application, reconstructs the live DI graph, and lets you explore injectors, services, signals, and diagnostics in real time. These pages walk you from install to internals.

New here? Start with [Getting started](./getting-started.md), then skim the [Feature overview](./features/README.md).

---

## Getting started

- [Getting started](./getting-started.md) — install the package, wire up `provideGenie` (standalone) or `GenieModule.forRoot` (NgModule), add `<ngx-genie/>`, and press **F1**.
- [Configuration](./configuration.md) — the full `GenieConfig` reference: `hotkey`, `enabled`, `visibleOnStart`, dev/prod behavior, SSR, and typed examples.
- [Troubleshooting](./troubleshooting.md) — what to check when the panel does not appear, plus dev/prod and "No instance available" notes.

## Features

- [Feature overview](./features/README.md) — index of the four feature areas.
  - [Inspector Panel](./features/inspector-panel.md) — detailed inspection of the selected injector node or provider.
  - [Options Panel](./features/options-panel.md) — global filtering and noise reduction.
  - [Views](./features/views.md) — the shared legend and the Tree, Org Chart, Matrix, and Constellation views.
  - [Diagnostics](./features/diagnostics.md) — DI health scoring, rules engine, and anomaly reporting.

## Reference

- [Runtime scope](./runtime-scope.md) — what GenieOS can (and cannot) see, and why the graph reflects the current route.
- [Architecture](./architecture.md) — the technical internals: layered design, per-instance injector interception, memory strategy, risks, and the upgrade checklist.

---

← Back to the [project README](../README.md).
