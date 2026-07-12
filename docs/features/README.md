# 🛠️ Feature overview

GenieOS analyzes Angular Dependency Injection from several angles: a detailed inspector, global filtering, multiple visualizations, and an automated diagnostics engine.

← [Docs home](../README.md)

---

Each feature lives on its own page:

- [Inspector Panel](./inspector-panel.md) — the right-hand panel for detailed inspection of the selected injector node or provider, including the state snapshot, signals, and injection path.
- [Options Panel](./options-panel.md) — the left-hand panel for global filtering and noise reduction across every view.
- [Views](./views.md) — the shared legend plus the four ways of drawing the same DI structure: Tree, Org Chart, Matrix, and Constellation.
- [Diagnostics](./diagnostics.md) — DI health scoring, the diagnostic rules engine, anomaly exploration, and reporting.

Every view presents the **same** underlying DI graph — clicking any element always leads to the [Inspector Panel](./inspector-panel.md). For the boundaries of what that graph contains, see [Runtime scope](../runtime-scope.md).
