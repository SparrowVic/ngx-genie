import { Injectable, computed, inject, signal } from '@angular/core';
import {
  ConfigOption,
  DocSection,
  FaqItem,
  MechanismStep,
  RoadmapPhase,
} from '../models/content.model';
import { HotkeyService } from './hotkey.service';

/**
 * Static editorial content for the marketing site. Everything is exposed as
 * signals so pages compose it reactively and derive views (e.g. FAQ tags).
 * Copy that mentions the overlay hotkey is derived from {@link HotkeyService} so
 * it always matches the app's configured key.
 */
@Injectable({ providedIn: 'root' })
export class ContentService {
  private readonly hotkey = inject(HotkeyService);

  readonly mechanism = signal<MechanismStep[]>([
    { index: 1, title: 'Intercept', description: 'A single instrumented seam observes every dependency resolution as it happens — no code changes in your app.', icon: 'bolt', accent: 'var(--cyan)' },
    { index: 2, title: 'Reconstruct', description: 'Element & environment injectors are walked to rebuild the hidden dependency graph behind the component tree.', icon: 'sitemap', accent: 'var(--indigo)' },
    { index: 3, title: 'Normalise', description: 'Nodes and edges are stored in a flat, weak-referenced model — leak-free, GC-friendly, instantly filterable.', icon: 'layers', accent: 'var(--violet)' },
    { index: 4, title: 'Visualise', description: 'Six OnPush, signal-driven views render the graph — from trees to a force-directed constellation.', icon: 'sparkles', accent: 'var(--magenta)' },
  ]);

  readonly faqs = computed<FaqItem[]>(() => [
    { id: 'what', question: 'What does GenieOS actually show me?', answer: 'It reconstructs your app\'s hidden dependency-injection graph and renders it across six views — an injector Tree, Org Chart, Matrix, force-directed Constellation, Diagnostics and a Live Inspector. Every provider is classified into one of nine kinds (Service, Pipe, Directive, Component, Token, Value, Observable, Signal or System) so you can see exactly what Angular wired up, and where.', tag: 'General' },
    { id: 'setup', question: 'How much setup does it need?', answer: `Two lines. Add provideGenie() to your application providers and drop <ngx-genie/> into your root template. Press ${this.hotkey.key} and the observatory opens — no configuration required.`, tag: 'Setup' },
    { id: 'standalone', question: 'Do I need NgModules?', answer: 'No. provideGenie() is a standalone provider that slots straight into a standalone bootstrap. Prefer NgModules? A GenieModule.forRoot() shim gives you the exact same thing.', tag: 'Setup' },
    { id: 'license', question: 'Is it free to use?', answer: 'Yes — free to use in personal and commercial projects alike. GenieOS is source-available under the MIT License with the Commons Clause; the only limit is that you cannot sell it (or a paid product/service whose value derives substantially from it).', tag: 'General' },
    { id: 'perf', question: 'Will it slow my app down?', answer: 'No. The UI is OnPush and signal-driven from end to end, and the two heaviest views — Matrix and Constellation — run their layout math in dedicated Web Workers, off the main thread. It only does work while the overlay is actually open.', tag: 'Performance' },
    { id: 'memory', question: 'Can it leak memory?', answer: 'No. GenieOS holds only weak references to Angular objects, so the garbage collector can reclaim destroyed components and injectors freely. Its event buffer is bounded and dropped the moment you close the overlay.', tag: 'Performance' },
    { id: 'versions', question: 'Which Angular versions are supported?', answer: 'GenieOS targets the Angular 18 line — its peer dependency is ^18. Older majors stay maintained on long-lived support branches, so Angular 18 through 22 are supported — each published as its own version-tagged release on npm.', tag: 'Compatibility' },
    { id: 'private-api', question: 'Does it rely on private Angular APIs?', answer: 'Yes — by design. Reading the framework\'s internal debug data is the only way to reconstruct the injector graph. All internal access is centralised in one place and locked down by a private-internals compatibility spec (part of 450+ unit tests) that re-verifies it on every Angular upgrade.', tag: 'Internals' },
    { id: 'prod', question: 'Does it work in production?', answer: 'It is a development tool. GenieOS reads Angular\'s dev-mode debug hooks on window.ng, which optimized production builds strip out — so in a prod build the overlay is inert and tree-shaken away, adding zero runtime cost.', tag: 'General' },
  ]);

  readonly faqTags = computed(() => ['All', ...new Set(this.faqs().map((f) => f.tag))]);

  readonly roadmap = signal<RoadmapPhase[]>([
    { quarter: 'Shipped', title: 'The six views', status: 'shipped', items: [{ text: 'Tree, Org-chart, Matrix', done: true }, { text: 'Constellation + Diagnostics', done: true }, { text: 'Live signal inspector', done: true }] },
    { quarter: 'Now', title: 'Angular 18 line', status: 'in-progress', items: [{ text: 'DI-internals fixes', done: true }, { text: 'Compatibility test suite', done: true }, { text: 'Enterprise graph perf', done: true }, { text: 'Export filtered tree to JSON', done: true }, { text: '18.0.0-beta.2 on npm', done: false }] },
    { quarter: 'Next', title: 'Time travel', status: 'planned', items: [{ text: 'Snapshot & diff graphs', done: false }, { text: 'Record/replay resolutions', done: false }] },
  ]);

  readonly configOptions = signal<ConfigOption[]>([
    { name: 'hotkey', type: 'string', default: "'F1'", description: 'Keyboard shortcut that toggles the overlay.' },
    { name: 'enabled', type: 'boolean', default: 'true', description: 'Master switch — disable to bail out entirely.' },
    { name: 'visibleOnStart', type: 'boolean', default: 'false', description: 'Whether the overlay is open when the app boots.' },
  ]);

  readonly docs = computed<DocSection[]>(() => [
    // The Installation section renders an interactive package-manager picker
    // (app-docs-install) instead of a static code block, so it carries no `code`.
    { id: 'install', title: 'Installation', icon: 'download', body: 'Install GenieOS as a dev dependency. It adds zero cost to your production bundle.' },
    { id: 'configure', title: 'Configuration', icon: 'settings', body: 'Register the standalone provider in your application config and tweak the options to taste.', code: `import { provideGenie } from 'ngx-genie';\n\nexport const appConfig = {\n  providers: [\n    provideGenie({\n      hotkey: '${this.hotkey.key}',\n      enabled: true,\n      visibleOnStart: false,\n    }),\n  ],\n};`, lang: 'ts' },
    { id: 'run', title: 'Summon it', icon: 'bolt', body: 'Start your app and press the hotkey to open the observatory. Explore the tree, then jump into the constellation.', code: `ng serve  →  press ${this.hotkey.key}`, lang: 'bash' },
    // The NgModule example intentionally shows a *different* key (F2) to illustrate
    // that the hotkey is configurable — leave it literal.
    { id: 'ngmodule', title: 'NgModule apps', icon: 'layers', body: 'Prefer NgModules? A forRoot() shim keeps things familiar.', code: "@NgModule({\n  imports: [GenieModule.forRoot({ hotkey: 'F2' })],\n})\nexport class AppModule {}", lang: 'ts' },
  ]);
}
