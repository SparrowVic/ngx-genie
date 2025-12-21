import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { AccordionModule } from 'primeng/accordion';

@Component({
  standalone: true,
  selector: 'app-features',
  imports: [CommonModule, RouterLink, CardModule, TagModule, ButtonModule, AccordionModule],
  template: `
    <div class="features-page">
      <div class="page-hero">
        <p-tag value="Features" severity="info" [rounded]="true"></p-tag>
        <h1>Five Ways to Visualize Your App</h1>
        <p class="lead">
          Choose the perfect view for your workflow. From classic trees to force-directed graphs,
          GenieOS adapts to how you think.
        </p>
      </div>

      <!-- Tree View -->
      <section id="tree" class="feature-showcase">
        <div class="showcase-content">
          <div class="showcase-header">
            <div class="showcase-icon tree-icon">🌳</div>
            <div>
              <h2>Tree View</h2>
              <p class="showcase-subtitle">Classic hierarchical component tree</p>
            </div>
          </div>

          <div class="showcase-body">
            <p class="showcase-description">
              The most familiar way to explore your application structure. Collapse and expand nodes,
              see provider counts at a glance, and navigate deep component hierarchies with ease.
            </p>

            <div class="feature-list">
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Collapsible tree nodes for deep hierarchies</span>
              </div>
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Provider count badges on each node</span>
              </div>
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Color-coded by component type</span>
              </div>
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Group similar siblings to reduce noise</span>
              </div>
            </div>

            <div class="code-example">
              <div class="code-header">
                <span>Typical Tree Structure</span>
              </div>
              <pre><code>AppComponent
├── HeaderComponent (3 providers)
│   ├── NavbarComponent (1 provider)
│   └── UserMenuComponent (2 providers)
├── MainComponent (5 providers)
│   ├── SidebarComponent
│   └── ContentComponent (8 providers)
└── FooterComponent</code></pre>
            </div>
          </div>
        </div>
      </section>

      <!-- Org Chart -->
      <section id="chart" class="feature-showcase alt">
        <div class="showcase-content">
          <div class="showcase-header">
            <div class="showcase-icon chart-icon">📊</div>
            <div>
              <h2>Org Chart View</h2>
              <p class="showcase-subtitle">Beautiful organizational chart layout</p>
            </div>
          </div>

          <div class="showcase-body">
            <p class="showcase-description">
              See your component hierarchy like a company org chart. Perfect for presentations,
              documentation, and getting a bird's-eye view of your application structure.
            </p>

            <div class="feature-list">
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Clean parent-child visualization</span>
              </div>
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Shows service count on each card</span>
              </div>
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Pan and zoom controls</span>
              </div>
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Export-ready visualizations</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Constellation -->
      <section id="constellation" class="feature-showcase">
        <div class="showcase-content">
          <div class="showcase-header">
            <div class="showcase-icon constellation-icon">✨</div>
            <div>
              <h2>Constellation View</h2>
              <p class="showcase-subtitle">Physics-based force-directed graph</p>
            </div>
          </div>

          <div class="showcase-body">
            <p class="showcase-description">
              Watch your application come to life with physics-based layout. Nodes repel each other naturally,
              making complex relationships easier to understand. Powered by Web Workers for smooth 60fps animation.
            </p>

            <div class="feature-list">
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Real-time physics simulation (Web Worker powered)</span>
              </div>
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Interactive pan, zoom, and focus modes</span>
              </div>
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Hover to dim unrelated nodes</span>
              </div>
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Configurable repulsion strength</span>
              </div>
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Persistent positions (saved to localStorage)</span>
              </div>
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Pause/resume physics animation</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Matrix -->
      <section id="matrix" class="feature-showcase alt">
        <div class="showcase-content">
          <div class="showcase-header">
            <div class="showcase-icon matrix-icon">🎯</div>
            <div>
              <h2>Matrix View</h2>
              <p class="showcase-subtitle">High-performance dependency matrix</p>
            </div>
          </div>

          <div class="showcase-body">
            <p class="showcase-description">
              See all dependencies at once in a beautiful matrix grid. With Matrix rain animation,
              virtual scrolling, and canvas rendering, this view handles even the largest applications.
            </p>

            <div class="feature-list">
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Matrix rain animation (like the movie!)</span>
              </div>
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Virtual scrolling for performance</span>
              </div>
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Canvas rendering with Web Worker calculations</span>
              </div>
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Zoom with Ctrl+Wheel (0.5x - 2.5x)</span>
              </div>
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Hover highlighting (row + column)</span>
              </div>
              <div class="feature-item">
                <i class="pi pi-check-circle"></i>
                <span>Color-coded by dependency type</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Diagnostics -->
      <section id="diagnostics" class="feature-showcase">
        <div class="showcase-content">
          <div class="showcase-header">
            <div class="showcase-icon diagnostics-icon">🔍</div>
            <div>
              <h2>Diagnostics View</h2>
              <p class="showcase-subtitle">Automated issue detection & scoring</p>
            </div>
          </div>

          <div class="showcase-body">
            <p class="showcase-description">
              Let GenieOS find problems for you. With 8 automated diagnostic checks, you'll catch
              architectural issues, memory leaks, and performance problems before they become critical.
            </p>

            <p-accordion [multiple]="true" styleClass="diagnostics-accordion">
              <p-accordion-panel value="0">
                <p-accordion-header>🔴 Singleton Violations</p-accordion-header>
                <p-accordion-content>
                  <p>Detects when a root service is instantiated multiple times, causing split state and bugs.</p>
                </p-accordion-content>
              </p-accordion-panel>
              <p-accordion-panel value="1">
                <p-accordion-header>⚠️ Heavy State</p-accordion-header>
                <p-accordion-content>
                  <p>Identifies services holding large arrays (>500 items) that may cause memory issues.</p>
                </p-accordion-content>
              </p-accordion-panel>
              <p-accordion-panel value="2">
                <p-accordion-header>💤 Unused Instances</p-accordion-header>
                <p-accordion-content>
                  <p>Finds services that were created but never consumed by any component.</p>
                </p-accordion-content>
              </p-accordion-panel>
              <p-accordion-panel value="3">
                <p-accordion-header>🔗 High Coupling</p-accordion-header>
                <p-accordion-content>
                  <p>Flags components/services with too many dependencies (>12), indicating poor design.</p>
                </p-accordion-content>
              </p-accordion-panel>
              <p-accordion-panel value="4">
                <p-accordion-header>🐌 Change Detection</p-accordion-header>
                <p-accordion-content>
                  <p>Detects components using Default change detection instead of OnPush.</p>
                </p-accordion-content>
              </p-accordion-panel>
              <p-accordion-panel value="5">
                <p-accordion-header>📦 Large API Surface</p-accordion-header>
                <p-accordion-content>
                  <p>Identifies services with too many public properties (>30), violating single responsibility.</p>
                </p-accordion-content>
              </p-accordion-panel>
              <p-accordion-panel value="6">
                <p-accordion-header>♻️ Circular Risk</p-accordion-header>
                <p-accordion-content>
                  <p>Detects the Injector injection pattern, which can lead to circular dependencies.</p>
                </p-accordion-content>
              </p-accordion-panel>
              <p-accordion-panel value="7">
                <p-accordion-header>🧹 Missing Cleanup</p-accordion-header>
                <p-accordion-content>
                  <p>Finds components missing ngOnDestroy, risking subscription leaks.</p>
                </p-accordion-content>
              </p-accordion-panel>
            </p-accordion>

            <div class="integrity-score-example">
              <div class="score-label">Application Integrity Score</div>
              <div class="score-value">87%</div>
              <div class="score-description">Based on 3 warnings and 0 critical issues</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Filtering -->
      <section id="filtering" class="feature-showcase alt">
        <div class="showcase-content">
          <div class="showcase-header">
            <div class="showcase-icon filter-icon">⚡</div>
            <div>
              <h2>Advanced Filtering</h2>
              <p class="showcase-subtitle">Powerful tools to focus on what matters</p>
            </div>
          </div>

          <div class="showcase-body">
            <p class="showcase-description">
              Large applications can be overwhelming. GenieOS provides sophisticated filtering to help
              you focus on exactly what you're looking for.
            </p>

            <div class="filter-categories">
              <div class="filter-category">
                <h4>Type Filters</h4>
                <div class="filter-tags">
                  <p-tag value="Services" severity="success"></p-tag>
                  <p-tag value="Components" severity="info"></p-tag>
                  <p-tag value="Pipes" severity="warn"></p-tag>
                  <p-tag value="Directives"></p-tag>
                  <p-tag value="Tokens" severity="secondary"></p-tag>
                  <p-tag value="Values"></p-tag>
                  <p-tag value="Observables" severity="danger"></p-tag>
                  <p-tag value="Signals" severity="contrast"></p-tag>
                </div>
              </div>

              <div class="filter-category">
                <h4>Pattern Matching</h4>
                <ul class="filter-list">
                  <li>Exact match</li>
                  <li>Prefix match (starts with)</li>
                  <li>Suffix match (ends with)</li>
                  <li>Regular expressions</li>
                </ul>
              </div>

              <div class="filter-category">
                <h4>Smart Filters</h4>
                <ul class="filter-list">
                  <li>Hide framework code (focus on your code)</li>
                  <li>Hide unused dependencies</li>
                  <li>Hide isolated components</li>
                  <li>Group similar siblings</li>
                  <li>Dependency count range (min/max)</li>
                  <li>Root vs local scope</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- CTA -->
      <section class="features-cta">
        <h2>Ready to Try GenieOS?</h2>
        <p>Press F1 in any Angular app to open the inspector</p>
        <p-button
          label="Get Started"
          icon="pi pi-arrow-right"
          iconPos="right"
          size="large"
          [routerLink]="['/docs']"></p-button>
      </section>
    </div>
  `
})
export class FeaturesPage {}
