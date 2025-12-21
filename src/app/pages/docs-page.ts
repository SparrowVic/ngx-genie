import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {CardModule} from 'primeng/card';
import {TagModule} from 'primeng/tag';
import {DividerModule} from 'primeng/divider';

@Component({
  standalone: true,
  selector: 'app-docs',
  imports: [CommonModule, CardModule, TagModule, DividerModule],
  template: `
    <div class="docs-page">
      <div class="page-hero">
        <p-tag value="Documentation" severity="info" [rounded]="true"></p-tag>
        <h1>Getting Started</h1>
        <p class="lead">
          Install GenieOS in your Angular application and start inspecting your DI tree in minutes.
        </p>
      </div>

      <div class="docs-content">
        <section class="doc-section">
          <h2>📦 Installation</h2>
          <p>Install GenieOS via npm or yarn:</p>

          <div class="code-block">
            <div class="code-header">
              <span>npm</span>
              <button class="copy-btn" title="Copy to clipboard">
                <i class="pi pi-copy"></i>
              </button>
            </div>
            <pre><code>npm install ngx-genie --save-dev</code></pre>
          </div>

          <div class="code-block">
            <div class="code-header">
              <span>yarn</span>
              <button class="copy-btn" title="Copy to clipboard">
                <i class="pi pi-copy"></i>
              </button>
            </div>
            <pre><code>yarn add ngx-genie --dev</code></pre>
          </div>
        </section>

        <p-divider></p-divider>

        <section class="doc-section">
          <h2>⚡ Setup (Standalone Apps)</h2>
          <p>For standalone Angular applications, use <code>provideGenie()</code> in your app config:</p>

          <div class="code-block">
            <div class="code-header">
              <span>app.config.ts</span>
            </div>
            <pre><code>import {{ '{' }} ApplicationConfig {{ '}' }} from '&#64;angular/core';
import {{ '{' }} provideGenie {{ '}' }} from 'ngx-genie';

export const appConfig: ApplicationConfig = {{ '{' }}
              providers: [
    provideGenie({{ '{' }}
              hotkey: 'F1',           // Keyboard shortcut (default: 'F1')
      enabled: true,          // Enable/disable GenieOS (default: true)
      visibleOnStart: false   // Show on app load (default: false)
              {{ '}' }})
  ]
              {{ '}' }};</code></pre>
          </div>
        </section>

        <p-divider></p-divider>

        <section class="doc-section">
          <h2>🏗️ Setup (NgModule Apps)</h2>
          <p>For NgModule-based applications, import <code>GenieModule</code>:</p>

          <div class="code-block">
            <div class="code-header">
              <span>app.module.ts</span>
            </div>
            <pre><code>import {{ '{' }} NgModule {{ '}' }} from '&#64;angular/core';
import {{ '{' }} GenieModule {{ '}' }} from 'ngx-genie';

&#64;NgModule({{ '{' }}
              imports: [
    GenieModule.forRoot({{ '{' }}
              hotkey: 'F1',
      enabled: true,
      visibleOnStart: false
              {{ '}' }})
  ]
              {{ '}' }})
export class AppModule {{ '{' }} {{ '}' }}</code></pre>
          </div>
        </section>

        <p-divider></p-divider>

        <section class="doc-section">
          <h2>🚀 Usage</h2>
          <p>That's it! GenieOS is now installed. Press <kbd>F1</kbd> (or your configured hotkey) to toggle the
            inspector.</p>

          <div class="feature-grid">
            <div class="feature-box">
              <div class="feature-box-icon">⌨️</div>
              <h4>Keyboard Shortcut</h4>
              <p>Press <kbd>F1</kbd> anywhere in your app to toggle GenieOS</p>
            </div>

            <div class="feature-box">
              <div class="feature-box-icon">🎯</div>
              <h4>Choose a View</h4>
              <p>Select from 5 visualization modes in the viewport toolbar</p>
            </div>

            <div class="feature-box">
              <div class="feature-box-icon">🔍</div>
              <h4>Inspect & Filter</h4>
              <p>Click components to inspect, use filters to focus</p>
            </div>

            <div class="feature-box">
              <div class="feature-box-icon">📊</div>
              <h4>Run Diagnostics</h4>
              <p>Switch to Diagnostics view to check app health</p>
            </div>
          </div>
        </section>

        <p-divider></p-divider>

        <section class="doc-section">
          <h2>⚙️ Configuration Options</h2>

          <div class="config-table">
            <div class="config-row">
              <div class="config-name">
                <code>hotkey</code>
                <span class="config-type">string | null</span>
              </div>
              <div class="config-desc">
                <p>Keyboard shortcut to toggle GenieOS visibility.</p>
                <p class="config-default">Default: <code>'F1'</code></p>
                <p class="config-note">Set to <code>null</code> to disable keyboard shortcut.</p>
              </div>
            </div>

            <div class="config-row">
              <div class="config-name">
                <code>enabled</code>
                <span class="config-type">boolean</span>
              </div>
              <div class="config-desc">
                <p>Master switch to enable/disable GenieOS entirely.</p>
                <p class="config-default">Default: <code>true</code></p>
                <p class="config-note">Useful for disabling in production builds.</p>
              </div>
            </div>

            <div class="config-row">
              <div class="config-name">
                <code>visibleOnStart</code>
                <span class="config-type">boolean</span>
              </div>
              <div class="config-desc">
                <p>Whether GenieOS panel should be visible when the app loads.</p>
                <p class="config-default">Default: <code>false</code></p>
                <p class="config-note">Set to <code>true</code> for debugging during development.</p>
              </div>
            </div>
          </div>
        </section>

        <p-divider></p-divider>

        <section class="doc-section">
          <h2>🏭 Production Builds</h2>

          <div class="warning-box">
            <div class="warning-icon">⚠️</div>
            <div>
              <h4>Important: GenieOS requires Angular DevTools APIs</h4>
              <p>
                GenieOS uses <code>window.ng</code> debug utilities which are only available when
                Angular runs in development mode. In production builds, these APIs are not available
                and GenieOS will not function.
              </p>
              <p>
                <strong>Recommendation:</strong> Install as a dev dependency and conditionally
                provide GenieOS only in development environments.
              </p>
            </div>
          </div>

          <div class="code-block">
            <div class="code-header">
              <span>Conditional Setup Example</span>
            </div>
            <pre><code>import {{ '{' }} ApplicationConfig, isDevMode {{ '}' }} from '&#64;angular/core';
import {{ '{' }} provideGenie {{ '}' }} from 'ngx-genie';

export const appConfig: ApplicationConfig = {{ '{' }}
              providers: [
    // Only provide GenieOS in development mode
    ...(isDevMode() ? [provideGenie()] : [])
  ]
              {{ '}' }};</code></pre>
          </div>
        </section>

        <p-divider></p-divider>

        <section class="doc-section">
          <h2>🌐 Browser Compatibility</h2>
          <p>GenieOS works in all modern browsers that support:</p>
          <ul class="compatibility-list">
            <li><i class="pi pi-check"></i> ES2020+ JavaScript features</li>
            <li><i class="pi pi-check"></i> Web Workers (for Constellation & Matrix views)</li>
            <li><i class="pi pi-check"></i> Canvas API (for Matrix view)</li>
            <li><i class="pi pi-check"></i> Shadow DOM (for style encapsulation)</li>
          </ul>

          <div class="browser-grid">
            <div class="browser-item">
              <div class="browser-icon">🌐</div>
              <div>Chrome</div>
              <p-tag value="Supported" severity="success"></p-tag>
            </div>
            <div class="browser-item">
              <div class="browser-icon">🦊</div>
              <div>Firefox</div>
              <p-tag value="Supported" severity="success"></p-tag>
            </div>
            <div class="browser-item">
              <div class="browser-icon">🧭</div>
              <div>Safari</div>
              <p-tag value="Supported" severity="success"></p-tag>
            </div>
            <div class="browser-item">
              <div class="browser-icon">⚡</div>
              <div>Edge</div>
              <p-tag value="Supported" severity="success"></p-tag>
            </div>
          </div>
        </section>

        <p-divider></p-divider>

        <section class="doc-section">
          <h2>🎯 Next Steps</h2>

          <div class="next-steps-grid">
            <p-card class="next-step-card">
              <h4>Explore Features</h4>
              <p>Learn about all 5 visualization modes and advanced filtering</p>
              <a href="#/features" class="next-link">View Features →</a>
            </p-card>

            <p-card class="next-step-card">
              <h4>Try the Playground</h4>
              <p>Open GenieOS in this very application and explore</p>
              <a href="#/playground" class="next-link">Try Playground →</a>
            </p-card>

            <p-card class="next-step-card">
              <h4>View on GitHub</h4>
              <p>Check out the source code and contribute</p>
              <a href="https://github.com" class="next-link" target="_blank">GitHub →</a>
            </p-card>
          </div>
        </section>
      </div>
    </div>
  `
})
export class DocsPage {
}
