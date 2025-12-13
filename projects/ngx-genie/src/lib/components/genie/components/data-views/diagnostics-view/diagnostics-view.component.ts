import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Input,
  signal,
  ViewChild
} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {
  GenieDiagnosticsService,
  Anomaly,
  DiagnosticsConfig,
  DEFAULT_DIAGNOSTICS_CONFIG
} from '../../../../../services/genie-diagnostics.service';
import {GenieServiceRegistration} from '../../../../../models/genie-node.model';
import {GenieRegistryService} from '../../../../../services/genie-registry.service';
import {GenieExplorerStateService} from '../../../explorer-state.service';
import {DiagnosticOptionsComponent} from './diagnostic-options/diagnostic-options.component';
import {GenieResizableDirective} from '../../../../../shared/directives/resizable/resizable.directive';

type ViewMode = 'list' | 'grid';
type CategoryFilter = 'ALL' | 'memory' | 'architecture' | 'performance' | 'best-practice';

@Component({
  selector: 'lib-diagnostics-view',
  standalone: true,
  imports: [CommonModule, FormsModule, DiagnosticOptionsComponent, GenieResizableDirective],
  templateUrl: './diagnostics-view.component.html',
  styleUrl: './diagnostics-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiagnosticsViewComponent {
  private diagnostics = inject(GenieDiagnosticsService);
  private registry = inject(GenieRegistryService);
  private state = inject(GenieExplorerStateService);

  @Input() selectService!: (svc: GenieServiceRegistration) => void;
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  readonly config = signal<DiagnosticsConfig>(DEFAULT_DIAGNOSTICS_CONFIG);
  readonly optionsWidth = signal(280);

  readonly inputValue = signal('');
  readonly selectedTags = signal<Set<string>>(new Set());
  readonly isDropdownOpen = signal(false);

  readonly showSystemIssues = signal(false);
  readonly viewMode = signal<ViewMode>('list');
  readonly categoryFilter = signal<CategoryFilter>('ALL');

  readonly filterSeverity = signal<{ critical: boolean; warning: boolean; info: boolean }>({
    critical: true,
    warning: true,
    info: true
  });

  readonly filterSourceUser = signal({
    components: true,
    services: true,
    directives: true,
    pipes: true,
    tokens: true
  });

  readonly filterSourceSystem = signal({
    components: false,
    services: true,
    directives: false,
    pipes: false,
    tokens: false
  });

  readonly report = computed(() => {
    this.registry.services();
    const currentConfig = this.config();
    return this.diagnostics.runDiagnostics(currentConfig);
  });

  readonly availableTags = computed(() => {
    const anomalies = this.report().anomalies;
    const services = this.registry.services();
    const serviceMap = new Map(services.map(s => [s.id, s]));
    const names = new Set<string>();

    anomalies.forEach(a => {
      a.relatedServiceIds.forEach(id => {
        const s = serviceMap.get(id);
        if (s) names.add(s.label);
      });
    });
    return Array.from(names).sort();
  });

  readonly filteredSuggestions = computed(() => {
    const input = this.inputValue().toLowerCase();
    const selected = this.selectedTags();
    return this.availableTags().filter(tag =>
      (!input || tag.toLowerCase().includes(input)) && !selected.has(tag)
    );
  });

  readonly stats = computed(() => {
    const pool = this.filteredAnomalies();
    return {
      total: pool.length,
      critical: pool.filter(a => a.severity === 'critical').length,
      warning: pool.filter(a => a.severity === 'warning').length,
      info: pool.filter(a => a.severity === 'info').length
    };
  });

  readonly filteredAnomalies = computed(() => {
    const all = this.report().anomalies;
    const sevFilters = this.filterSeverity();
    const userFilters = this.filterSourceUser();
    const sysFilters = this.filterSourceSystem();
    const showSystem = this.showSystemIssues();
    const cat = this.categoryFilter();

    const tags = this.selectedTags();
    const textQuery = this.inputValue().toLowerCase();

    const servicesMap = new Map(this.registry.services().map(s => [s.id, s]));

    return all.filter(item => {
      if (item.isFramework) {
        if (!showSystem) return false;

        let typeMatch = false;
        if (item.relatedServiceIds.length === 0) typeMatch = true;
        else {
          const svc = servicesMap.get(item.relatedServiceIds[0]);
          if (svc) {
            const type = svc.dependencyType;
            if (type === 'Component' && sysFilters.components) typeMatch = true;
            else if (type === 'Service' && sysFilters.services) typeMatch = true;
            else if (type === 'Directive' && sysFilters.directives) typeMatch = true;
            else if (type === 'Pipe' && sysFilters.pipes) typeMatch = true;
            else if ((type === 'Token' || type === 'Value' || type === 'Observable') && sysFilters.tokens) typeMatch = true;
          } else typeMatch = true;
        }
        if (!typeMatch) return false;

      } else {
        let typeMatch = false;
        if (item.relatedServiceIds.length === 0) typeMatch = true;
        else {
          const svc = servicesMap.get(item.relatedServiceIds[0]);
          if (svc) {
            const type = svc.dependencyType;
            if (type === 'Component' && userFilters.components) typeMatch = true;
            else if (type === 'Service' && userFilters.services) typeMatch = true;
            else if (type === 'Directive' && userFilters.directives) typeMatch = true;
            else if (type === 'Pipe' && userFilters.pipes) typeMatch = true;
            else if ((type === 'Token' || type === 'Value' || type === 'Observable') && userFilters.tokens) typeMatch = true;
          } else typeMatch = true;
        }
        if (!typeMatch) return false;
      }

      if (item.severity === 'critical' && !sevFilters.critical) return false;
      if (item.severity === 'warning' && !sevFilters.warning) return false;
      if (item.severity === 'info' && !sevFilters.info) return false;

      if (cat !== 'ALL' && item.category !== cat) return false;

      if (tags.size > 0) {
        const relatedNames = item.relatedServiceIds
          .map(id => servicesMap.get(id)?.label)
          .filter(Boolean) as string[];

        const hasMatchingTag = relatedNames.some(name => tags.has(name));
        if (!hasMatchingTag) return false;
      }

      if (textQuery) {
        const matchesText = item.title.toLowerCase().includes(textQuery) ||
          item.description.toLowerCase().includes(textQuery) ||
          (item.suggestion && item.suggestion.toLowerCase().includes(textQuery));
        if (!matchesText) return false;
      }

      return true;
    });
  });

  readonly hiddenCount = computed(() => {
    return this.report().anomalies.length - this.filteredAnomalies().length;
  });

  readonly integrityColor = computed(() => {
    const score = this.report().score;
    if (score >= 90) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  });

  onOptionsResize(delta: number) {
    this.optionsWidth.update(w => Math.max(200, Math.min(600, w + delta)));
  }

  addTag(tag: string) {
    this.selectedTags.update(s => {
      const newSet = new Set(s);
      newSet.add(tag);
      return newSet;
    });
    this.inputValue.set('');
    this.searchInput.nativeElement.focus();
  }

  removeTag(tag: string) {
    this.selectedTags.update(s => {
      const newSet = new Set(s);
      newSet.delete(tag);
      return newSet;
    });
  }

  onInputChange(val: string) {
    this.inputValue.set(val);
    this.isDropdownOpen.set(true);
  }

  onInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Backspace' && !this.inputValue()) {
      const tags = Array.from(this.selectedTags());
      if (tags.length > 0) {
        this.removeTag(tags[tags.length - 1]);
      }
    } else if (event.key === 'Enter') {
      const val = this.inputValue().trim();
      const suggestions = this.filteredSuggestions();
      if (suggestions.length === 1) {
        this.addTag(suggestions[0]);
      } else if (val && this.availableTags().includes(val)) {
        this.addTag(val);
      }
    } else if (event.key === 'Escape') {
      this.isDropdownOpen.set(false);
      this.searchInput.nativeElement.blur();
    }
  }

  onFocus() {
    if (this.availableTags().length > 0) {
      this.isDropdownOpen.set(true);
    }
  }

  onBlur() {
    setTimeout(() => {
      this.isDropdownOpen.set(false);
    }, 200);
  }

  toggleFilter(type: 'critical' | 'warning' | 'info') {
    this.filterSeverity.update(s => ({...s, [type]: !s[type]}));
  }

  toggleUserSource(type: 'components' | 'services' | 'directives' | 'pipes' | 'tokens') {
    this.filterSourceUser.update(s => ({...s, [type]: !s[type]}));
  }

  toggleSystemSource(type: 'components' | 'services' | 'directives' | 'pipes' | 'tokens') {
    this.filterSourceSystem.update(s => ({...s, [type]: !s[type]}));
  }

  toggleSystemIssues() {
    this.showSystemIssues.update(v => !v);
  }

  toggleViewMode() {
    this.viewMode.update(m => m === 'list' ? 'grid' : 'list');
  }

  setCategoryFilter(cat: CategoryFilter) {
    this.categoryFilter.set(cat);
  }

  isNodeLevelIssue(type: string): boolean {
    return ['high-coupling', 'perf-change-detection', 'missing-cleanup'].includes(type);
  }

  resolveAndSelect(anomaly: Anomaly) {
    if (anomaly.relatedServiceIds.length > 0) {
      const svcId = anomaly.relatedServiceIds[0];
      const svc = this.registry.services().find(s => s.id === svcId);
      if (svc) {
        this.selectService(svc);
      }
    }
  }

  copyReport() {
    const r = this.report();
    const filtered = this.filteredAnomalies();

    let text = `[GenieOS Diagnostics Report]\n`;
    text += `Integrity Score: ${r.score}%\n`;
    text += `Visible Issues: ${filtered.length} (Total: ${r.anomalies.length})\n`;
    text += `Date: ${new Date().toLocaleString()}\n\n`;

    if (filtered.length === 0) {
      text += `No visible issues found.\n`;
    } else {
      text += filtered.map(a =>
        `[${a.severity.toUpperCase()}] [${a.type}] ${a.title}\n` +
        `Description: ${a.description}\n` +
        `Suggestion: ${a.suggestion || 'N/A'}\n` +
        `Category: ${a.category}\n`
      ).join('\n----------------------------------------\n\n');
    }

    this.copyToClipboard(text);
  }

  copyAnomaly(item: Anomaly, event: MouseEvent) {
    event.stopPropagation();
    const text = `[${item.severity.toUpperCase()}] ${item.title}\n${item.description}\nSuggestion: ${item.suggestion}`;
    this.copyToClipboard(text);
  }

  private copyToClipboard(text: string) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  getIconForType(type: string): string {
    switch (type) {
      case 'unused-instance':
        return '👻';
      case 'singleton-violation':
        return '♊';
      case 'heavy-state':
        return '⚖️';
      case 'high-coupling':
        return '🕸️';
      case 'perf-change-detection':
        return '⚡';
      case 'large-api':
        return '🐘';
      case 'circular-risk':
        return '🌀';
      case 'missing-cleanup':
        return '🧹';
      default:
        return '⚠️';
    }
  }

  getSegmentDash(count: number, total: number): number {
    if (total === 0) return 0;
    return (count / total) * 100;
  }
}
