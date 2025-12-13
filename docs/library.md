# 🏗️ Technical Library Overview

This section provides a comprehensive deep dive into the internal architecture of GenieOS. It is specifically designed for core contributors, maintainers, and advanced developers who need to understand the underlying mechanisms, the critical reliance on Angular's internal APIs, and the potential stability implications across different framework versions.

<details open>
<summary><strong>📑 Spis treści</strong></summary>

- [1. Core Architecture](#1-core-architecture)
  - [Interception Layer (GenieRegistryService)](#interception-layer-genieregistryservice)
  - [State Layer (StateService)](#state-layer-stateservice)
  - [Presentation Layer](#presentation-layer)
- [2. The Interception Mechanism ("The Spy")](#2-the-interception-mechanism-the-spy)
  - [2.1 Monkey Patching Injector.prototype.get](#21-monkey-patching-injectorprototypeget)
    - [Deep Dive & Implications](#deep-dive--implications)
  - [2.2 DOM & Injector Tree Traversal](#22-dom--injector-tree-traversal)
    - [Entry Point (ApplicationRef)](#entry-point-applicationref)
    - [The window.ng Hook](#the-windowng-hook)
    - [LView and Internal Access](#lview-and-internal-access)
- [3. Data Structures & Memory Management](#3-data-structures--memory-management)
  - [3.1 Weak Reference Strategy](#31-weak-reference-strategy)
  - [3.2 Normalized Graph Storage](#32-normalized-graph-storage)
- [4. Risks and Limitations](#4-risks-and-limitations)
  - [4.1 Reliance on Private APIs (The ɵ Risk)](#41-reliance-on-private-apis-the--risk)
  - [4.2 Production Builds & Tree Shaking](#42-production-builds--tree-shaking)
  - [4.3 Heuristic Analysis Limitations](#43-heuristic-analysis-limitations)
- [5. Performance Strategy](#5-performance-strategy)
  - [5.1 Reactive Signals & OnPush](#51-reactive-signals--onpush)
  - [5.2 Deferred Initialization](#52-deferred-initialization)
- [6. Update Guide for Maintainers](#6-update-guide-for-maintainers)

</details>

---

## 🧱 1. Core Architecture

GenieOS operates as a runtime overlay, meaning it does not perform static analysis of the source code (AST parsing) but instead inspects the live, instantiated application state directly in the browser memory. The architecture is strictly stratified into three distinct layers to separate data collection from presentation logic:

<a id="interception-layer-genieregistryservice"></a>
<details>
<summary><strong>🛡️ Interception Layer (GenieRegistryService)</strong></summary>

**Role:** The "nervous system" of the library.  
**Mechanism:** It sits directly on top of Angular's Injector and ApplicationRef.
</details>

<a id="state-layer-stateservice"></a>
<details>
<summary><strong>📊 State Layer (StateService)</strong></summary>

**Role:** Reactive data store built on Angular Signals.  
**Mechanism:** Transforms raw registry data into semantic graphs.
</details>

<a id="presentation-layer"></a>
<details>
<summary><strong>🎨 Presentation Layer</strong></summary>

**Role:** Decoupled UI rendering layer.  
**Mechanism:** Uses ChangeDetectionStrategy.OnPush exclusively.
</details>

---

## 🔍 2. The Interception Mechanism ("The Spy")

The heart of GenieOS is Runtime DI Interception.

<a id="21-monkey-patching-injectorprototypeget"></a>
<details>
<summary><strong>🐒 2.1 Monkey Patching Injector.prototype.get</strong></summary>

GenieOS monkey-patches Injector.prototype.get to intercept all DI resolutions.

<a id="deep-dive--implications"></a>
<details>
<summary><strong>⚙️ Deep Dive & Implications</strong></summary>

- Flag decoding (@Optional, @SkipSelf)
- Lazy-loaded module support
- Micro-latency risk and mitigation

</details>

</details>

<a id="22-dom--injector-tree-traversal"></a>
<details>
<summary><strong>🌳 2.2 DOM & Injector Tree Traversal</strong></summary>

<a id="entry-point-applicationref"></a>
<details>
<summary><strong>🚪 Entry Point (ApplicationRef)</strong></summary>

Traversal starts from appRef.components.
</details>

<a id="the-windowng-hook"></a>
<details>
<summary><strong>🔗 The window.ng Hook</strong></summary>

Relies on Angular DevTools hooks.
</details>

<a id="lview-and-internal-access"></a>
<details>
<summary><strong>📦 LView and Internal Access</strong></summary>

Accesses Ivy internals (LView, TView, ɵcmp).
</details>

</details>

---

## 💾 3. Data Structures & Memory Management

<a id="31-weak-reference-strategy"></a>
<details>
<summary><strong>🔗 3.1 Weak Reference Strategy</strong></summary>

Uses WeakMap to avoid memory leaks.
</details>

<a id="32-normalized-graph-storage"></a>
<details>
<summary><strong>📈 3.2 Normalized Graph Storage</strong></summary>

Flat, normalized graph for fast queries.
</details>

---

## ⚠️ 4. Risks and Limitations

<a id="41-reliance-on-private-apis-the--risk"></a>
<details>
<summary><strong>🔒 4.1 Reliance on Private APIs (The ɵ Risk)</strong></summary>

Heavy use of Angular internals.
</details>

<a id="42-production-builds--tree-shaking"></a>
<details>
<summary><strong>🚧 4.2 Production Builds & Tree Shaking</strong></summary>

window.ng unavailable in prod builds.
</details>

<a id="43-heuristic-analysis-limitations"></a>
<details>
<summary><strong>❓ 4.3 Heuristic Analysis Limitations</strong></summary>

Some diagnostics are heuristic-based.
</details>

---

## ⚡ 5. Performance Strategy

<a id="51-reactive-signals--onpush"></a>
<details>
<summary><strong>📡 5.1 Reactive Signals & OnPush</strong></summary>

Fine-grained UI updates with Signals.
</details>

<a id="52-deferred-initialization"></a>
<details>
<summary><strong>⏳ 5.2 Deferred Initialization</strong></summary>

Defers scanning until app stabilizes.
</details>

[//]: # (---)

[//]: # ()

[//]: # (## 🔄 6. Update Guide for Maintainers)

[//]: # ()

[//]: # (Checklist for upgrading Angular versions.)
