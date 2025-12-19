import {CommonModule} from '@angular/common';
import {Component} from '@angular/core';
import {DividerModule} from 'primeng/divider';

@Component({
  standalone: true,
  selector: 'app-architecture-page',
  imports: [CommonModule, DividerModule],
  template: `
    <div class="doc-page">
      <section class="doc-section">
        <h1>Architecture Overview</h1>
        <p class="lead">
          GenieOS is a runtime tool that observes Angular's DI internals instead of parsing source code. This
          section explains the main layers and the trade-offs.
        </p>
      </section>

      <section class="doc-section">
        <h2>Core layers</h2>
        <div class="doc-grid">
          <div class="doc-card">
            <h3>Interception</h3>
            <p>
              GenieRegistryService patches <code>Injector.prototype.get</code> to capture dependency resolution
              events and register providers.
            </p>
          </div>
          <div class="doc-card">
            <h3>State Management</h3>
            <p>
              ExplorerState transforms raw nodes into trees, matrices, and filtered views using Angular Signals.
            </p>
          </div>
          <div class="doc-card">
            <h3>Presentation</h3>
            <p>
              The overlay UI runs with OnPush change detection and isolated rendering to avoid impacting the host
              app.
            </p>
          </div>
        </div>
      </section>

      <section class="doc-section">
        <h2>Interception mechanism</h2>
        <ul class="doc-list">
          <li>Monkey-patches <code>Injector.get</code> to observe real dependency resolutions.</li>
          <li>Scans component trees after <code>ApplicationRef.isStable</code>.</li>
          <li>Uses <code>window.ng</code> debug hooks to map DOM nodes to injectors.</li>
          <li>Decodes DI flags like @Optional and @SkipSelf.</li>
        </ul>
      </section>

      <section class="doc-section">
        <h2>Data structures</h2>
        <ul class="doc-list">
          <li>Nodes, services, and dependencies are stored in normalized lists.</li>
          <li>WeakMap references prevent memory leaks during long sessions.</li>
          <li>Derived views (tree, matrix, constellations) are computed from signals.</li>
        </ul>
      </section>

      <section class="doc-section">
        <h2>Performance strategy</h2>
        <ul class="doc-list">
          <li>OnPush components across the overlay.</li>
          <li>Web workers for heavy matrix calculations.</li>
          <li>Deferred scanning to avoid blocking app startup.</li>
        </ul>
      </section>

      <section class="doc-section">
        <h2>Limitations & risks</h2>
        <ul class="doc-list">
          <li>Requires development mode; production builds hide debug hooks.</li>
          <li>Relies on Angular internals (private APIs) that can change between versions.</li>
          <li>Heuristic diagnostics can produce false positives; always verify manually.</li>
        </ul>
      </section>
    </div>
  `
})
export class ArchitecturePageComponent {}
