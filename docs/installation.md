# 📥 Installation and Configuration of GenieOS

## Prerequisites

* **Angular:** v20
  Support for **Signals** and **Standalone Components** is required.

* **Development mode:**
  The library relies on `window.ng` and internal Angular mechanisms that are available **only in dev mode**.
  In production mode, functionality may be limited or completely disabled.

---

## Installation

Install the package:

Using **npm**:

```bash
npm install ngx-genie --save-dev
```

Using **yarn**:

```bash
yarn add ngx-genie --dev
```

> Using a `devDependency` is recommended, as the tool should not be shipped to production.

---

## Configuration (Standalone API)

GenieOS is fully compatible with the modern **`bootstrapApplication`** approach.
To enable the plugin, use the `provideGenie` function in the application providers array.

### `app.config.ts`

```ts
import {ApplicationConfig} from '@angular/core';
import {provideGenie} from 'genie';

export const appConfig: ApplicationConfig = {
  providers: [
    // ... other application providers ...

    provideGenie({
      // Hotkey for opening / closing the panel
      hotkey: 'F1',

      // Whether the panel should be visible immediately on app startup
      visibleOnStart: true,

      // Global switch to enable / disable the plugin
      enabled: true
    })
  ]
};
```

---

## 🧩 Adding the panel component (`<ngx-genie />`)

Configuring providers alone is **not sufficient** to display the GenieOS interface.

To render the debugger panel in the application, you must add the **`<ngx-genie />`** component to the component tree, typically in the **`AppComponent`**.

### Example: `app.component.ts`

If your application uses **Standalone Components**, import the GenieOS component directly:

```ts
import {Component} from '@angular/core';
import {GenieComponent} from 'genie';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GenieComponent],
  templateUrl: './app.component.html'
})
export class AppComponent {
}
```

### Example: `app.component.html`

Add the GenieOS component anywhere in the template (recommended at the end):

```html
<!-- other application components -->

<ngx-genie/>
```

> 💡 The `<ngx-genie />` component renders an **overlay layer** and does **not affect the application layout**.
> It can be safely added globally at the `AppComponent` level.

Run the application and press **F1** (or another configured hotkey).

---

## Configuration options (`GenieConfig`)

| Option           | Type      | Default | Description                                                     |
|------------------|-----------|---------|-----------------------------------------------------------------|
| `hotkey`         | `string`  | `'F1'`  | Key or key combination (e.g. `ctrl.shift.x`) to open the panel. |
| `visibleOnStart` | `boolean` | `true`  | Whether the panel opens automatically on application startup.   |
| `enabled`        | `boolean` | `true`  | Global enable / disable switch for the plugin.                  |

---

## Troubleshooting

### The panel does not appear

* Make sure the application is running in **Development** mode (`ng serve`).
* Check that the browser is not blocking scripts or access to `window.ng`.
* GenieOS listens for the `ApplicationRef.isStable` event.
  If the application never reaches a stable state (e.g. infinite async loops, `setInterval` running outside `NgZone`), the plugin may **fail to initialize**.

---

### Error: "No instance available"

If you see this error in the Inspector after clicking an element in the **Matrix** view, it is a known limitation related to **Web Workers**.

**Workaround:**
Select the same service from the **Tree View**, where the instance should be available.
