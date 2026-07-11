# 🔭 Runtime scope — what GenieOS can (and cannot) see

GenieOS reflects the live state of your application in memory, not your source code. This page explains what that means for the graph you see.

← [Docs home](./README.md)

---

GenieOS is a **runtime inspector, not a static analyzer**. It never reads your source code or TypeScript — it reflects the **live state of the application in the browser's memory**. As a direct consequence, it only ever shows what Angular has actually **instantiated**, which is why the graph reflects the **current route** rather than the entire project.

**Angular instantiates lazily**, so an element only enters the graph once it truly exists at runtime:

| Element | When it actually exists at runtime |
| --- | --- |
| **Component** | Only once **rendered** into the live view tree. A component on a route you have not visited is just a class — no instance, no injector, no resolved dependencies. |
| **`providedIn: 'root'` service** | Only on **first `inject()`**. A root service that nothing has injected yet does not exist as an object. |
| **Component-scoped provider** | Only for the **lifetime of its host component**. |
| **Lazy route** (`loadComponent` / `loadChildren`) | Its code is **not even downloaded** until you navigate there. |

**Persists vs. swaps:**

- **Persists** across navigation — everything outside the `<router-outlet>` (the shell: root component, nav, background, footer) plus any root service already resolved.
- **Swaps** on navigation — the active route's component and its whole subtree. Navigating away **destroys** those components (and the weak-reference strategy lets the GC drop them from the graph); navigating in creates new ones.

The precise criterion is **"alive in the injector/component tree"**, not "visible on screen". A rendered-but-scrolled-off component still appears; a component behind `@if (false)` or inside a not-yet-triggered `@defer` block has no instance and does **not** appear.

**This is a feature, not a limitation.** The runtime graph shows what the application is *actually doing right now* — the real injector hierarchy, the real resolution paths, and the **live values of Signals and Observables**. A static "list of everything declared" cannot show state, real injection paths, or runtime anomalies such as circular dependencies and singleton violations.

**To widen the picture, navigate** — the graph updates live as you move between routes. A true "whole project at once" view would require **static source analysis (AST)**, a fundamentally different class of tool that operates on code rather than on the running application.

---

## Related

- [Architecture](./architecture.md) — how interception, tree traversal, and the weak-reference strategy make this work.
- [Feature overview](./features/README.md) — the views that render this runtime graph.
