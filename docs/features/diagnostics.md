# 🩺 Diagnostics

A dedicated, advanced view for analyzing the overall health of the Dependency Injection system — aggregating engine data into metrics, anomalies, and contextual recommendations.

← [Docs home](../README.md) · [Feature overview](./README.md)

---

![Diagnostics](https://github.com/user-attachments/assets/eb8b4fe8-81a9-4016-a4ae-17acf26f7950)

Diagnostics interprets the DI graph in real time and presents it as metrics, anomalies, and recommendations. Its goal is not only to highlight issues but to help you understand **why** a given DI structure is risky and **how** to improve it. It operates fully reactively — any change to rules, thresholds, or filters instantly updates the generated report.

## Table of contents

- [System Health & Global Metrics](#system-health--global-metrics)
- [Diagnostic Rules Engine](#diagnostic-rules-engine)
- [Data Filtering and Exploration](#data-filtering-and-exploration)
- [Anomaly List](#anomaly-list)
- [Special States](#special-states)
- [Reporting](#reporting)

---

## System Health & Global Metrics

<a id="system-health--global-metrics"></a>

The top section provides a synthetic overview of the DI system's state.

<details open>
<summary><strong>Integrity Score 🎯</strong></summary>

The central element is the **Integrity Score** — a percentage rating of the DI architecture's quality and stability, calculated from the number, weight, and type of detected anomalies.

- **OPTIMAL (≥ 95%)** 🟢 — DI architecture without significant issues
- **STABLE (71–94%)** 🟡 — minor warnings, no critical threats
- **UNSTABLE (41–70%)** 🟠 — real risk of architectural or performance problems
- **CRITICAL (≤ 40%)** 🔴 — system requires urgent refactoring

The indicator color and status description adjust dynamically based on the current score.

</details>

<details open>
<summary><strong>Anomaly Distribution 📊</strong></summary>

Next to the integrity score, the distribution of detected issues by severity is shown:

- **CRITICAL** 🔴 — issues that could lead to runtime errors or memory leaks
- **WARNING** 🟠 — architectural and performance concerns
- **INFO** 🔵 — suggestions and best practices

The visualization includes a donut chart (percentage share), the total count of detected anomalies, and a progress bar for each category.

</details>

---

## Diagnostic Rules Engine

<a id="diagnostic-rules-engine"></a>

The **Diagnostics Engine** panel (left column) gives precise control over the issue-detection logic.

<details open>
<summary><strong>Detection rules</strong></summary>

Each rule can be independently enabled or disabled:

- **Singleton Violations** — services declared as singletons that actually have multiple instances
- **Unused Providers** — providers registered in DI but never used
- **Perf / Change Detection** — components that may cause excessive change detection cycles
- **Injector Abuse (Circular)** — suspicious dependency patterns and cycles in injectors
- **Missing Cleanup** — lack of proper resource cleanup (e.g. subscriptions)

Each rule directly impacts the Integrity Score.

</details>

<details open>
<summary><strong>Thresholds and parameters</strong></summary>

Selected rules offer adjustable thresholds:

- **High Coupling** — the maximum number of dependencies injected into a single component/service
- **Large API** — the number of public fields/methods considered overly extensive
- **Heavy State** — the size of stored state that may cause performance issues

Changing a threshold instantly recalculates the diagnostic report.

</details>

---

## Data Filtering and Exploration

<a id="data-filtering-and-exploration"></a>

Diagnostics provides an extensive filtering system to focus precisely on relevant issues.

<details open>
<summary><strong>Search and tags</strong></summary>

- a global search field supporting multiple tags simultaneously,
- contextual dynamic suggestions,
- the ability to combine text filters with structural ones.

</details>

<details open>
<summary><strong>Semantic filters</strong></summary>

- **Severity** — CRITICAL / WARNING / INFO
- **Category** — ARCHITECTURE / PERFORMANCE / MEMORY / BEST PRACTICE
- **Scope**:
  - USER CODE — your components, services, directives, pipes, and tokens
  - FRAMEWORK — Angular framework elements (optionally visible)

Each filter affects both the anomaly list and the header metrics.

</details>

---

## Anomaly List

<a id="anomaly-list"></a>

The main section displays detected issues as diagnostic cards.

<details open>
<summary><strong>Anomaly card</strong></summary>

Each card contains:

- the severity level (CRIT / WARN / INFO),
- the issue type and category,
- whether it concerns user code or framework,
- the scope (NODE LEVEL or PROVIDER LEVEL),
- a natural-language problem description,
- a repair or refactoring suggestion,
- an option to copy the details to the clipboard.

Depending on the anomaly type, a card may link directly to the related component or provider in other views.

</details>

<details open>
<summary><strong>Presentation modes</strong></summary>

- **List View** 📜 — a clear, sequential card layout
- **Grid View** 🃏 — a more compact layout for quick scanning

</details>

---

## Special States

<a id="special-states"></a>

- **NO VISIBLE ISSUES** — no issues match the current filter criteria
- information about the number of hidden anomalies, with hints about which filters are blocking them

This makes it easy to verify whether the system is truly healthy or issues are merely filtered out.

---

## Reporting

<a id="reporting"></a>

- copy the entire filtered report to the clipboard,
- the report includes only the currently visible anomalies,
- the format is optimized for further analysis or architectural reviews.

Diagnostics is the central point for evaluating DI quality and naturally complements the exploratory [Views](./views.md) (Tree, Org Chart, Matrix, Constellation), offering a strictly quality-focused perspective.

---

## Related

- [Views](./views.md) — where anomalies link back into the graph.
- [Inspector Panel](./inspector-panel.md) — inspect the flagged provider or node in detail.
