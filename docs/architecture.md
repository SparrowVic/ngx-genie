# 🏗️ Architecture

A detailed look at the internal architecture of GenieOS — its layered design, how it intercepts Dependency Injection, how it manages memory, and what to re-verify on each Angular upgrade.

← [Docs home](./README.md)

<details open>
<summary><strong>Who this is for</strong></summary>

This document is intended for core contributors and advanced users. It focuses on:

- low-level dependencies on Angular's internal APIs,
- the rationale behind key architectural decisions,
- stability implications related to future framework upgrades.

For what the inspector can and cannot observe at runtime, see the dedicated [Runtime scope](./runtime-scope.md) page.

</details>

---

## 📚 Table of Contents

- [1. Core Architecture](#1-core-architecture)
  - [1.1 Interception Layer](#11-interception-layer-genieregistryservice)
  - [1.2 State Management Layer](#12-state-management-layer-stateservice)
  - [1.3 Presentation Layer](#13-presentation-layer)
- [2. Interception Mechanism](#2-interception-mechanism)
  - [2.1 Per-instance injector patching](#21-per-instance-injector-patching)
  - [2.2 DOM & Injector Tree Traversal](#22-dom--injector-tree-traversal)
- [3. Memory & Data Structures](#3-memory--data-structures)
  - [3.1 Weak Reference Strategy](#31-weak-reference-strategy)
  - [3.2 Normalized Storage](#32-normalized-storage)
- [4. Risks & Limitations](#4-risks--limitations)
  - [4.1 Internal API Dependency](#41-internal-api-dependency)
  - [4.2 Production Builds](#42-production-builds)
  - [4.3 Heuristic Analysis](#43-heuristic-analysis)
- [5. Performance Strategy](#5-performance-strategy)
- [6. Upgrade Checklist](#6-upgrade-checklist)

---

<details open>
<summary id="1-core-architecture"><strong>🧱 1. Core Architecture</strong></summary>

GenieOS operates as a **runtime overlay**, which clearly distinguishes it from static analysis tools.

Instead of analyzing source code (AST), the library **inspects the live state of the application** directly in the browser's memory. This makes it possible to visualize dynamic relationships that do not exist in a static form. (For exactly what "live state" includes — and why the graph tracks the current route — see [Runtime scope](./runtime-scope.md).)

The architecture of GenieOS is **strictly layered** and deliberately separated by responsibilities.

<details open>
<summary id="11-interception-layer-genieregistryservice"><strong>🛡 1.1 Interception Layer (GenieRegistryService)</strong></summary>

- **Role**
  - The "nervous system" of the library.
  - The central point for intercepting and registering DI events.

- **Mechanism**
  - Real-time monitoring of dependency resolution.
  - Mapping Angular internal references (Injectors, service instances) to stable GenieOS identifiers.
  - A bridge between Angular's private runtime and the GenieOS data model.

</details>

<details open>
<summary id="12-state-management-layer-stateservice"><strong>📊 1.2 State Management Layer (<code>*StateService</code>)</strong></summary>

- **Role**
  - The reactive "brain" of the system.
  - A lightweight alternative to classic state management libraries, designed specifically for devtools.

- **Mechanism**
  - Fully based on Angular Signals.
  - Transformation of raw registry data into semantic structures:
    - dependency trees,
    - relationship matrices,
    - service constellations.
  - Handling view logic, filtering, and search.
  - No mutation of the source of truth, ensuring data consistency across views.

</details>

<details open>
<summary id="13-presentation-layer"><strong>🎨 1.3 Presentation Layer</strong></summary>

- **Role**
  - The visual layer exposed to the user.

- **Mechanism**
  - Use of `ChangeDetectionStrategy.OnPush` throughout the entire UI.
  - Isolation of expensive graph rendering from the host application's change detection cycles.
  - Protection against the "Heisenberg effect", where observing the application significantly impacts its performance.

</details>

</details>

---

<details open>
<summary id="2-interception-mechanism"><strong>🔍 2. Interception Mechanism</strong></summary>

A key feature of GenieOS is **Runtime Dependency Injection Interception**.

While standard Angular tools focus on the **Component Tree**, GenieOS reconstructs the **Dependency Graph** — the hidden network of relationships between services, injectors, and components.

<details open>
<summary id="21-per-instance-injector-patching"><strong>🐒 2.1 Per-instance injector patching</strong></summary>

- Every dependency resolution is observed by wrapping the `get()` method of **concrete injector instances** as they are discovered during a scan. GenieOS deliberately does **not** patch `Injector.prototype` — on Angular 21 the abstract base's `get` is `undefined` and is never invoked, so a prototype patch would be dead code (and unsafe to call). The per-instance wrap is the reliable interception point.
- This allows observation of all injections without decorating or altering the user's application code.

**Technical implications:**

- **DI flag decoding**
  - Flags such as `@Optional`, `@Self`, `@SkipSelf`, `@Host` are decoded from **both** the legacy numeric `InternalInjectFlags` bitmask and the modern `InjectOptions` object, so the actual resolution path is reconstructed correctly on Angular 21.

- **Lazy loading and dynamic components**
  - As new component injectors are discovered they are patched too, so lazy-loaded modules and dynamically created components are covered automatically.

- **Safety & isolation**
  - Patching runs **only in the browser** — never during server-side rendering, where mutating injectors would leak across requests.
  - Every wrapped injector's original `get` is remembered and **restored on teardown** (and when its component is destroyed), leaving no trace on the host application.
  - Capture is **gated to when the overlay is open**: while the inspector is closed nothing is recorded and the deferred-event buffer is cleared, so GenieOS never retains host instances in the background.

- **Performance impact**
  - Minimal, synchronous overhead added to the dependency resolution process.
  - Filtering internal tokens is critical to avoid recursion and performance degradation.

</details>

<details open>
<summary id="22-dom--injector-tree-traversal"><strong>🌳 2.2 DOM & Injector Tree Traversal</strong></summary>

Reconstructing the full DI hierarchy requires combining the logical and physical views of the application.

- Scanning starts from the application's root components.
- Angular global debug hooks are used to map DOM elements to Angular contexts.
- The Logical View (LView) structure is analyzed, which makes it possible to:
  - detect providers that exist in configuration but are never used,
  - identify so-called "zombie services".

</details>

</details>

---

<details open>
<summary id="3-memory--data-structures"><strong>💾 3. Memory & Data Structures</strong></summary>

Designing a tool that analyzes large applications requires aggressive memory control.

<details open>
<summary id="31-weak-reference-strategy"><strong>🔗 3.1 Weak Reference Strategy</strong></summary>

- Internal mappings (injector → node, instance → service) are based on weak references, so the Garbage Collector can freely collect destroyed components and injectors.
- The only strong references are the transient deferred-event buffer — which is **bounded** and cleared when the overlay closes or the registry is torn down — and the graph snapshot the UI is currently rendering.
- This prevents memory leaks during long debugging sessions.

</details>

<details open>
<summary id="32-normalized-storage"><strong>📈 3.2 Normalized Storage</strong></summary>

- Data is stored in a normalized form (flat lists of nodes and edges).
- This enables:
  - fast linear-time filtering,
  - simple state updates,
  - easy serialization (e.g. snapshot exports).

</details>

</details>

---

<details open>
<summary id="4-risks--limitations"><strong>⚠️ 4. Risks & Limitations</strong></summary>

GenieOS operates at a very low runtime level, which introduces certain risks.

<details open>
<summary id="41-internal-api-dependency"><strong>🔒 4.1 Internal API Dependency</strong></summary>

- The library relies on Angular private APIs, marked with the `ɵ` and `_` prefixes.
- These structures are not covered by any stability guarantees across framework versions.

**Mitigation strategy:**

- All access to private APIs is centralized in a single integration module.
- Each Angular upgrade requires verification and regression testing.

</details>

<details open>
<summary id="42-production-builds"><strong>🚧 4.2 Production Builds</strong></summary>

- In production builds, Angular global debug hooks are not available.
- Minification significantly reduces the readability of service and component names.
- The graph structure remains correct, but the diagnostic value is limited.

</details>

<details open>
<summary id="43-heuristic-analysis"><strong>❓ 4.3 Heuristic Analysis</strong></summary>

- **Heavy State Detection**
  - Approximate analysis of object complexity.
  - Limited recursion depth prevents infinite loops.

- **Coupling Score**
  - A metric based on the number of injected dependencies.
  - May generate false positives in the case of wide but rarely used services.

</details>

</details>

---

<details open>
<summary id="5-performance-strategy"><strong>⚡ 5. Performance Strategy</strong></summary>

- Global use of `OnPush`.
- 📡 Precise, Signals-based updates.
- No full re-renders of large UI structures.
- ⏳ Deferred initialization:
  - analysis starts only after the application has stabilized,
  - heavy operations are executed during idle time.

</details>

---

<details open>
<summary id="6-upgrade-checklist"><strong>6. Upgrade Checklist</strong></summary>

When upgrading to a new Angular version, you should:

- verify the behavior of the dependency resolution mechanism,
- check the correctness of component metadata reading,
- validate the compatibility of logical view structures,
- confirm the operation of debug hooks.

> **Executed for the Angular 20 → 21 migration.** This checklist was re-run against `@angular/core` 21.2: the injector `get()` patching, the `ɵcmp` / `ɵprov` metadata reads, the `LView` `CONTEXT_INDEX` traversal, and the `window.ng` debug hooks were all re-verified, and a dedicated contract spec (`angular-internals-compat.spec.ts`) now pins these shapes so a future upgrade fails loudly. Adjustments made: `ɵcmp.onPush` replaced the old `ɵcmp.changeDetection` read; `Injector.get` flag decoding now also handles `InjectOptions` objects in addition to the legacy numeric flags; and interception moved fully to per-instance patching with a browser-only guard, teardown-time restoration, and open-only capture.

</details>
