import { Injectable, computed, signal } from '@angular/core';
import {
  ChangelogEntry,
  ConfigOption,
  DocSection,
  FaqItem,
  MechanismStep,
  RoadmapPhase,
  Testimonial,
} from '../models/content.model';

/**
 * Static editorial content for the marketing site. Everything is exposed as
 * signals so pages compose it reactively and derive views (e.g. FAQ tags).
 */
@Injectable({ providedIn: 'root' })
export class ContentService {
  readonly mechanism = signal<MechanismStep[]>([
    { index: 1, title: 'Intercept', description: 'A single instrumented seam observes every dependency resolution as it happens — no code changes in your app.', icon: 'bolt', accent: 'var(--cyan)' },
    { index: 2, title: 'Reconstruct', description: 'Element & environment injectors are walked to rebuild the hidden dependency graph behind the component tree.', icon: 'sitemap', accent: 'var(--indigo)' },
    { index: 3, title: 'Normalise', description: 'Nodes and edges are stored in a flat, weak-referenced model — leak-free, GC-friendly, instantly filterable.', icon: 'layers', accent: 'var(--violet)' },
    { index: 4, title: 'Visualise', description: 'Six OnPush, signal-driven views render the graph — from trees to a force-directed constellation.', icon: 'sparkles', accent: 'var(--magenta)' },
  ]);

  readonly faqs = signal<FaqItem[]>([
    { id: 'prod', question: 'Does GenieOS ship to production?', answer: 'No. It is a dev-only tool installed as a devDependency. In production builds the overlay is inert and tree-shaken away.', tag: 'General' },
    { id: 'perf', question: 'Will it slow my app down?', answer: 'The interception adds minimal synchronous overhead and all heavy graph work runs inside Web Workers or during idle time. The UI is OnPush + signals end to end.', tag: 'Performance' },
    { id: 'versions', question: 'Which Angular versions are supported?', answer: 'Angular 21 is the current recommended line, with maintained support branches down to Angular 17.', tag: 'Compatibility' },
    { id: 'private-api', question: 'Does it rely on private Angular APIs?', answer: 'Yes — by design. All access to internal APIs is centralised and re-verified on every Angular upgrade, guarded by a compatibility test suite.', tag: 'Internals' },
    { id: 'standalone', question: 'Do I need NgModules?', answer: 'Not at all. provideGenie() is a standalone provider. A GenieModule.forRoot() shim exists for legacy NgModule apps.', tag: 'Setup' },
    { id: 'leaks', question: 'Can it cause memory leaks?', answer: 'No. GenieOS holds only weak references to Angular objects, so the garbage collector can reclaim destroyed components and injectors freely.', tag: 'Internals' },
  ]);

  readonly faqTags = computed(() => ['All', ...new Set(this.faqs().map((f) => f.tag))]);

  readonly testimonials = signal<Testimonial[]>([
    { author: 'A. Kowalska', role: 'Staff Engineer', quote: 'The constellation view found a circular provider we chased for a week in about ten seconds.', accent: 'var(--violet)' },
    { author: 'M. Chen', role: 'Angular Architect', quote: 'Finally a DI tool that treats injectors as first-class citizens. The org chart is gorgeous.', accent: 'var(--cyan)' },
    { author: 'R. Silva', role: 'Frontend Lead', quote: 'Zero config, press F1, understand the whole app. It reads like magic and runs like nothing.', accent: 'var(--magenta)' },
  ]);

  readonly roadmap = signal<RoadmapPhase[]>([
    { quarter: 'Shipped', title: 'The six views', status: 'shipped', items: [{ text: 'Tree, Org-chart, Matrix', done: true }, { text: 'Constellation + Diagnostics', done: true }, { text: 'Live signal inspector', done: true }] },
    { quarter: 'Now', title: 'Angular 21 line', status: 'in-progress', items: [{ text: 'v21 DI-internals fixes', done: true }, { text: 'Compatibility test suite', done: true }, { text: 'Enterprise graph perf', done: false }] },
    { quarter: 'Next', title: 'Time travel', status: 'planned', items: [{ text: 'Snapshot & diff graphs', done: false }, { text: 'Record/replay resolutions', done: false }, { text: 'Export to JSON', done: false }] },
  ]);

  readonly changelog = signal<ChangelogEntry[]>([
    { version: '21.2.13', date: '2026-07', kind: 'perf', notes: ['Enterprise graph rendering optimised', 'Constellation packing stabilised'] },
    { version: '21.2.12', date: '2026-06', kind: 'feature', notes: ['Angular 21.2 upgrade', 'Huge-graph safety modes'] },
    { version: '21.0.0', date: '2026-05', kind: 'feature', notes: ['First Angular 21 release', 'Deferred registry enrichment'] },
  ]);

  readonly configOptions = signal<ConfigOption[]>([
    { name: 'hotkey', type: 'string', default: "'F1'", description: 'Keyboard shortcut that toggles the overlay.' },
    { name: 'enabled', type: 'boolean', default: 'true', description: 'Master switch — disable to bail out entirely.' },
    { name: 'visibleOnStart', type: 'boolean', default: 'true', description: 'Whether the overlay is open when the app boots.' },
  ]);

  readonly docs = signal<DocSection[]>([
    { id: 'install', title: 'Installation', icon: 'download', body: 'Install GenieOS as a dev dependency. It adds zero cost to your production bundle.', code: 'npm install ngx-genie --save-dev', lang: 'bash' },
    { id: 'configure', title: 'Configuration', icon: 'settings', body: 'Register the standalone provider in your application config and tweak the options to taste.', code: "import { provideGenie } from 'ngx-genie';\n\nexport const appConfig = {\n  providers: [\n    provideGenie({\n      hotkey: 'F1',\n      enabled: true,\n      visibleOnStart: false,\n    }),\n  ],\n};", lang: 'ts' },
    { id: 'run', title: 'Summon it', icon: 'bolt', body: 'Start your app and press the hotkey to open the observatory. Explore the tree, then jump into the constellation.', code: 'ng serve  →  press F1', lang: 'bash' },
    { id: 'ngmodule', title: 'NgModule apps', icon: 'layers', body: 'Prefer NgModules? A forRoot() shim keeps things familiar.', code: "@NgModule({\n  imports: [GenieModule.forRoot({ hotkey: 'F2' })],\n})\nexport class AppModule {}", lang: 'ts' },
  ]);
}
