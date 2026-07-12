import { Injectable, computed, effect, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  INTERNAL_CATEGORIES,
  INTERNAL_NAME_TO_CATEGORY,
  normalizeInternalName,
} from '../configs/angular-internals';
import { GenieDependencyType } from '../models/genie-node.model';

export type FilterMatchType = 'Exact' | 'Prefix' | 'Suffix' | 'Regex';
export type FilterAction = 'hide' | 'show';

export interface FilterRule {
  id: string;
  type: FilterMatchType;
  value: string;
  enabled: boolean;
  /** 'hide' removes matches from the graph; 'show' force-keeps them (allow-list). */
  action: FilterAction;
  note?: string;
}

export interface FilterStatus {
  hidden: boolean;
  reason?: 'Manual' | 'Rule' | 'Category' | 'Visible';
  rule?: FilterRule;
  categoryId?: string;
  detail?: string;
}

export interface TypeOverrideEntry {
  token: string;
  type: GenieDependencyType;
}

const STORAGE_KEY = 'genie_filters_config';
const STORAGE_VERSION = 2;

const DEFAULT_RULES: readonly Omit<FilterRule, 'id'>[] = [];

interface PersistedState {
  version: number;
  appName: string;
  lastUpdated: number;
  customRules: FilterRule[];
  categoryHidden: Record<string, boolean>;
  manualHidden: string[];
  manualShown: string[];
  typeOverrides: Record<string, GenieDependencyType>;
}

@Injectable({ providedIn: 'root' })
export class GenFilterService {
  private platformId = inject(PLATFORM_ID);

  readonly customRules = signal<FilterRule[]>([]);
  readonly categoryHidden = signal<Record<string, boolean>>(this.defaultCategoryState());

  private readonly manualHidden = signal<Set<string>>(new Set());
  private readonly manualShown = signal<Set<string>>(new Set());
  private readonly typeOverrides = signal<Map<string, GenieDependencyType>>(new Map());

  private cache = new Map<string, FilterStatus>();
  private seq = 0;

  /** Read-only views for the UI. */
  readonly manualHiddenList = computed(() => [...this.manualHidden()]);
  readonly manualShownList = computed(() => [...this.manualShown()]);
  readonly overridesList = computed<TypeOverrideEntry[]>(() =>
    [...this.typeOverrides().entries()].map(([token, type]) => ({ token, type })),
  );
  readonly categories = INTERNAL_CATEGORIES;

  /** Bumps whenever any part of the config changes (drives registry reclassification). */
  readonly configChanged = computed(() => {
    this.customRules();
    this.categoryHidden();
    this.manualHidden();
    this.manualShown();
    this.typeOverrides();
    // Return a fresh object so the change-token bumps on EVERY config change — a
    // Date.now() token could compare equal within the same millisecond and skip a reclassify.
    return {};
  });

  constructor() {
    this.loadFromStorage();
    effect(() => {
      this.saveToStorage();
      this.cache.clear();
    });
  }

  // ---- classification ------------------------------------------------------

  checkFilterStatus(tokenName: string): FilterStatus {
    if (!tokenName) return { hidden: false, reason: 'Visible' };

    if (this.manualShown().has(tokenName)) {
      return { hidden: false, reason: 'Manual', detail: 'Pinned visible' };
    }
    if (this.manualHidden().has(tokenName)) {
      return { hidden: true, reason: 'Manual', detail: 'Hidden by you' };
    }

    for (const rule of this.customRules()) {
      if (!rule.enabled) continue;
      if (this.testRule(tokenName, rule)) {
        return {
          hidden: rule.action !== 'show',
          reason: 'Rule',
          rule,
          detail: rule.value,
        };
      }
    }

    const categoryId = INTERNAL_NAME_TO_CATEGORY.get(normalizeInternalName(tokenName));
    if (categoryId && this.categoryHidden()[categoryId]) {
      const category = INTERNAL_CATEGORIES.find((c) => c.id === categoryId);
      return { hidden: true, reason: 'Category', categoryId, detail: category?.label ?? 'Framework' };
    }

    return { hidden: false, reason: 'Visible' };
  }

  isInternal(tokenName: string): boolean {
    const cached = this.cache.get(tokenName);
    if (cached) return cached.hidden;
    const res = this.checkFilterStatus(tokenName);
    this.cache.set(tokenName, res);
    return res.hidden;
  }

  getTypeOverride(tokenName: string): GenieDependencyType | null {
    return this.typeOverrides().get(tokenName) ?? null;
  }

  /** True when a token is explicitly pinned visible (manual "show" or an enabled 'show' rule). */
  isForceShown(tokenName: string): boolean {
    if (this.manualShown().has(tokenName)) return true;
    for (const rule of this.customRules()) {
      if (rule.enabled && rule.action === 'show' && this.testRule(tokenName, rule)) return true;
    }
    return false;
  }

  testRule(name: string, rule: Pick<FilterRule, 'type' | 'value'>): boolean {
    if (!rule.value) return false;
    switch (rule.type) {
      case 'Exact':
        return name === rule.value;
      case 'Prefix':
        return name.startsWith(rule.value);
      case 'Suffix':
        return name.endsWith(rule.value);
      case 'Regex':
        try {
          return new RegExp(rule.value).test(name);
        } catch {
          return false;
        }
      default:
        return false;
    }
  }

  /** How many of the supplied names a rule would match (for live previews). */
  matchCount(rule: Pick<FilterRule, 'type' | 'value'>, names: readonly string[]): number {
    if (!rule.value) return 0;
    let count = 0;
    for (const name of names) if (this.testRule(name, rule)) count++;
    return count;
  }

  isValidRule(rule: Pick<FilterRule, 'type' | 'value'>): boolean {
    if (!rule.value.trim()) return false;
    if (rule.type === 'Regex') {
      try {
        new RegExp(rule.value);
      } catch {
        return false;
      }
    }
    return true;
  }

  // ---- rules ---------------------------------------------------------------

  addRule(input: { type: FilterMatchType; value: string; action?: FilterAction; note?: string }): FilterRule | null {
    const value = input.value.trim();
    if (!this.isValidRule({ type: input.type, value })) return null;

    const rule: FilterRule = {
      id: this.newId(),
      type: input.type,
      value,
      enabled: true,
      action: input.action ?? 'hide',
      note: input.note?.trim() || undefined,
    };

    let added: FilterRule | null = rule;
    this.customRules.update((rules) => {
      if (rules.some((r) => r.type === rule.type && r.value === rule.value && r.action === rule.action)) {
        added = null;
        return rules;
      }
      return [...rules, rule];
    });
    return added;
  }

  updateRule(id: string, patch: Partial<Omit<FilterRule, 'id'>>): void {
    this.customRules.update((rules) => rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  toggleRule(id: string): void {
    this.customRules.update((rules) => rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  }

  removeRule(id: string): void {
    this.customRules.update((rules) => rules.filter((r) => r.id !== id));
  }

  moveRule(id: string, direction: -1 | 1): void {
    this.customRules.update((rules) => {
      const index = rules.findIndex((r) => r.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= rules.length) return rules;
      const next = [...rules];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  // ---- manual overrides ----------------------------------------------------

  toggleManualState(tokenName: string, forceHide: boolean): void {
    this.manualHidden.update((s) => {
      const n = new Set(s);
      if (forceHide) n.add(tokenName);
      else n.delete(tokenName);
      return n;
    });
    this.manualShown.update((s) => {
      const n = new Set(s);
      if (!forceHide) n.add(tokenName);
      else n.delete(tokenName);
      return n;
    });
  }

  clearManualState(tokenName: string): void {
    this.manualHidden.update((s) => {
      if (!s.has(tokenName)) return s;
      const n = new Set(s);
      n.delete(tokenName);
      return n;
    });
    this.manualShown.update((s) => {
      if (!s.has(tokenName)) return s;
      const n = new Set(s);
      n.delete(tokenName);
      return n;
    });
  }

  overrideTokenType(tokenName: string, newType: GenieDependencyType | null): void {
    this.typeOverrides.update((map) => {
      const n = new Map(map);
      if (newType) n.set(tokenName, newType);
      else n.delete(tokenName);
      return n;
    });
  }

  // ---- categories ----------------------------------------------------------

  setCategoryHidden(id: string, hidden: boolean): void {
    this.categoryHidden.update((state) => ({ ...state, [id]: hidden }));
  }

  toggleCategory(id: string): void {
    this.categoryHidden.update((state) => ({ ...state, [id]: !state[id] }));
  }

  // ---- import / export / reset --------------------------------------------

  exportConfig(): string {
    const state: Omit<PersistedState, 'appName' | 'lastUpdated'> = {
      version: STORAGE_VERSION,
      customRules: this.customRules(),
      categoryHidden: this.categoryHidden(),
      manualHidden: [...this.manualHidden()],
      manualShown: [...this.manualShown()],
      typeOverrides: Object.fromEntries(this.typeOverrides()),
    };
    return JSON.stringify(state, null, 2);
  }

  importConfig(json: string): { ok: boolean; error?: string } {
    try {
      const data = JSON.parse(json) as Partial<PersistedState>;
      if (typeof data !== 'object' || data === null) {
        return { ok: false, error: 'Not a valid config object.' };
      }
      this.applyState(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON.' };
    }
  }

  resetToDefaults(): void {
    this.customRules.set(DEFAULT_RULES.map((r) => ({ ...r, id: this.newId() })));
    this.categoryHidden.set(this.defaultCategoryState());
    this.manualHidden.set(new Set());
    this.manualShown.set(new Set());
    this.typeOverrides.set(new Map());
  }

  // ---- internals -----------------------------------------------------------

  private newId(): string {
    return `r_${(++this.seq).toString(36)}_${Date.now().toString(36)}`;
  }

  private defaultCategoryState(): Record<string, boolean> {
    const state: Record<string, boolean> = {};
    for (const c of INTERNAL_CATEGORIES) state[c.id] = c.defaultHidden;
    return state;
  }

  private normalizeRules(raw: unknown): FilterRule[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
      .map((r) => ({
        id: typeof r['id'] === 'string' ? (r['id'] as string) : this.newId(),
        type: (['Exact', 'Prefix', 'Suffix', 'Regex'].includes(r['type'] as string)
          ? r['type']
          : 'Exact') as FilterMatchType,
        value: typeof r['value'] === 'string' ? (r['value'] as string) : '',
        enabled: r['enabled'] !== false,
        action: (r['action'] === 'show' ? 'show' : 'hide') as FilterAction,
        note: typeof r['note'] === 'string' ? (r['note'] as string) : undefined,
      }))
      .filter((r) => r.value !== '');
  }

  private applyState(data: Partial<PersistedState>): void {
    this.customRules.set(this.normalizeRules(data.customRules));
    this.categoryHidden.set({ ...this.defaultCategoryState(), ...(data.categoryHidden ?? {}) });
    this.manualHidden.set(new Set(Array.isArray(data.manualHidden) ? data.manualHidden : []));
    this.manualShown.set(new Set(Array.isArray(data.manualShown) ? data.manualShown : []));
    this.typeOverrides.set(
      new Map(Object.entries(data.typeOverrides ?? {}) as [string, GenieDependencyType][]),
    );
  }

  private saveToStorage(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const state: PersistedState = {
      version: STORAGE_VERSION,
      appName: document.title || 'Unknown Genie App',
      lastUpdated: Date.now(),
      customRules: this.customRules(),
      categoryHidden: this.categoryHidden(),
      manualHidden: [...this.manualHidden()],
      manualShown: [...this.manualShown()],
      typeOverrides: Object.fromEntries(this.typeOverrides()),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }

  private loadFromStorage(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.resetToDefaults();
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.resetToDefaults();
        return;
      }
      this.applyState(JSON.parse(raw) as Partial<PersistedState>);
      // seed the id counter past any persisted numeric ids to avoid collisions
      this.seq = Math.max(this.seq, this.customRules().length);
    } catch (e) {
      console.warn('[Genie] Filter config load error — resetting to defaults', e);
      this.resetToDefaults();
    }
  }
}
