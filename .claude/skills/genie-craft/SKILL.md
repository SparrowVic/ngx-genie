---
name: genie-craft
description: Use when changing the ngx-genie / GenieOS Angular library (projects/ngx-genie) — how to analyse the subsystem first, keep components granular and version-idiomatic, guard the private-API classification, review adversarially, and verify by driving the real overlay. Applies to any edit under projects/ngx-genie/src/lib and to its demo.
---

# GenieOS (ngx-genie) craftsmanship

GenieOS is a **runtime** Angular DI inspector that monkey-patches private Angular internals. It is a
published library — treat every change as product code. Work in this order.

## 1. Map the subsystem before editing
- The library is `projects/ngx-genie` (the important artefact); `src/` is the demo. Demo imports the lib
  **source** via the tsconfig path alias `genie` → `public-api.ts`, so demo builds exercise lib source.
- Before touching classification/DI/filter code, `grep` every consumer. The load-bearing contracts:
  `GenFilterService.{isInternal, getTypeOverride, configChanged, checkFilterStatus}`, the registry's
  `describeToken()` (produces `svc.label`), `ANGULAR_CORE_SYSTEM`, and the graph predicate
  `explorer-state.service._serviceMatchesFilters` (uses `s.isFramework` + `s.dependencyType` + toggles).
- Read the data flow end-to-end: token → `describeToken` label → `checkFilterStatus`/`isInternal` →
  `svc.isFramework`; and `overrideTokenType(label)` → `getTypeOverride(describeToken(token))`. The key that
  the UI writes MUST equal the key the registry reads.
- Runtime token labels can be **`_`-prefixed** (`_NgIf`, `_ButtonComponent`). Normalise (`normalizeInternalName`,
  strips a leading `_`) before comparing to the raw internal sets — and normalise at EVERY lookup site, not
  just one (registry `ANGULAR_CORE_SYSTEM.has(...)` at getDependencyType/isLikelySystemObject/scanConstructorDependencies).

## 2. Granularity
- Every component gets its own directory with **separate** `.ts` + `.html` + `.scss` (no inline template/styles).
- Split a screen into a thin **shell** + nested sub-components (`<gic-header>`, `<gic-rule-card>`, …), one per
  logical piece and one per repeated list item. No empty TS classes — each holds real logic (inputs, computed).
- Prefer a **component-scoped facade store**: an `@Injectable()` (NOT `providedIn:'root'`) `providers:[Store]`
  on the shell. Sub-components `inject(Store)` and stay thin; one store owns the signals/computeds/actions.
  Bonus: it shows up as a component-scoped provider in the inspector.
- **ShadowDom nesting gotcha:** the overlay + its modals use `ViewEncapsulation.ShadowDom`. A child rendered
  inside a ShadowDom parent MUST also be `ShadowDom` (Emulated/None styles live in `document.head` and never
  reach a shadow root). Define the design tokens (CSS custom properties) once on the shell `:host`; they
  **inherit** through shadow boundaries, so children just use `var(--violet)` etc. Give each child its own
  `:host{display:block;box-sizing:border-box} *,*::before,*::after{box-sizing:border-box}` and copy the slice's
  own rules; `font-family`/`font-size` inherit.
- Spacing: the shell's content wrapper needs padding (the `gen-modal` body has `padding:0`), and gaps/insets
  must be consistent across header, tabs, composer, and list rows — audit for edges touching the frame.

## 3. Use Angular to the installed version's potential
- Check `node_modules/@angular/core/package.json` first. This repo is **Angular 21** (lib major == Angular major;
  `main` is bleeding edge, `support/NN.x` are pinned lines).
- Idioms: `signal`/`computed`/`effect`/`untracked`/`linkedSignal`; `input()`/`input.required()`/`output()`/`model()`;
  `viewChild()`; `@if`/`@for`(with `track`)/`@switch` — never `*ngIf`/`*ngFor`; `inject()` (no constructor DI);
  `provideAppInitializer` (not `APP_INITIALIZER`); `DOCUMENT` from `@angular/core`; zoneless-safe (no reliance on
  `zone.run` for CD — signal writes drive it). For numeric inputs bound as bare/`"12"` attributes use
  `transform: (v) => numberAttribute(v, default)` so bare/string/bound all coerce.
- Before using an API, confirm it isn't removed/renamed in 21 (e.g. `InjectFlags` enum removed → `Injector.get`
  gets `InjectOptions`; runtime `ɵcmp` exposes `onPush:boolean`, NOT `changeDetection`).

## 4. Guard the critical (private-API) spots
- Re-verify against the **installed** `@angular/core` types every upgrade: `ɵcmp.onPush`, `ɵprov.providedIn`,
  `LView` slot `CONTEXT_INDEX`, `InternalInjectFlags` bit values, `Injector.prototype.get` (undefined on the
  abstract base — real capture is per-instance `patchInjectorInstance`), `window.ng` dev hooks.
- Keep the compat spec (`configs/angular-internals-compat.spec.ts`) green — it pins these contracts.
- Force-visible semantics: a pinned-visible token must bypass the type gates (`filterService.isForceShown` +
  early return in `_serviceMatchesFilters`), else it gets re-hidden by an off `showUser*`/`showFramework*` toggle.

## 5. Review adversarially before claiming done
- Run a **find → refute → confirm** review (parallel agents; each verifier tries HARD to REJECT). Only fix
  CONFIRMED findings; discard rejects. A behaviour change that is *intended* (documented) is not a bug.
- Common real bugs here: name-vs-normalized mismatches, keys the UI writes ≠ keys the registry reads,
  `computed(()=>Date.now())` change-tokens (same-ms collision → return a fresh `{}` instead), duplicate-add
  actions that silently no-op, `@if`-gated affordances that become unreachable in a valid state.

## 6. Verify by exercising, not asserting
- Build the library: `ng build ngx-genie` (must be 0 errors) — it type-checks templates too.
- Drive the REAL overlay in a browser: open the demo, press **F1**, navigate to the feature. The overlay is
  ShadowDom, so pierce it with a recursive `walk(root){ for el of root.querySelectorAll('*'){ yield el; if
  el.shadowRoot yield* walk(el.shadowRoot) } }` to click/inspect. Confirm **0 console errors**; measure
  `getBoundingClientRect()` for layout claims. Zoneless re-renders are async — set a signal, then read/screenshot
  on the next turn.
- Known caveat: the modal lives inside the overlay window which has a `transform`, so a `position:fixed` backdrop
  is relative to that window (not the viewport) — full mobile responsiveness needs the window to be responsive or
  the modal portalled to `body`.
- Don't `git commit`/`push` unless explicitly asked; leave changes on the working tree.
