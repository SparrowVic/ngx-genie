# 📥 Getting started

Install GenieOS, register it in your application, add the overlay component, and press **F1**.

← [Docs home](./README.md)

---

## Prerequisites

- **Angular 21** — fully supported and recommended. Angular 20 is also supported on the `support/20.x` line.
- GenieOS relies on **Signals** and **standalone components**, both of which Angular 21 provides out of the box.
- The inspector reads Angular's global debug hooks (`window.ng`), which are available in **development builds**. In production builds those hooks are stripped and diagnostic value is limited — see [Configuration → Development vs. production](./configuration.md#development-vs-production).

---

## Installation

Install the package as a **devDependency** — GenieOS is a developer tool and should not ship to production.

Using **npm**:

```bash
npm install ngx-genie --save-dev
```

Using **yarn**:

```bash
yarn add ngx-genie --dev
```

---

## Register GenieOS

GenieOS supports both **standalone** and **NgModule-based** applications. Pick the one that matches your app. In both cases the configuration object is a `Partial<GenieConfig>` — every field is optional and falls back to a default (see [Configuration](./configuration.md)).

### Option 1 — Standalone (recommended)

Add `provideGenie` to your application providers in `app.config.ts`:

```ts
import {ApplicationConfig} from '@angular/core';
import {provideGenie} from 'ngx-genie';

export const appConfig: ApplicationConfig = {
  providers: [
    provideGenie({
      hotkey: 'F1',          // default: 'F1'
      enabled: true,         // default: true
      visibleOnStart: false  // default: false
    })
  ]
};
```

### Option 2 — NgModule

Import `GenieModule.forRoot()` in your root `AppModule`:

```ts
import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {GenieModule} from 'ngx-genie';

import {AppComponent} from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    GenieModule.forRoot({
      hotkey: 'F1',          // default: 'F1'
      enabled: true,         // default: true
      visibleOnStart: false  // default: false
    })
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
```

---

## Add the panel component (`<ngx-genie/>`)

Registering the provider is **not enough** to show the overlay. GenieOS renders its interface through the **`<ngx-genie/>`** component, which you must place in your component tree — usually at the end of the root component's template so the overlay layers over everything.

The `<ngx-genie/>` component renders an overlay and does **not** affect your application layout, so it is safe to add globally at the `AppComponent` level.

### Standalone components

Import `GenieComponent` directly into the component that hosts the overlay:

```ts
import {Component} from '@angular/core';
import {GenieComponent} from 'ngx-genie';

@Component({
  selector: 'app-root',
  imports: [GenieComponent],
  templateUrl: './app.component.html'
})
export class AppComponent {}
```

### NgModule components

When you import `GenieModule.forRoot()`, the module already exports `GenieComponent`, so your declared components can use it without an extra import:

```ts
import {Component} from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html'
})
export class AppComponent {}
```

### Template

Add the component anywhere in the template — the end of the root template is a good default:

```html
<!-- other application components -->

<ngx-genie/>
```

---

## Open the overlay

Run the application (`ng serve`) and press **F1** (or whatever hotkey you configured). The key **toggles** the overlay open and closed. If you set `visibleOnStart: true`, GenieOS opens automatically once the application stabilizes.

---

## Next steps

- [Configuration](./configuration.md) — every option explained, hotkey formats, and how to disable GenieOS in production.
- [Feature overview](./features/README.md) — tour the Inspector, Options Panel, Views, and Diagnostics.
- [Runtime scope](./runtime-scope.md) — understand why the graph reflects the current route.
- [Troubleshooting](./troubleshooting.md) — if the panel does not appear.
