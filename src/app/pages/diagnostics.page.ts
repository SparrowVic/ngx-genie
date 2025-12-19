import {CommonModule} from '@angular/common';
import {Component} from '@angular/core';
import {AccordionModule} from 'primeng/accordion';
import {DividerModule} from 'primeng/divider';
import {TagModule} from 'primeng/tag';

interface DiagnosticIssue {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  detection: string;
  suggestion: string;
  category: string;
}

@Component({
  standalone: true,
  selector: 'app-diagnostics-page',
  imports: [CommonModule, AccordionModule, DividerModule, TagModule],
  template: `
    <div class="doc-page">
      <section class="doc-section">
        <h1>Diagnostics & Issue Catalog</h1>
        <p class="lead">
          Diagnostics scans the live DI graph and highlights architectural and performance risks. Adjust rules and
          thresholds to match your team's standards.
        </p>
        <div class="doc-callout">
          <h3>Integrity score</h3>
          <p>
            The score starts at 100 and drops based on detected anomalies. Critical issues remove more points than
            warnings or info-level suggestions.
          </p>
        </div>
      </section>

      <section class="doc-section">
        <h2>Rules & thresholds</h2>
        <ul class="doc-list">
          <li><strong>Singleton violations</strong> - root services that appear multiple times.</li>
          <li><strong>Heavy state</strong> - services that hold too much data in memory.</li>
          <li><strong>High coupling</strong> - components injecting too many dependencies.</li>
          <li><strong>Large API</strong> - services with unusually large public surface.</li>
          <li><strong>Missing cleanup</strong> - subscriptions without ngOnDestroy.</li>
        </ul>
      </section>

      <section class="doc-section">
        <h2>Issue catalog</h2>
        <p-accordion value="0">
          <p-accordion-panel *ngFor="let issue of issues; let idx = index" [value]="idx">
            <p-accordion-header>
              <div class="accordion-header">
                <span>{{ issue.type }}</span>
                <p-tag
                  [value]="issue.severity"
                  [severity]="issue.severity === 'critical' ? 'danger' : issue.severity === 'warning' ? 'warn' : 'info'"
                ></p-tag>
              </div>
            </p-accordion-header>
            <p-accordion-content>
              <div class="doc-stack">
                <p><strong>Category:</strong> {{ issue.category }}</p>
                <p>{{ issue.description }}</p>
                <p><strong>Detection:</strong> {{ issue.detection }}</p>
                <p><strong>Suggestion:</strong> {{ issue.suggestion }}</p>
              </div>
            </p-accordion-content>
          </p-accordion-panel>
        </p-accordion>
      </section>

      <section class="doc-section">
        <h2>Tips for teams</h2>
        <ul class="doc-list">
          <li>Run diagnostics after filtering to user code only for a clearer signal.</li>
          <li>Review critical items weekly and add warnings to your review checklist.</li>
          <li>Export the filtered report for architecture reviews.</li>
        </ul>
      </section>
    </div>
  `
})
export class DiagnosticsPageComponent {
  issues: DiagnosticIssue[] = [
    {
      type: 'Singleton Violation',
      severity: 'critical',
      category: 'architecture',
      description: 'A root-scoped provider is instantiated multiple times, which splits shared state.',
      detection: 'Compares provider names across the registry and flags duplicates for root providers.',
      suggestion: 'Remove the service from component providers and keep it in root scope only.'
    },
    {
      type: 'Heavy State',
      severity: 'warning',
      category: 'memory',
      description: 'A service holds unusually large arrays or object graphs that can bloat memory.',
      detection: 'Estimates object size to a bounded depth and compares to the configured threshold.',
      suggestion: 'Paginate or clear caches; avoid retaining large data for long-lived services.'
    },
    {
      type: 'Unused Provider',
      severity: 'info',
      category: 'best-practice',
      description: 'A provider instance exists but is never injected by any consumer.',
      detection: 'Tracks usage count from injection events; flags providers with zero usage.',
      suggestion: 'Remove it from providers or verify it is intentionally side-effect only.'
    },
    {
      type: 'High Coupling',
      severity: 'warning',
      category: 'architecture',
      description: 'A component injects too many dependencies, making it hard to maintain.',
      detection: 'Counts dependencies for each node and compares to the coupling threshold.',
      suggestion: 'Introduce a facade or split the component into smaller pieces.'
    },
    {
      type: 'Default Change Detection',
      severity: 'info',
      category: 'performance',
      description: 'Component uses Default change detection with multiple dependencies.',
      detection: 'Reads component metadata and flags Default strategy on busy nodes.',
      suggestion: 'Switch to OnPush and rely on Signals or AsyncPipe.'
    },
    {
      type: 'Large API Surface',
      severity: 'info',
      category: 'architecture',
      description: 'Services with a large public API likely do too much.',
      detection: 'Counts public properties/methods and compares to the large API threshold.',
      suggestion: 'Split the service into smaller, focused services.'
    },
    {
      type: 'Circular Risk',
      severity: 'warning',
      category: 'architecture',
      description: 'Services that inject Injector directly often hide circular dependencies.',
      detection: 'Checks service instances for Injector references.',
      suggestion: 'Refactor dependencies to avoid Service Locator patterns.'
    },
    {
      type: 'Missing Cleanup',
      severity: 'warning',
      category: 'memory',
      description: 'Subscriptions exist but ngOnDestroy is missing.',
      detection: 'Looks for Subscription-like properties without OnDestroy implementation.',
      suggestion: 'Implement ngOnDestroy or use takeUntilDestroyed().'
    }
  ];
}
