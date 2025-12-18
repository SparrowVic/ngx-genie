import {ChangeDetectionStrategy, Component, computed, inject, signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {GenieDependencyType} from '../../../../../models/genie-node.model';
import {GenieRegistryService} from '../../../../../services/genie-registry.service';
import {FilterRule, GenFilterService} from '../../../../../services/filter.service';

interface InventoryItem {
  tokenName: string;
  dependencyType: GenieDependencyType;
  isVisible: boolean;
  usageCount: number;
  filterReason?: string;
  matchType?: string;
}

@Component({
  selector: 'gen-advanced-filters-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './advanced-filters-config.component.html',
  styleUrl: './advanced-filters-config.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GenAdvancedFiltersConfigComponent {
  private registry = inject(GenieRegistryService);
  filterService = inject(GenFilterService);

  searchTerm = signal('');
  highlightedTokens = signal<Set<string>>(new Set());

  newPattern = signal('');

  patternType = signal<'Exact' | 'Prefix' | 'Suffix' | 'Regex'>('Exact');

  activeRules = this.filterService.customRules;

  private allItems = computed(() => {
    const services = this.registry.services();
    const map = new Map<string, InventoryItem>();

    services.forEach(svc => {
      if (map.has(svc.label)) {
        map.get(svc.label)!.usageCount++;
      } else {
        const isVisible = !this.filterService.isInternal(svc.label);
        let reason = '';
        let matchType = '';

        if (!isVisible) {
          const rules = this.activeRules();
          const match = rules.find(r => this.matchesRule(svc.label, r));
          if (match) {
            reason = match.value;
            matchType = match.type;
          } else {
            reason = 'System';
            matchType = 'System';
          }
        }

        map.set(svc.label, {
          tokenName: svc.label,
          dependencyType: svc.dependencyType,
          isVisible: isVisible,
          usageCount: 1,
          filterReason: reason,
          matchType: matchType
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.tokenName.localeCompare(b.tokenName));
  });

  publicList = computed(() => {
    const search = this.searchTerm().toLowerCase();
    return this.allItems()
      .filter(i => i.isVisible)
      .filter(i => !search || i.tokenName.toLowerCase().includes(search));
  });

  internalList = computed(() => {
    const search = this.searchTerm().toLowerCase();
    return this.allItems()
      .filter(i => !i.isVisible)
      .filter(i => !search || i.tokenName.toLowerCase().includes(search));
  });

  isHighlighted(token: string): boolean {
    return this.highlightedTokens().has(token);
  }

  moveToInternal(tokenName: string) {
    this.filterService.toggleManualState(tokenName, true);
  }

  moveToPublic(tokenName: string) {
    this.filterService.toggleManualState(tokenName, false);
  }

  addPattern() {
    if (!this.newPattern()) return;

    const tokensBefore = new Set(this.publicList().map(i => i.tokenName));

    const rule: FilterRule = {
      value: this.newPattern(),
      type: this.patternType()
    };

    this.filterService.addRule(rule);
    this.newPattern.set('');

    const currentPublic = new Set(this.publicList().map(i => i.tokenName));
    const movedTokens = [...tokensBefore].filter(token => !currentPublic.has(token));

    if (movedTokens.length > 0) {
      this.triggerHighlight(movedTokens);
    }
  }

  removeRule(ruleValue: string) {
    this.filterService.removeRule(ruleValue);
  }

  resetDefaults() {
    if (confirm('Reset configuration to defaults? This will clear custom patterns and moved items.')) {
      this.filterService.resetToDefaults();
    }
  }

  private triggerHighlight(tokens: string[]) {
    this.highlightedTokens.set(new Set(tokens));

    setTimeout(() => {
      const firstToken = tokens[0];

      const selector = `[data-token="${firstToken.replace(/"/g, '\\"')}"]`;
      const element = document.querySelector(selector);

      if (element) {
        element.scrollIntoView({behavior: 'smooth', block: 'center'});
      }
    }, 100);

    setTimeout(() => {
      this.highlightedTokens.set(new Set());
    }, 2000);
  }

  private matchesRule(name: string, rule: FilterRule): boolean {
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
}
