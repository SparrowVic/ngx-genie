import {CommonModule} from '@angular/common';
import {Component} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {DividerModule} from 'primeng/divider';
import {InputTextModule} from 'primeng/inputtext';
import {ToggleSwitchModule} from 'primeng/toggleswitch';

@Component({
  standalone: true,
  selector: 'app-getting-started-page',
  imports: [CommonModule, FormsModule, RouterLink, DividerModule, InputTextModule, ToggleSwitchModule],
  template: `
    <div class="doc-page">
      <section class="doc-section">
        <h1>Getting Started</h1>
        <p class="lead">
          GenieOS works in development mode as an overlay. Configure the provider, add the component once, and
          press <strong>F1</strong> to open the panel.
        </p>
      </section>

      <section class="doc-section">
        <h2>1. Install</h2>
        <div class="doc-code">
          <pre><code>npm install ngx-genie --save-dev
# or
yarn add ngx-genie --dev</code></pre>
        </div>
      </section>

      <section class="doc-section">
        <h2>2. Configure the provider</h2>
        <p>
          Use <code>provideGenie</code> in your <code>app.config.ts</code>. The snippet below updates live based on
          your choices.
        </p>
        <div class="doc-grid">
          <div class="doc-card">
            <div class="form-grid">
              <label class="form-label">Hotkey</label>
              <input pInputText [(ngModel)]="hotkey"/>

              <label class="form-label">Enabled</label>
              <p-toggleswitch [(ngModel)]="enabled"></p-toggleswitch>

              <label class="form-label">Visible on start</label>
              <p-toggleswitch [(ngModel)]="visibleOnStart"></p-toggleswitch>
            </div>
          </div>
          <div class="doc-code">
            <pre><code>{{ providerSnippet }}</code></pre>
          </div>
        </div>
      </section>

      <section class="doc-section">
        <h2>3. Add the overlay component</h2>
        <p>
          Add the <code>&lt;ngx-genie /&gt;</code> component once in your root template. It renders as an overlay and
          does not affect layout.
        </p>
        <div class="doc-code">
          <pre><code>import &#123;GenieComponent&#125; from 'ngx-genie';

&#64;Component(&#123;
  standalone: true,
  imports: [GenieComponent]
&#125;)
export class AppComponent &#123;&#125;

// app.component.html
&lt;ngx-genie /&gt;</code></pre>
        </div>
      </section>

      <section class="doc-section">
        <h2>4. Troubleshooting</h2>
        <ul class="doc-list">
          <li>GenieOS relies on <code>window.ng</code>, so it only works in dev builds.</li>
          <li>If the panel does not appear, check that the app reaches <code>ApplicationRef.isStable</code>.</li>
          <li>Matrix view may not expose service instances; use Tree view instead.</li>
        </ul>
      </section>

      <section class="doc-section">
        <h2>Next steps</h2>
        <p>
          Explore <a routerLink="/views">Views & Visualizations</a> to learn how each perspective helps during
          debugging.
        </p>
      </section>
    </div>
  `
})
export class GettingStartedPageComponent {
  hotkey = 'F1';
  enabled = true;
  visibleOnStart = true;

  get providerSnippet(): string {
    const safeHotkey = this.hotkey || 'F1';
    return `import {provideGenie} from 'ngx-genie';

export const appConfig = {
  providers: [
    provideGenie({
      hotkey: '${safeHotkey}',
      enabled: ${this.enabled},
      visibleOnStart: ${this.visibleOnStart}
    })
  ]
};`;
  }
}
