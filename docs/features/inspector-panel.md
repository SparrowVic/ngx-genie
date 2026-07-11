# 🔍 Inspector Panel

The right-hand panel for detailed inspection of the selected element — an injector node or a provider. This is where clicks from every view lead.

← [Docs home](../README.md) · [Feature overview](./README.md)

---

![Inspector Panel](https://github.com/user-attachments/assets/078d35b7-80d1-4f34-bed0-47f903d339b5)

When you select a node its scope and provider list appear; when you select a provider its instance details appear. Every view routes selections here, so the Inspector is the single place that answers "what exactly is this thing?"

<details open>
<summary><strong>Capabilities</strong></summary>

- **Contextual details** — when a node is selected: its scope and provider list; when a provider is selected: instance details.
- **Provider list** with rich markings:
  - dependency type (Service, Token, Component, etc.),
  - provider type (Class, Factory, Value, Existing),
  - statuses (`USED`, `ROOT`) and DI flags (`@Optional`, `@Host`, `@Self`, `@SkipSelf`).
- **Local filters** (toolbar) — search and filters by source, type, and modifiers.
- **Sync Filters** — synchronize the local filters with the global [Options Panel](./options-panel.md).
- **Resizable split** — adjustable height for the provider list and state snapshot, with a quick collapse/expand button.
- **Debug actions**:
  - 📝 **Console Log** of the instance,
  - 👀 optional **Live Watch** (real-time change monitoring, when enabled).

</details>

<details open>
<summary><strong>Provider details</strong></summary>

When a specific provider is selected, the Inspector shows:

- **State Snapshot** 🌳 — an expandable JSON tree of the instance's public properties.
- **Angular Signals** ⚡ — recognized and marked as `SIGNAL`, with their current value.
- **Injection Path** 🛤️ — the full chain of injectors Angular walked to resolve the dependency (the last element is the active instance).

</details>

---

## Related

- [Options Panel](./options-panel.md) — the global filters the Inspector can sync with.
- [Views](./views.md) — where selections originate.
- [Runtime scope](../runtime-scope.md) — why an instance you expected may not exist yet.
