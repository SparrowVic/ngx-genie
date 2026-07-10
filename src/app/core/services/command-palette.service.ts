import { Injectable, computed, signal } from '@angular/core';
import { CommandAction } from '../models/content.model';

/**
 * ⌘K command palette store. `query` is a public writable signal so the input can
 * bind it two-way with [(ngModel)] / model-style binding; `results` and `grouped`
 * are derived.
 */
@Injectable({ providedIn: 'root' })
export class CommandPaletteService {
  private readonly _open = signal(false);
  readonly open = this._open.asReadonly();

  readonly query = signal('');

  private readonly _actions = signal<CommandAction[]>([
    { id: 'home', label: 'Go to Home', hint: 'Landing', icon: 'home', group: 'Navigate', path: '/' },
    { id: 'features', label: 'Go to Features', hint: 'The six views', icon: 'sparkles', group: 'Navigate', path: '/features' },
    { id: 'playground', label: 'Open Playground', hint: 'Live DI lab', icon: 'flask', group: 'Navigate', path: '/playground' },
    { id: 'docs', label: 'Read the Docs', hint: 'Install & config', icon: 'book', group: 'Navigate', path: '/docs' },
    { id: 'toggle-genie', label: 'Toggle GenieOS overlay', hint: 'Press F1', icon: 'bolt', group: 'Actions' },
    { id: 'theme', label: 'Switch theme', hint: 'Cosmic ⇄ Daylight', icon: 'moon', group: 'Actions' },
    { id: 'npm', label: 'Open on npm', hint: 'ngx-genie', icon: 'npm', group: 'External', external: 'https://www.npmjs.com/package/ngx-genie' },
    { id: 'github', label: 'View source on GitHub', hint: 'SparrowVic/ngx-genie', icon: 'github', group: 'External', external: 'https://github.com/SparrowVic/ngx-genie' },
  ]);
  readonly actions = this._actions.asReadonly();

  readonly results = computed(() => {
    const q = this.query().toLowerCase().trim();
    if (!q) return this._actions();
    return this._actions().filter(
      (a) => a.label.toLowerCase().includes(q) || a.hint.toLowerCase().includes(q) || a.group.toLowerCase().includes(q),
    );
  });

  readonly grouped = computed(() => {
    const map = new Map<string, CommandAction[]>();
    for (const action of this.results()) {
      const bucket = map.get(action.group) ?? [];
      bucket.push(action);
      map.set(action.group, bucket);
    }
    return [...map.entries()].map(([group, actions]) => ({ group, actions }));
  });

  readonly hasResults = computed(() => this.results().length > 0);

  openPalette(): void {
    this._open.set(true);
  }

  close(): void {
    this._open.set(false);
    this.query.set('');
  }

  toggle(): void {
    this._open() ? this.close() : this.openPalette();
  }
}
