import {CommonModule} from '@angular/common';
import {Component} from '@angular/core';
import {DividerModule} from 'primeng/divider';
import {TableModule} from 'primeng/table';

@Component({
  standalone: true,
  selector: 'app-views-page',
  imports: [CommonModule, DividerModule, TableModule],
  template: `
    <div class="doc-page">
      <section class="doc-section">
        <h1>Views & Visualizations</h1>
        <p class="lead">
          GenieOS offers multiple perspectives over the same DI graph. Use them together to understand hierarchy,
          coupling, and risky patterns.
        </p>
      </section>

      <section class="doc-section">
        <h2>View comparison</h2>
        <p-table [value]="views" class="doc-table">
          <ng-template #header>
            <tr>
              <th>View</th>
              <th>Best for</th>
              <th>Highlights</th>
            </tr>
          </ng-template>
          <ng-template #body let-row>
            <tr>
              <td>{{ row.name }}</td>
              <td>{{ row.bestFor }}</td>
              <td>{{ row.highlights }}</td>
            </tr>
          </ng-template>
        </p-table>
      </section>

      <section class="doc-section">
        <h2>Legend & markings</h2>
        <div class="doc-grid">
          <div class="doc-card">
            <h3>Dependency types</h3>
            <ul class="doc-list">
              <li>SVC - Service</li>
              <li>SYS - System/Core</li>
              <li>VAL - Value/Config</li>
              <li>OBS - Observable</li>
              <li>SIG - Signal</li>
              <li>TOK - InjectionToken</li>
              <li>CMP - Component</li>
              <li>DIR - Directive</li>
              <li>PIP - Pipe</li>
            </ul>
          </div>
          <div class="doc-card">
            <h3>Flags</h3>
            <ul class="doc-list">
              <li>USED - provider is actually injected.</li>
              <li>ROOT - providedIn: 'root'.</li>
              <li>@Optional, @Self, @SkipSelf, @Host - DI resolution hints.</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="doc-section">
        <h2>Practical tips</h2>
        <ul class="doc-list">
          <li>Start in Tree view to orient yourself, then jump to Matrix for coupling.</li>
          <li>Use Constellation to discover unexpected dependency hubs.</li>
          <li>Diagnostics are most useful after you filter noise in Options.</li>
        </ul>
      </section>
    </div>
  `
})
export class ViewsPageComponent {
  views = [
    {
      name: 'Tree View',
      bestFor: 'Hierarchy and injector scopes',
      highlights: 'Element vs Environment scopes, expandable branches.'
    },
    {
      name: 'Org Chart',
      bestFor: 'Large component structures',
      highlights: 'Quickly spot dense subtrees and clusters.'
    },
    {
      name: 'Matrix',
      bestFor: 'Coupling and dependency density',
      highlights: 'Web worker powered dependency grid.'
    },
    {
      name: 'Constellation',
      bestFor: 'Relationship discovery',
      highlights: 'Force-directed graph for non-obvious links.'
    },
    {
      name: 'Diagnostics',
      bestFor: 'Architectural health checks',
      highlights: 'Detects singleton splits, heavy state, cleanup gaps.'
    }
  ];
}
