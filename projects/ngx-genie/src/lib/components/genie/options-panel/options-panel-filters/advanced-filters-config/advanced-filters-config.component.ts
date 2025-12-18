import {ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation} from '@angular/core';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
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
        const status = this.filterService.checkFilterStatus(svc.label);

        let reason = status.detail;
        let matchType = status.reason;

        if (status.reason === 'Rule' && status.rule) {
          reason = status.rule.value;
          // @ts-ignore
          matchType = status.rule.type;
        }

        map.set(svc.label, {
          tokenName: svc.label,
          dependencyType: svc.dependencyType,
          isVisible: !status.hidden,
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
    const pattern = this.newPattern();
    if (!pattern) return;

    const tokensBefore = new Set(this.publicList().map(i => i.tokenName));

    const rule: FilterRule = {
      value: pattern,
      type: this.patternType()
    };

    this.filterService.addRule(rule);
    this.newPattern.set('');

    const movedTokens = [...tokensBefore].filter(token => {
      return this.filterService.testRule(token, rule);
    });

    if (movedTokens.length > 0) {
      this.triggerHighlight(movedTokens);
    }
  }

  removeRule(ruleValue: string) {
    this.filterService.removeRule(ruleValue);
  }

  resetDefaults() {
    if (confirm('Reset configuration to defaults? This will revert custom patterns to initial settings.')) {
      this.filterService.resetToDefaults();
    }
  }

  private triggerHighlight(tokens: string[]) {
    this.highlightedTokens.set(new Set(tokens));

    setTimeout(() => {
      if (tokens.length === 0) return;
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
}
