import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GenieDependencyType } from '../../../../../models/genie-node.model';
import { GenieRegistryService } from '../../../../../services/genie-registry.service';
import {
  FilterAction,
  FilterMatchType,
  FilterRule,
  FilterStatus,
  GenFilterService,
} from '../../../../../services/filter.service';

// Re-exported so nested sub-components can import every type they need from this one module.
export type { FilterRule, FilterMatchType, FilterAction, FilterStatus } from '../../../../../services/filter.service';
export type { InternalCategory } from '../../../../../configs/angular-internals';

export type TabId = 'rules' | 'tokens' | 'framework';
export type VisibilityFilter = 'all' | 'visible' | 'hidden';

export interface TokenRow {
  name: string;
  type: GenieDependencyType;
  usageCount: number;
  hidden: boolean;
  reason: FilterStatus['reason'];
  detail?: string;
  override: GenieDependencyType | null;
  manual: boolean;
}

export interface LibraryPreset {
  label: string;
  icon: string;
  hint: string;
  rule: { type: FilterMatchType; value: string; note: string };
}

export const DEP_TYPES: readonly GenieDependencyType[] = [
  'Service', 'Component', 'Directive', 'Pipe', 'Token', 'Value', 'Observable', 'Signal', 'System',
];

export const MATCH_TYPES: readonly FilterMatchType[] = ['Exact', 'Prefix', 'Suffix', 'Regex'];

export const PRESETS: readonly LibraryPreset[] = [
  { label: 'Angular Material', icon: '🎨', hint: 'MatButton, MatIcon, …', rule: { type: 'Regex', value: '^Mat[A-Z]', note: 'Angular Material' } },
  { label: 'Angular CDK', icon: '🧱', hint: 'CdkDrag, CdkScrollable, …', rule: { type: 'Regex', value: '^Cdk[A-Z]', note: 'Angular CDK' } },
  { label: 'Ionic', icon: '⚡', hint: 'IonButton, IonContent, …', rule: { type: 'Regex', value: '^Ion[A-Z]', note: 'Ionic' } },
  { label: 'NgRx', icon: '🗄️', hint: 'Store, Effects, ActionsSubject', rule: { type: 'Regex', value: '(Store|Effects|ActionsSubject|ReducerManager)', note: 'NgRx' } },
];

/**
 * Component-scoped facade for the Advanced Internals Configuration modal. Provided in the
 * shell component (NOT root) so it lives and dies with the modal, and every nested
 * sub-component injects it to read derived state and dispatch actions — keeping each
 * sub-component thin while a single store owns the logic (and gives the DI inspector a
 * tidy component-scoped provider to visualise).
 */
@Injectable()
export class AdvancedConfigStore {
  private readonly registry = inject(GenieRegistryService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly filterService = inject(GenFilterService);

  readonly tab = signal<TabId>('rules');
  readonly search = signal('');

  // --- rule composer -------------------------------------------------------
  readonly draftValue = signal('');
  readonly draftType = signal<FilterMatchType>('Prefix');
  readonly draftAction = signal<FilterAction>('hide');
  readonly matchTypes = MATCH_TYPES;
  readonly presets = PRESETS;
  readonly flashRuleId = signal<string | null>(null);

  // --- tokens tab ----------------------------------------------------------
  readonly visibility = signal<VisibilityFilter>('all');
  readonly typeFilter = signal<GenieDependencyType | 'all'>('all');
  readonly depTypes = DEP_TYPES;

  // --- import / export -----------------------------------------------------
  readonly showIo = signal(false);
  readonly importText = signal('');
  readonly ioMessage = signal<{ ok: boolean; text: string } | null>(null);
  readonly confirmReset = signal(false);

  readonly rules = this.filterService.customRules;
  readonly categories = this.filterService.categories;
  readonly categoryHidden = this.filterService.categoryHidden;
  readonly overrides = this.filterService.overridesList;

  private readonly allItems = computed<TokenRow[]>(() => {
    const services = this.registry.services();
    const map = new Map<string, TokenRow>();
    for (const svc of services) {
      const existing = map.get(svc.label);
      if (existing) {
        existing.usageCount++;
        continue;
      }
      const status = this.filterService.checkFilterStatus(svc.label);
      map.set(svc.label, {
        name: svc.label,
        type: svc.dependencyType,
        usageCount: 1,
        hidden: status.hidden,
        reason: status.reason,
        detail: status.detail,
        override: this.filterService.getTypeOverride(svc.label),
        manual: status.reason === 'Manual',
      });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly allNames = computed(() => this.allItems().map((i) => i.name));

  readonly stats = computed(() => {
    const items = this.allItems();
    const hidden = items.filter((i) => i.hidden).length;
    return {
      total: items.length,
      visible: items.length - hidden,
      hidden,
      rules: this.rules().length,
      activeRules: this.rules().filter((r) => r.enabled).length,
      overrides: this.overrides().length,
      categoriesOn: this.categories.filter((c) => this.categoryHidden()[c.id]).length,
    };
  });

  readonly filteredTokens = computed<TokenRow[]>(() => {
    const q = this.search().toLowerCase().trim();
    const vis = this.visibility();
    const type = this.typeFilter();
    return this.allItems().filter((i) => {
      if (q && !i.name.toLowerCase().includes(q)) return false;
      if (vis === 'visible' && i.hidden) return false;
      if (vis === 'hidden' && !i.hidden) return false;
      if (type !== 'all' && i.type !== type) return false;
      return true;
    });
  });

  // --- rule composer previews ---------------------------------------------
  readonly draftTrimmed = computed(() => this.draftValue().trim());
  readonly draftValid = computed(() =>
    this.filterService.isValidRule({ type: this.draftType(), value: this.draftTrimmed() }),
  );
  readonly draftMatchCount = computed(() => {
    if (!this.draftValid()) return 0;
    return this.filterService.matchCount({ type: this.draftType(), value: this.draftTrimmed() }, this.allNames());
  });
  readonly draftRegexError = computed(() => {
    const value = this.draftTrimmed();
    if (this.draftType() !== 'Regex' || !value) return null;
    try {
      new RegExp(value);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Invalid regular expression';
    }
  });

  categoryCount(id: string): number {
    return this.categories.find((c) => c.id === id)?.names.length ?? 0;
  }

  ruleMatchCount(rule: FilterRule): number {
    return this.filterService.matchCount(rule, this.allNames());
  }

  // --- actions: rules ------------------------------------------------------
  addRule(): void {
    const created = this.filterService.addRule({
      type: this.draftType(),
      value: this.draftValue(),
      action: this.draftAction(),
    });
    if (created) {
      this.draftValue.set('');
      this.flash(created.id);
    } else {
      this.ioMessage.set({ ok: false, text: 'That rule already exists.' });
    }
  }

  applyPreset(preset: LibraryPreset): void {
    const created = this.filterService.addRule({
      type: preset.rule.type,
      value: preset.rule.value,
      action: 'hide',
      note: preset.rule.note,
    });
    this.tab.set('rules');
    if (created) {
      this.flash(created.id);
    } else {
      this.ioMessage.set({ ok: false, text: `“${preset.label}” rule is already added.` });
    }
  }

  toggleRule(id: string): void { this.filterService.toggleRule(id); }
  removeRule(id: string): void { this.filterService.removeRule(id); }
  moveRule(id: string, direction: -1 | 1): void { this.filterService.moveRule(id, direction); }

  // --- actions: tokens -----------------------------------------------------
  hideToken(name: string): void { this.filterService.toggleManualState(name, true); }
  showToken(name: string): void { this.filterService.toggleManualState(name, false); }
  clearToken(name: string): void { this.filterService.clearManualState(name); }

  alwaysHide(name: string): void {
    const created = this.filterService.addRule({ type: 'Exact', value: name, action: 'hide' });
    this.ioMessage.set(
      created
        ? { ok: true, text: `Added a rule to always hide “${name}”.` }
        : { ok: false, text: `A rule for “${name}” already exists.` },
    );
    if (created) this.flash(created.id);
  }

  setType(name: string, value: string): void {
    this.filterService.overrideTokenType(name, value === 'auto' ? null : (value as GenieDependencyType));
  }

  // --- actions: categories -------------------------------------------------
  toggleCategory(id: string): void { this.filterService.toggleCategory(id); }

  // --- actions: import / export / reset ------------------------------------
  get exportText(): string { return this.filterService.exportConfig(); }

  copyExport(): void {
    if (!this.isBrowser) return;
    navigator.clipboard?.writeText(this.exportText).then(
      () => this.ioMessage.set({ ok: true, text: 'Configuration copied to clipboard' }),
      () => this.ioMessage.set({ ok: false, text: 'Clipboard unavailable' }),
    );
  }

  doImport(): void {
    const result = this.filterService.importConfig(this.importText());
    if (result.ok) {
      this.ioMessage.set({ ok: true, text: 'Configuration imported' });
      this.importText.set('');
    } else {
      this.ioMessage.set({ ok: false, text: result.error ?? 'Import failed' });
    }
  }

  requestReset(): void { this.confirmReset.set(true); }
  cancelReset(): void { this.confirmReset.set(false); }
  confirmResetNow(): void {
    this.filterService.resetToDefaults();
    this.confirmReset.set(false);
    this.ioMessage.set({ ok: true, text: 'Reset to defaults' });
  }

  toggleIo(): void { this.showIo.update((v) => !v); }
  setTab(tab: TabId): void { this.tab.set(tab); }

  private flash(id: string): void {
    this.flashRuleId.set(id);
    if (!this.isBrowser) return;
    setTimeout(() => {
      if (this.flashRuleId() === id) this.flashRuleId.set(null);
    }, 1600);
  }
}
