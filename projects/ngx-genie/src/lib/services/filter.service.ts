import {Injectable, signal, effect, computed} from '@angular/core';
import {ANGULAR_INTERNALS} from '../configs/angular-internals';
import {GenieDependencyType} from '../models/genie-node.model';

export interface FilterRule {
  value: string;
  type: 'Exact' | 'Prefix' | 'Suffix' | 'Regex';
}

export interface FilterStatus {
  hidden: boolean;
  reason?: 'Manual' | 'Rule' | 'System';
  rule?: FilterRule;
  detail?: string;
}

const STORAGE_KEY = 'genie_filters_config';


const DEFAULT_RULES: FilterRule[] = [
  {value: '_Prime', type: 'Prefix'},
  {value: '_Mat', type: 'Prefix'},
];

interface PersistedState {
  appName: string;
  lastUpdated: number;
  customRules: FilterRule[];
  manualHidden: string[];
  manualShown: string[];
  typeOverrides: Record<string, GenieDependencyType>;
}

@Injectable({
  providedIn: 'root'
})
export class GenFilterService {

  readonly customRules = signal<FilterRule[]>([]);

  private readonly manualHidden = signal<Set<string>>(new Set());
  private readonly manualShown = signal<Set<string>>(new Set());
  private readonly typeOverrides = signal<Map<string, GenieDependencyType>>(new Map());

  private cache = new Map<string, FilterStatus>();

  readonly configChanged = computed(() => {
    this.customRules();
    this.manualHidden();
    this.manualShown();
    this.typeOverrides();
    return Date.now();
  });

  constructor() {
    this.loadFromStorage();

    effect(() => {
      this.saveToStorage();
      this.cache.clear();
    });
  }


  checkFilterStatus(tokenName: string): FilterStatus {
    if (!tokenName) return {hidden: false};

    if (this.manualShown().has(tokenName)) {
      return {hidden: false, reason: 'Manual', detail: 'User Shown'};
    }

    if (this.manualHidden().has(tokenName)) {
      return {hidden: true, reason: 'Manual', detail: 'User Hidden'};
    }

    for (const rule of this.customRules()) {
      if (this.testRule(tokenName, rule)) {
        return {
          hidden: true,
          reason: 'Rule',
          rule: rule,
          detail: rule.value
        };
      }
    }

    if (ANGULAR_INTERNALS.has(tokenName)) {
      return {hidden: true, reason: 'System', detail: 'Angular Framework'};
    }

    return {hidden: false};
  }

  isInternal(tokenName: string): boolean {
    if (this.cache.has(tokenName)) {
      return this.cache.get(tokenName)!.hidden;
    }
    const res = this.checkFilterStatus(tokenName);
    this.cache.set(tokenName, res);
    return res.hidden;
  }

  getTypeOverride(tokenName: string): GenieDependencyType | null {
    return this.typeOverrides().get(tokenName) || null;
  }

  addRule(rule: FilterRule) {
    this.customRules.update(rules => {
      const exists = rules.some(r => r.type === rule.type && r.value === rule.value);
      return exists ? rules : [...rules, rule];
    });
  }

  removeRule(ruleValue: string) {
    this.customRules.update(rules => rules.filter(r => r.value !== ruleValue));
  }

  toggleManualState(tokenName: string, forceHide: boolean) {
    this.manualHidden.update(s => {
      const n = new Set(s);
      if (forceHide) n.add(tokenName); else n.delete(tokenName);
      return n;
    });
    this.manualShown.update(s => {
      const n = new Set(s);
      if (!forceHide) n.add(tokenName); else n.delete(tokenName);
      return n;
    });
  }

  overrideTokenType(tokenName: string, newType: GenieDependencyType | null) {
    this.typeOverrides.update(map => {
      const n = new Map(map);
      if (newType) n.set(tokenName, newType); else n.delete(tokenName);
      return n;
    });
  }

  resetToDefaults() {
    this.customRules.set([...DEFAULT_RULES]);
    this.manualHidden.set(new Set());
    this.manualShown.set(new Set());
    this.typeOverrides.set(new Map());
  }

  public testRule(name: string, rule: FilterRule): boolean {
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

  private saveToStorage() {
    const state: PersistedState = {
      appName: document.title || 'Unknown Genie App',
      lastUpdated: Date.now(),
      customRules: this.customRules(),
      manualHidden: Array.from(this.manualHidden()),
      manualShown: Array.from(this.manualShown()),
      typeOverrides: Object.fromEntries(this.typeOverrides())
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        this.resetToDefaults();
        return;
      }

      const data: PersistedState = JSON.parse(raw);

      if (data.customRules) this.customRules.set(data.customRules);
      if (data.manualHidden) this.manualHidden.set(new Set(data.manualHidden));
      if (data.manualShown) this.manualShown.set(new Set(data.manualShown));
      if (data.typeOverrides) this.typeOverrides.set(new Map(Object.entries(data.typeOverrides)));

    } catch (e) {
      console.warn('[Genie] Filter load error - resetting to defaults', e);
      this.resetToDefaults();
    }
  }
}
