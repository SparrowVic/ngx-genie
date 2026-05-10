import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  effect,
  inject,
  Input,
  OnDestroy,
  signal,
  ViewChild, ViewEncapsulation
} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {
  GenieDiagnosticsService,
  Anomaly,
  DiagnosticsConfig,
  DEFAULT_DIAGNOSTICS_CONFIG,
  DiagnosticsProgress,
  DiagnosticsReport
} from '../../../../../services/genie-diagnostics.service';
import {GenieServiceRegistration} from '../../../../../models/genie-node.model';
import {GenieRegistryService} from '../../../../../services/genie-registry.service';
import {GenieExplorerStateService} from '../../../explorer-state.service';
import {DiagnosticOptionsComponent} from './diagnostic-options/diagnostic-options.component';
import {GenieResizableDirective} from '../../../../../shared/directives/resizable/resizable.directive';

type ViewMode = 'list' | 'grid';
type CategoryFilter = 'ALL' | 'memory' | 'architecture' | 'performance' | 'best-practice';
type SourceFilters = {
  components: boolean;
  services: boolean;
  directives: boolean;
  pipes: boolean;
  tokens: boolean;
};

const INITIAL_RENDER_LIMIT = 100;
const RENDER_LIMIT_STEP = 100;

@Component({
  selector: 'lib-diagnostics-view',
  standalone: true,
  imports: [CommonModule, FormsModule, DiagnosticOptionsComponent, GenieResizableDirective],
  templateUrl: './diagnostics-view.component.html',
  styleUrl: './diagnostics-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class DiagnosticsViewComponent implements OnDestroy {
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
  readonly renderLimit = signal(INITIAL_RENDER_LIMIT);

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

  readonly report = signal<DiagnosticsReport>({score: 100, anomalies: []});
  readonly diagnosticsProgress = signal<DiagnosticsProgress>({
    phase: 'grouping',
    processed: 0,
    total: 0,
    anomalies: 0
  });
  readonly isDiagnosticsRunning = signal(false);
  readonly diagnosticsProgressPercent = computed(() => {
    const progress = this.diagnosticsProgress();
    if (!progress.total) return this.isDiagnosticsRunning() ? 5 : 100;
    return Math.max(5, Math.min(100, (progress.processed / progress.total) * 100));
  });

  private diagnosticsRunId = 0;
  private cancelDiagnosticsRun: (() => void) | null = null;
  private diagnosticsTimer: ReturnType<typeof setTimeout> | null = null;

  readonly serviceById = computed(() => {
    return new Map(this.registry.services().map(s => [s.id, s]));
  });

  readonly availableTags = computed(() => {
    const anomalies = this.report().anomalies;
    const serviceMap = this.serviceById();
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
    let critical = 0;
    let warning = 0;
    let info = 0;
    for (const item of pool) {
      if (item.severity === 'critical') critical++;
      else if (item.severity === 'warning') warning++;
      else info++;
    }

    return {
      total: pool.length,
      critical,
      warning,
      info
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
    const textQuery = this.inputValue().trim().toLowerCase();

    const servicesMap = this.serviceById();

    return all.filter(item => {
      if (item.isFramework) {
        if (!showSystem) return false;

        if (!this.matchesSourceFilter(item, sysFilters, servicesMap)) return false;

      } else {
        if (!this.matchesSourceFilter(item, userFilters, servicesMap)) return false;
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

  readonly displayedAnomalies = computed(() => {
    return this.filteredAnomalies().slice(0, this.renderLimit());
  });

  readonly remainingAnomalies = computed(() => {
    return Math.max(0, this.filteredAnomalies().length - this.displayedAnomalies().length);
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

  constructor() {
    effect(() => {
      this.registry.nodes();
      this.registry.services();
      this.registry.dependencies();
      const currentConfig = this.config();
      this.scheduleDiagnosticsRun(currentConfig);
    });
  }

  ngOnDestroy(): void {
    if (this.diagnosticsTimer) clearTimeout(this.diagnosticsTimer);
    this.cancelDiagnosticsRun?.();
  }

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
    this.resetRenderLimit();
    this.searchInput.nativeElement.focus();
  }

  removeTag(tag: string) {
    this.selectedTags.update(s => {
      const newSet = new Set(s);
      newSet.delete(tag);
      return newSet;
    });
    this.resetRenderLimit();
  }

  onInputChange(val: string) {
    this.inputValue.set(val);
    this.isDropdownOpen.set(true);
    this.resetRenderLimit();
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
    this.resetRenderLimit();
  }

  toggleUserSource(type: 'components' | 'services' | 'directives' | 'pipes' | 'tokens') {
    this.filterSourceUser.update(s => ({...s, [type]: !s[type]}));
    this.resetRenderLimit();
  }

  toggleSystemSource(type: 'components' | 'services' | 'directives' | 'pipes' | 'tokens') {
    this.filterSourceSystem.update(s => ({...s, [type]: !s[type]}));
    this.resetRenderLimit();
  }

  toggleSystemIssues() {
    this.showSystemIssues.update(v => !v);
    this.resetRenderLimit();
  }

  toggleViewMode() {
    this.viewMode.update(m => m === 'list' ? 'grid' : 'list');
  }

  setCategoryFilter(cat: CategoryFilter) {
    this.categoryFilter.set(cat);
    this.resetRenderLimit();
  }

  loadMore() {
    this.renderLimit.update(limit => limit + RENDER_LIMIT_STEP);
  }

  showAll() {
    this.renderLimit.set(this.filteredAnomalies().length);
  }

  isNodeLevelIssue(type: string): boolean {
    return ['high-coupling', 'perf-change-detection', 'missing-cleanup'].includes(type);
  }

  resolveAndSelect(anomaly: Anomaly) {
    if (anomaly.relatedServiceIds.length > 0) {
      const svcId = anomaly.relatedServiceIds[0];
      const svc = this.registry.getServiceById(svcId);
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

  private scheduleDiagnosticsRun(config: DiagnosticsConfig): void {
    if (this.diagnosticsTimer) clearTimeout(this.diagnosticsTimer);
    this.cancelDiagnosticsRun?.();
    this.isDiagnosticsRunning.set(true);

    this.diagnosticsTimer = setTimeout(() => {
      this.startDiagnosticsRun(config);
    }, 180);
  }

  private startDiagnosticsRun(config: DiagnosticsConfig): void {
    const runId = ++this.diagnosticsRunId;
    this.cancelDiagnosticsRun?.();

    this.cancelDiagnosticsRun = this.diagnostics.runDiagnosticsChunked(
      config,
      progress => {
        if (runId !== this.diagnosticsRunId) return;
        this.diagnosticsProgress.set(progress);
      },
      report => {
        if (runId !== this.diagnosticsRunId) return;
        this.report.set(report);
        this.isDiagnosticsRunning.set(false);
        this.resetRenderLimit();
      }
    );
  }

  private copyToClipboard(text: string) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  private resetRenderLimit(): void {
    this.renderLimit.set(INITIAL_RENDER_LIMIT);
  }

  private matchesSourceFilter(
    item: Anomaly,
    filters: SourceFilters,
    servicesMap: Map<number, GenieServiceRegistration>
  ): boolean {
    if (item.relatedServiceIds.length === 0) return true;

    const svc = servicesMap.get(item.relatedServiceIds[0]);
    if (!svc) return true;

    const type = svc.dependencyType;
    if (type === 'Component') return filters.components;
    if (type === 'Service') return filters.services;
    if (type === 'Directive') return filters.directives;
    if (type === 'Pipe') return filters.pipes;
    if (type === 'Token' || type === 'Value' || type === 'Observable' || type === 'Signal') {
      return filters.tokens;
    }

    return true;
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
