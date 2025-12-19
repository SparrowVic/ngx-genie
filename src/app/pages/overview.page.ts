import {CommonModule} from '@angular/common';
import {Component} from '@angular/core';
import {RouterLink} from '@angular/router';
import {DividerModule} from 'primeng/divider';
import {TagModule} from 'primeng/tag';

@Component({
  standalone: true,
  selector: 'app-overview-page',
  imports: [CommonModule, RouterLink, DividerModule, TagModule],
  template: `
    <div class="doc-page">
      <section class="doc-hero">
        <div class="doc-hero__copy">
          <span class="eyebrow">Developer Overlay</span>
          <h1>GenieOS for Angular Dependency Insight</h1>
          <p class="lead">
            GenieOS (ngx-genie) is a runtime overlay that visualizes Angular Dependency Injection as it actually
            behaves in your running app. Inspect injectors, providers, and relationships without leaving the
            browser.
          </p>
          <div class="inline-tags">
            <p-tag value="DI Graph" severity="info"></p-tag>
            <p-tag value="Live Inspector" severity="success"></p-tag>
            <p-tag value="Diagnostics" severity="warn"></p-tag>
          </div>
        </div>
        <div class="doc-card">
          <h3>At a glance</h3>
          <ul class="doc-list">
            <li>Overlay UI - press <strong>F1</strong> to open the Genie window.</li>
            <li>Five views: Tree, Org Chart, Matrix, Constellation, Diagnostics.</li>
            <li>Inspector panel with live state and injection path.</li>
            <li>Noise reduction and deep focus filters for large apps.</li>
          </ul>
        </div>
      </section>

      <p-divider></p-divider>

      <section class="doc-section">
        <h2>What Genie watches</h2>
        <p>
          GenieOS does not analyze code statically. It listens to the live Angular DI system and reconstructs the
          runtime graph. That means the data you see reflects actual instances, not assumptions.
        </p>
        <ul class="doc-list">
          <li><strong>Injectors</strong> - Environment vs Element scopes in the live tree.</li>
          <li><strong>Providers</strong> - services, tokens, directives, pipes, signals, observables.</li>
          <li><strong>Dependencies</strong> - direct resolution paths and injection flags.</li>
        </ul>
      </section>

      <section class="doc-section">
        <h2>Primary surfaces</h2>
        <div class="doc-stack">
          <div class="doc-callout">
            <h3>Views</h3>
            <p>
              Toggle between Tree, Org Chart, Matrix, and Constellation to understand structure and coupling from
              multiple perspectives.
            </p>
          </div>
          <div class="doc-callout">
            <h3>Inspector</h3>
            <p>
              Select any node or provider to inspect the resolved instance, view state snapshots, and trace the
              injection path.
            </p>
          </div>
          <div class="doc-callout">
            <h3>Diagnostics</h3>
            <p>
              Run built-in diagnostics to detect singleton violations, heavy state, unused providers, or missing
              cleanup patterns.
            </p>
          </div>
        </div>
      </section>

      <section class="doc-section">
        <h2>Quick start</h2>
        <p>
          Add the provider and the overlay component once. Run in dev mode and press <strong>F1</strong>.
        </p>
        <div class="doc-code">
          <pre>
            <code>
              import &#123;provideGenie&#125; from 'ngx-genie';

export const appConfig = &#123;
              providers: [
                provideGenie(&#123;
      hotkey: 'F1',
      enabled: true,
      visibleOnStart: true
    &#125;)
  ]
&#125;;

// In your root template
// &lt;ngx-genie /&gt;
            </code>
          </pre>
        </div>
      </section>

      <section class="doc-section">
        <h2>Where Genie fits</h2>
        <ul class="doc-list">
          <li>Onboarding - explain DI structure to new engineers.</li>
          <li>Architecture reviews - spot high coupling and singleton mistakes.</li>
          <li>Performance clinics - detect heavy state and missing cleanup.</li>
          <li>Debug sessions - inspect live provider state without extra logging.</li>
        </ul>
      </section>

      <section class="doc-section">
        <h2>Continue reading</h2>
        <p>
          Start with <a routerLink="/getting-started">Getting Started</a>, then explore the
          <a routerLink="/views">Views guide</a> and the detailed <a routerLink="/diagnostics">Diagnostics catalog</a>.
        </p>
      </section>
    </div>
  `
})
export class OverviewPageComponent {
}
