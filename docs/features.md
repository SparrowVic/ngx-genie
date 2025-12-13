# 🛠️ GenieOS Feature Overview

**GenieOS** is an advanced toolset for analyzing **Angular Dependency Injection** from multiple perspectives: a detailed inspector panel, global configuration options, and diverse visualization views.

> This document uses collapsible sections (`<details>` / `<summary>`) for comfortable reading without endless scrolling.

---

## Table of Contents

- [1. Inspector Panel](#inspector-panel)
- [2. Options Panel](#options-panel)
- [3. Views](#views)
  - [3.1 Common Legend and Markings](#common-legend-and-markings)
  - [3.2 Tree View](#tree-view)
  - [3.3 Org Chart View](#org-chart-view)
  - [3.4 Matrix View](#matrix-view)
  - [3.5 Constellation View](#constellation-view)
- [4. Diagnostics](#diagnostics)
  - [4.1 System Health & Global Metrics](#system-health--global-metrics)
  - [4.2 Diagnostic Rules Engine](#diagnostic-rules-engine)
  - [4.3 Data Filtering and Exploration](#data-filtering-and-exploration)
  - [4.4 Anomaly List](#anomaly-list)
  - [4.5 Special States](#special-states)
  - [4.6 Reporting](#reporting)

---

<details open>
<summary><strong>🔍 1. Inspector Panel</strong></summary>

## 1. Inspector Panel <a id="inspector-panel"></a>

![](https://github.com/user-attachments/assets/078d35b7-80d1-4f34-bed0-47f903d339b5)

The right-hand panel for **detailed inspection of the selected element** (injector node or provider). This is where clicks from any view lead.

<details open>
<summary><strong>Capabilities</strong></summary>

- **Contextual details** – when a node is selected: its scope and provider list; when a provider is selected: instance details.
- **Provider list** with rich markings:
  - dependency type (Service, Token, Component, etc.),
  - provider type (Class, Factory, Value, Existing),
  - statuses (`USED`, `ROOT`) and DI flags (`@Optional`, `@Host`, `@Self`, `@SkipSelf`).
- **Local filters** (toolbar): search and filters by source, type, and modifiers.
- **Sync Filters** – synchronization of local filters with the global Options Panel.
- **Resizable split** – adjustable height for the provider list and state snapshot (with quick collapse/expand button).
- **Debug actions**:
  - 📝 **Console Log** of the instance,
  - 👀 optional **Live Watch** (real-time change monitoring, if enabled).

> 📸 **Placeholder:** Inspector – header preview, provider list, and instance details

</details>

<details open>
<summary><strong>Provider Details</strong></summary>

When a specific provider is selected, the following are displayed:

- **State Snapshot** 🌳 – expandable JSON tree of the instance's public properties.
- **Angular Signals** ⚡ – recognized and marked as `SIGNAL`, with current value.
- **Injection Path** 🛤️ – full chain of injectors through which Angular resolved the dependency (last element = active instance).

</details>

</details>

---

<details open>
<summary><strong>⚙️ 2. Options Panel</strong></summary>

## 2. Options Panel <a id="options-panel"></a>

![](https://github.com/user-attachments/assets/078d35b7-80d1-4f34-bed0-47f903d339b5)

The left-hand panel providing **global control** over filtering and noise reduction. Changes apply reactively and affect all views that support synchronization.

<details open>
<summary><strong>Main Option Groups</strong></summary>

- **View Controls** 🖱️
  - Expand All / Collapse All
  - Deep Focus (isolation of selected branch)
- **Dependency Types** 🏷️
  - toggle categories (User Code vs Angular Internals)
- **Noise Reduction** 🎚️
  - hide Angular internal mechanisms,
  - group identical leaves,
  - hide unused providers,
  - hide leaf nodes (no children)
- **Scope & Lifetime** ⭕
  - Root only / Local only
- **Complexity Filter** 📏
  - slider for minimum subtree complexity
- **Deep Search** 🔎
  - search and tagging by components or providers,
  - matching mode (AND/OR),
  - dynamic view rebuilding for selected elements

> 📸 **Placeholder:** Options Panel – full view of global settings

</details>

</details>

---

<details open>
<summary><strong>🌐 3. Views</strong></summary>

## 3. Views <a id="views"></a>

Different views present **the same DI structure** in distinct ways. Clicking any element always navigates to the Inspector.

<details open>
<summary><strong>🗝️ 3.1 Common Legend and Markings</strong></summary>

### 3.1 Common Legend and Markings <a id="common-legend-and-markings"></a> 🗝️

All views use consistent markings – regardless of representation form (node, card, cell, graph).

**Dependency Categories**

- **SVC** 🛠️ – Service
- **SYS** ⚙️ – System / Core
- **VAL** 📦 – Value / configuration
- **OBS** 📡 – Observable
- **TOK** 🔑 – InjectionToken
- **CMP** 🧩 – Component
- **DIR** 🎯 – Directive
- **PIP** 🔄 – Pipe

**Statuses and Flags**

- `USED` ✅ – provider actually used
- `ROOT` 🌍 – singleton (providedIn: 'root')
- `@Optional` ❓, `@Host` 🏠, `@Self` 🎯, `@SkipSelf` ⏭️ – injection modifiers

> 📸 **Placeholder:** Legend – single comprehensive view with all markings

</details>

<details open>
<summary><strong>🌳 3.2 Tree View</strong></summary>

### 3.2 Tree View <a id="tree-view"></a> 🌳

![](https://github.com/user-attachments/assets/7669a632-4f5b-4d7e-9909-ea1219d352d4)

Classic hierarchical visualization of injectors (aligned with DI hierarchy, not DOM).

- Node: expand icon + type (e.g., EL/ENV) + label + ID + provider count
- Expansion shows dependencies of the given node
- Native support for Deep Focus and real-time filtering

> 📸 **Placeholder:** Tree View – expanded branch with dependencies

</details>

<details open>
<summary><strong>📊 3.3 Org Chart View</strong></summary>

### 3.3 Org Chart View <a id="org-chart-view"></a> 📊

![](https://github.com/user-attachments/assets/8df5540f-d327-4f9f-ad6b-7c923c06b75a)

Organizational view ideal for quickly grasping the structure.

- Injector cards in parent–child relationships
- Ability to collapse subtrees and group clusters
- Best for identifying densely connected areas

> 📸 **Placeholder:** Org Chart View – overall hierarchy layout

</details>

<details open>
<summary><strong>🔲 3.4 Matrix View</strong></summary>

### 3.4 Matrix View <a id="matrix-view"></a> 🔲

![](https://github.com/user-attachments/assets/b281a65a-b4ae-435b-8413-4db7e0541801)

Two-dimensional matrix of consumer–provider relationships.

- **Y-axis**: consumers (injectors/components)
- **X-axis**: providers (tokens/services)
- Cell represents a relationship; click → selection → Inspector
- Optional visual effects (e.g., "Matrix Rain" style) and animation control

> 📸 **Placeholder:** Matrix View – grid fragment with highlighted relationship

</details>

<details open>
<summary><strong>✨ 3.5 Constellation View</strong></summary>

### 3.5 Constellation View <a id="constellation-view"></a> ✨

![](https://github.com/user-attachments/assets/078d35b7-80d1-4f34-bed0-47f903d339b5)

Interactive force-directed graph for exploring connections.

- Graph mode + alternative hierarchical mode
- Simulation control (play/pause) and layout parameters
- Ideal for discovering non-obvious dependencies

> 📸 **Placeholder:** Constellation View – sample dependency graph

</details>

</details>

---

<details open>
<summary><strong>🩺 4. Diagnostics</strong></summary>

## 4. Diagnostics <a id="diagnostics"></a>

![](https://github.com/user-attachments/assets/eb8b4fe8-81a9-4016-a4ae-17acf26f7950)

A dedicated, advanced diagnostic view for analyzing the overall health of the Dependency Injection (DI) system. This view aggregates data from the diagnostics engine, interprets it in real time, and presents it as metrics, anomalies, and contextual recommendations. Its goal is not only to highlight issues but also to help understand **why** a given DI structure is risky and **how** to improve it.

Diagnostics operates fully reactively – any change to rules, thresholds, or filters instantly updates the generated report.

> 📸 **Placeholder:** Diagnostics – main view (System Health + anomaly list)

<details open>
<summary><strong>📈 4.1 System Health & Global Metrics</strong></summary>

### 4.1 System Health & Global Metrics <a id="system-health--global-metrics"></a> 📈

The top section provides a synthetic overview of the DI system's state.

<details open>
<summary><strong>Integrity Score 🎯</strong></summary>

The central element is the **Integrity Score** – a percentage rating of the DI architecture's quality and stability, calculated based on the number, weight, and type of detected anomalies.

- **OPTIMAL (≥ 95%)** 🟢 – DI architecture without significant issues
- **STABLE (71–94%)** 🟡 – minor warnings, no critical threats
- **UNSTABLE (41–70%)** 🟠 – real risk of architectural or performance problems
- **CRITICAL (≤ 40%)** 🔴 – system requires urgent refactoring

The indicator color and status description are dynamically adjusted based on the current score.

> 📸 **Placeholder:** Integrity Score – circular gauge

</details>

<details open>
<summary><strong>Anomaly Distribution 📊</strong></summary>

Next to the integrity score, the distribution of detected issues by severity is shown:

- **CRITICAL** 🔴 – issues that could lead to runtime errors or memory leaks
- **WARNING** 🟠 – architectural and performance concerns
- **INFO** 🔵 – suggestions and best practices

Visualization includes:

- donut chart (percentage share),
- total count of detected anomalies,
- progress bars for each category.

</details>

</details>

<details open>
<summary><strong>⚡ 4.2 Diagnostic Rules Engine</strong></summary>

### 4.2 Diagnostic Rules Engine <a id="diagnostic-rules-engine"></a> ⚡

The **Diagnostics Engine** panel (left column) allows precise control over issue detection logic.

> 📸 **Placeholder:** Diagnostics Engine – rules and thresholds panel

<details open>
<summary><strong>Detection Rules</strong></summary>

Each rule can be independently enabled or disabled:

- **Singleton Violations** – detects services declared as singletons that actually have multiple instances
- **Unused Providers** – identifies providers registered in DI but never used
- **Perf / Change Detection** – highlights components that may cause excessive change detection cycles
- **Injector Abuse (Circular)** – detects suspicious dependency patterns and cycles in injectors
- **Missing Cleanup** – signals lack of proper resource cleanup (e.g., subscriptions)

Each rule directly impacts the Integrity Score.

</details>

<details open>
<summary><strong>Thresholds and Parameters</strong></summary>

Selected rules offer adjustable thresholds:

- **High Coupling** – maximum number of dependencies injected into a single component/service
- **Large API** – number of public fields/methods considered overly extensive
- **Heavy State** – size of stored state that may cause performance issues

Changing threshold values instantly recalculates the diagnostic report.

</details>

</details>

<details open>
<summary><strong>🔍 4.3 Data Filtering and Exploration</strong></summary>

### 4.3 Data Filtering and Exploration <a id="data-filtering-and-exploration"></a> 🔍

Diagnostics provides an extensive filtering system to focus precisely on relevant issues.

<details open>
<summary><strong>Search and Tags</strong></summary>

- global search field supporting multiple tags simultaneously,
- contextual dynamic suggestions,
- ability to combine text filters with structural ones.

</details>

<details open>
<summary><strong>Semantic Filters</strong></summary>

- **Severity** – CRITICAL / WARNING / INFO
- **Category** – ARCHITECTURE / PERFORMANCE / MEMORY / BEST PRACTICE
- **Scope**:
  - USER CODE – user components, services, directives, pipes, and tokens
  - FRAMEWORK – Angular framework elements (optionally visible)

Each filter affects both the anomaly list and the header metrics.

</details>

</details>

<details open>
<summary><strong>🚨 4.4 Anomaly List</strong></summary>

### 4.4 Anomaly List <a id="anomaly-list"></a> 🚨

The main section displays detected issues as diagnostic cards.

> 📸 **Placeholder:** Anomaly list – list and grid views

<details open>
<summary><strong>Anomaly Card</strong></summary>

Each card contains:

- severity level (CRIT / WARN / INFO),
- issue type and category,
- indication whether it concerns user code or framework,
- scope (NODE LEVEL or PROVIDER LEVEL),
- natural-language problem description,
- repair or refactoring suggestion,
- option to copy details to clipboard.

Depending on the anomaly type, the card may link directly to the related component or provider in other views.

</details>

<details open>
<summary><strong>Presentation Modes</strong></summary>

- **List View** 📜 – clear, sequential card layout
- **Grid View** 🃏 – more compact layout for quick scanning

</details>

</details>

<details open>
<summary><strong>ℹ️ 4.5 Special States</strong></summary>

### 4.5 Special States <a id="special-states"></a> ℹ️

- **NO VISIBLE ISSUES** – no issues matching current filter criteria
- information about the number of hidden anomalies with hints about which filters are blocking them

This view quickly verifies whether the system is truly healthy or if issues are merely filtered out.

</details>

<details open>
<summary><strong>📋 4.6 Reporting</strong></summary>

### 4.6 Reporting <a id="reporting"></a> 📋

- ability to copy the entire filtered report to clipboard,
- report includes only currently visible anomalies,
- format optimized for further analysis or architectural reviews.

Diagnostics serves as the central point for evaluating DI quality and naturally complements exploratory views (Tree, Org Chart, Matrix), offering a strictly quality-focused and diagnostic perspective.

</details>

</details>
