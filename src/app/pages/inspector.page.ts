import {CommonModule} from '@angular/common';
import {Component} from '@angular/core';
import {AccordionModule} from 'primeng/accordion';
import {DividerModule} from 'primeng/divider';

interface AccordionSection {
  title: string;
  body: string[];
}

@Component({
  standalone: true,
  selector: 'app-inspector-page',
  imports: [CommonModule, AccordionModule, DividerModule],
  template: `
    <div class="doc-page">
      <section class="doc-section">
        <h1>Inspector & Filters</h1>
        <p class="lead">
          The Inspector panel is your microscope. Select any node or provider and Genie shows live state, provider
          metadata, and the injection path that resolved it.
        </p>
      </section>

      <section class="doc-section">
        <h2>Workflow</h2>
        <ol class="doc-list doc-list--ordered">
          <li>Pick a node in Tree, Matrix, Org, or Constellation.</li>
          <li>Review provider list and metadata in the Inspector.</li>
          <li>Open a provider to see live state snapshot and injection path.</li>
          <li>Use Options Panel to filter noise and focus a branch.</li>
        </ol>
      </section>

      <section class="doc-section">
        <h2>Panels explained</h2>
        <p-accordion value="0">
          <p-accordion-panel *ngFor="let section of sections; let idx = index" [value]="idx">
            <p-accordion-header>{{ section.title }}</p-accordion-header>
            <p-accordion-content>
              <ul class="doc-list">
                <li *ngFor="let item of section.body">{{ item }}</li>
              </ul>
            </p-accordion-content>
          </p-accordion-panel>
        </p-accordion>
      </section>

      <section class="doc-section">
        <h2>Filter strategy</h2>
        <ul class="doc-list">
          <li>Hide Angular internals to reveal your own services first.</li>
          <li>Use Deep Focus when the tree is too wide to scan.</li>
          <li>Adjust complexity (min deps) to surface heavy components.</li>
        </ul>
      </section>
    </div>
  `
})
export class InspectorPageComponent {
  sections: AccordionSection[] = [
    {
      title: 'Inspector Panel',
      body: [
        'Shows injector scope, provider list, and filters for the selected node.',
        'Highlights provider types (Service, Token, Directive) and DI flags.',
        'Supports local search and filter sync with global options.'
      ]
    },
    {
      title: 'Provider Details',
      body: [
        'State snapshot renders as an expandable JSON tree.',
        'Signals and Observables are labeled with their current value or status.',
        'Injection path shows the exact resolution chain in the DI tree.'
      ]
    },
    {
      title: 'Options Panel',
      body: [
        'Global controls: expand/collapse tree and enable Deep Focus mode.',
        'Filter by provider type, scope (root/local), and noise reduction rules.',
        'Deep search mode lets you tag components or dependencies.'
      ]
    }
  ];
}
