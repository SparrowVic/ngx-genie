import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  NgZone,
  signal,
  viewChild,
  computed,
  OnDestroy, ViewEncapsulation, PLATFORM_ID
} from '@angular/core';
import {isPlatformBrowser} from '@angular/common';
import {GenieConfig} from '../../models/genie-config.model';
import {GENIE_CONFIG} from '../../tokens/genie-config.token';
import {GenieResizableDirective} from '../../shared/directives/resizable/resizable.directive';
import {GenieWindowConstraintsDirective} from '../../shared/directives/window-constraints/window-constraints.directive';
import {HeaderComponent} from './header/header.component';
import {GenieViewMode, ViewportComponent} from './viewport/viewport.component';
import {OptionsPanelComponent} from './options-panel/options-panel.component';
import {InspectorPanelComponent} from './inspector-panel/inspector-panel.component';
import {GenToastComponent} from '../../shared/components/toast/gen-toast.component';
import {GenieExplorerStateService} from './explorer-state.service';
import {GenieFilterState} from './options-panel/options-panel.models';
import {GenieRegistryService} from '../../services/genie-registry.service';
import {GeniePerformanceService} from '../../services/genie-performance.service';

const STORAGE_KEY_LAYOUT = 'genie_layout_config';
const FIRST_VISIBLE_SCAN_DELAY_MS = 350;
const FOLLOW_UP_VISIBLE_SCAN_DELAY_MS = 1500;
const MAX_VISIBLE_SCAN_ATTEMPTS = 3;
// While the overlay is open, GenieOS watches for SPA navigations (History API) and re-scans the new
// route so the graph stays in sync without needing to close and reopen it.
const LIVE_RESCAN_DEBOUNCE_MS = 150;
const LIVE_RESCAN_MAX_FREEZE_MS = 3000;

interface GenieLayoutState {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
  optionsWidth: number;
  inspectorWidth: number;
  optionsCollapsed: boolean;
  inspectorCollapsed: boolean;
}

@Component({
  selector: 'ngx-genie',
  imports: [
    GenieResizableDirective,
    GenieWindowConstraintsDirective,
    HeaderComponent,
    ViewportComponent,
    OptionsPanelComponent,
    InspectorPanelComponent,
    GenToastComponent
  ],
  providers: [GenieExplorerStateService],
  templateUrl: './genie.component.html',
  styleUrl: './genie.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class GenieComponent implements OnDestroy {

  readonly state = inject(GenieExplorerStateService);
  readonly config: GenieConfig = inject(GENIE_CONFIG);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly registry = inject(GenieRegistryService);
  private readonly performance = inject(GeniePerformanceService);
  private readonly zone = inject(NgZone);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly windowRef = viewChild<ElementRef<HTMLElement>>('windowRef');

  private readonly initialState = this.isBrowser ? this.loadLayoutState() : this.getDefaultLayoutState();

  readonly visible = signal<boolean>(this.config.visibleOnStart);

  readonly isMaximized = signal<boolean>(this.initialState.isMaximized);
  readonly windowPosition = signal({x: this.initialState.x, y: this.initialState.y});
  readonly windowSize = signal({width: this.initialState.width, height: this.initialState.height});

  readonly optionsPanelWidth = signal<number>(this.initialState.optionsWidth);
  readonly inspectorWidth = signal<number>(this.initialState.inspectorWidth);

  readonly isOptionsCollapsed = signal<boolean>(this.initialState.optionsCollapsed);
  readonly isInspectorCollapsed = signal<boolean>(this.initialState.inspectorCollapsed);


  readonly showOptionsPanel = computed(() => this.state.activeView() !== 'diagnostics');
  readonly showInspectorPanel = signal(true);

  readonly gridTemplate = computed(() => {
    const inspectorW = this.inspectorWidth();
    if (this.showOptionsPanel()) {
      return `${this.optionsPanelWidth()}px 1fr ${inspectorW}px`;
    }
    return `1fr ${inspectorW}px`;
  });

  private _lastOptionsWidth = 250;
  private _lastInspectorWidth = 400;
  private readonly _COLLAPSED_WIDTH = 24;
  private _keyListener: ((e: KeyboardEvent) => void) | null = null;

  private _saveTimeout: any = null;
  private _scanTimers: ReturnType<typeof setTimeout>[] = [];
  private _idleScanHandles: number[] = [];
  private _pendingScanCount = 0;
  private _visibleScanAttempt = 0;

  private _navWatchActive = false;
  private _originalPushState: History['pushState'] | null = null;
  private _originalReplaceState: History['replaceState'] | null = null;
  private _popStateListener: (() => void) | null = null;
  private _liveRescanTimer: ReturnType<typeof setTimeout> | null = null;
  private _freezeSafetyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const active = this.config.enabled && this.visible();
      this.registry.setCaptureActive(active);
      if (!active) {
        this.stopLiveRescan();
        this.cancelQueuedScan();
        return;
      }
      this.scheduleScanWhenVisible();
      this.startLiveRescan();
    });

    if (this.isBrowser && this.config.enabled && this.config.hotkey) {
      this._keyListener = (event: KeyboardEvent) => {
        if (event.key === this.config.hotkey) {
          event.preventDefault();
          this.visible.update(v => !v);
        }
      };
      window.addEventListener('keydown', this._keyListener);
    }
  }

  ngOnDestroy() {
    if (this.isBrowser && this._keyListener) {
      window.removeEventListener('keydown', this._keyListener);
    }
    this.stopLiveRescan();
    this.cancelQueuedScan();
  }

  handleViewChange(mode: GenieViewMode) {
    this.state.setView(mode);
  }

  updateSearch(term: string) {
    this.state.searchQuery.set(term);
    if (term) this.state.expandAll();
  }

  toggleMaximize() {
    this.isMaximized.update(v => !v);
    this.saveLayoutState();
  }

  closeWindow() {
    this.visible.set(false);
  }

  handleFilterChange(newState: GenieFilterState) {
    this.state.filterState.set(newState);
    if ((newState.componentTags?.length > 0) || (newState.dependencyTags?.length > 0)) {
      this.state.expandAll();
    }
  }

  logToConsole() {
    if (!this.isBrowser) return;

    const svc = this.state.selectedService();
    if (svc?.instance) {
      console.log(`%c[Genie] Exported ${svc.label}:`, 'color: #3b82f6; font-weight: bold;', svc.instance);
      (window as unknown as { $genie?: unknown }).$genie = svc.instance;
      console.log(`%cAccessible as window.$genie`, 'color: #10b981; font-style: italic;');
    }
  }

  toggleDeepFocusMode = () => this.state.isDeepFocusMode.update(v => !v);
  toggleLiveWatch = () => this.state.isLiveWatch.update(v => !v);

  toggleNode = (id: number) => this.state.toggleNode(id);
  getProvidersForNode = (node: any) => this.state.getProvidersForNode(node.id);
  selectDependency = (s: any) => this.state.selectDependency(s);
  selectNode = (n: any) => this.state.selectNode(n);

  onWindowPositionChange(position: { x: number; y: number }): void {
    this.windowPosition.set(position);
  }

  onWindowSizeChange(size: { width: number; height: number }): void {
    this.windowSize.set(size);
  }

  onWindowOperationEnd(): void {
    this.saveLayoutState();
  }

  onOptionsPanelResize(delta: number): void {
    if (this.isOptionsCollapsed()) {
      this.toggleOptionsPanel(false);
      return;
    }
    this.optionsPanelWidth.update(w => Math.max(150, Math.min(500, w + delta)));
    this.scheduleSave();
  }

  onInspectorResize(delta: number): void {
    if (this.isInspectorCollapsed()) {
      this.toggleInspectorPanel(false);
      return;
    }
    this.inspectorWidth.update(w => Math.max(250, Math.min(800, w - delta)));
    this.scheduleSave();
  }

  toggleOptionsPanel(shouldCollapse: boolean) {
    this.isOptionsCollapsed.set(shouldCollapse);
    if (shouldCollapse) {
      this._lastOptionsWidth = this.optionsPanelWidth();
      this.optionsPanelWidth.set(this._COLLAPSED_WIDTH);
    } else {
      this.optionsPanelWidth.set(Math.max(200, this._lastOptionsWidth));
    }
    this.saveLayoutState();
  }

  toggleInspectorPanel(shouldCollapse: boolean) {
    this.isInspectorCollapsed.set(shouldCollapse);
    if (shouldCollapse) {
      this._lastInspectorWidth = this.inspectorWidth();
      this.inspectorWidth.set(this._COLLAPSED_WIDTH);
    } else {
      this.inspectorWidth.set(Math.max(300, this._lastInspectorWidth));
    }
    this.saveLayoutState();
  }

  private scheduleSave() {
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => this.saveLayoutState(), 500);
  }

  private scheduleScanWhenVisible() {
    if (!this.isBrowser || this._pendingScanCount > 0) return;

    this._visibleScanAttempt = 0;
    this.queueVisibleScan(FIRST_VISIBLE_SCAN_DELAY_MS);
  }

  private queueVisibleScan(delay: number) {
    this._pendingScanCount++;

    const runScan = () => {
      this._pendingScanCount = Math.max(0, this._pendingScanCount - 1);
      if (!this.visible()) return;
      this.runApplicationScan(() => this.queueFollowUpScanIfNeeded());
    };

    this._visibleScanAttempt++;

    const queueIdleScan = () => {
      const win = window as any;
      if (typeof win.requestIdleCallback === 'function') {
        const handle = win.requestIdleCallback(runScan, {timeout: 1500});
        this._idleScanHandles.push(handle);
      } else {
        const timer = setTimeout(runScan, 250);
        this._scanTimers.push(timer);
      }
    };

    this.zone.runOutsideAngular(() => {
      if (delay === 0) {
        queueIdleScan();
      } else {
        const timer = setTimeout(queueIdleScan, delay);
        this._scanTimers.push(timer);
      }
    });
  }

  private runApplicationScan(onComplete: () => void) {
    const completePerformanceSpan = this.performance.startSpan('scan.application', {
      attempt: this._visibleScanAttempt
    });

    try {
      this.registry.scanApplicationChunked(() => {
        completePerformanceSpan({
          nodes: this.registry.nodes().length,
          services: this.registry.services().length,
          dependencies: this.registry.dependencies().length,
          phase: this.registry.scanStatus().phase
        });
        onComplete();
      });
    } catch (error) {
      completePerformanceSpan({failed: true});
      console.warn('[Genie] Application scan failed.', error);
      onComplete();
    }
  }

  private queueFollowUpScanIfNeeded() {
    if (
      this.visible()
      && this.registry.hasPendingDeferredEvents()
      && this._visibleScanAttempt < MAX_VISIBLE_SCAN_ATTEMPTS
    ) {
      this.queueVisibleScan(FOLLOW_UP_VISIBLE_SCAN_DELAY_MS);
    }
  }

  private cancelQueuedScan() {
    if (!this.isBrowser) return;

    this._scanTimers.forEach(timer => clearTimeout(timer));
    this._scanTimers = [];

    const win = window as any;
    if (typeof win.cancelIdleCallback === 'function') {
      this._idleScanHandles.forEach(handle => win.cancelIdleCallback(handle));
    }
    this._idleScanHandles = [];

    this._pendingScanCount = 0;
    this._visibleScanAttempt = 0;
  }

  /**
   * While the overlay is open, watch for SPA navigations by wrapping the History API (pushState /
   * replaceState) and listening for popstate. On a navigation we freeze the tree and re-run the
   * idempotent scan for the new route, so the graph tracks the live app without closing/reopening —
   * and without reacting to unrelated DOM churn (animations etc.), which would otherwise flicker.
   */
  private startLiveRescan() {
    if (!this.isBrowser || this._navWatchActive) return;
    this._navWatchActive = true;

    const onNav = () => this.onLiveNavigation();
    this._originalPushState = history.pushState;
    this._originalReplaceState = history.replaceState;

    const component = this;
    history.pushState = function (this: History, ...args: unknown[]) {
      const result = (component._originalPushState as Function).apply(this, args);
      onNav();
      return result;
    } as History['pushState'];
    history.replaceState = function (this: History, ...args: unknown[]) {
      const result = (component._originalReplaceState as Function).apply(this, args);
      onNav();
      return result;
    } as History['replaceState'];

    this._popStateListener = onNav;
    window.addEventListener('popstate', this._popStateListener);
  }

  private onLiveNavigation() {
    if (!this.config.enabled || !this.visible()) return;

    // Freeze the tree at the current (old-route) state, then re-scan the new route once it has
    // rendered. The frozen tree is auto-released by the state service when the scan settles.
    this.state.suspendTreeUpdates();

    if (this._liveRescanTimer) clearTimeout(this._liveRescanTimer);
    this._liveRescanTimer = setTimeout(() => {
      this._liveRescanTimer = null;
      if (this.config.enabled && this.visible()) this.scheduleScanWhenVisible();
    }, LIVE_RESCAN_DEBOUNCE_MS);

    // Safety net: never leave the tree frozen if a scan somehow fails to settle.
    if (this._freezeSafetyTimer) clearTimeout(this._freezeSafetyTimer);
    this._freezeSafetyTimer = setTimeout(() => {
      this._freezeSafetyTimer = null;
      this.state.resumeTreeUpdates();
    }, LIVE_RESCAN_MAX_FREEZE_MS);
  }

  private stopLiveRescan() {
    if (this._liveRescanTimer) {
      clearTimeout(this._liveRescanTimer);
      this._liveRescanTimer = null;
    }
    if (this._freezeSafetyTimer) {
      clearTimeout(this._freezeSafetyTimer);
      this._freezeSafetyTimer = null;
    }

    if (this._navWatchActive) {
      if (this._originalPushState) history.pushState = this._originalPushState;
      if (this._originalReplaceState) history.replaceState = this._originalReplaceState;
      this._originalPushState = null;
      this._originalReplaceState = null;
      if (this._popStateListener) window.removeEventListener('popstate', this._popStateListener);
      this._popStateListener = null;
      this._navWatchActive = false;
    }

    this.state.resumeTreeUpdates();
  }

  private saveLayoutState() {
    if (!this.isBrowser) return;

    const state: GenieLayoutState = {
      x: this.windowPosition().x,
      y: this.windowPosition().y,
      width: this.windowSize().width,
      height: this.windowSize().height,
      isMaximized: this.isMaximized(),
      optionsWidth: this.optionsPanelWidth(),
      inspectorWidth: this.inspectorWidth(),
      optionsCollapsed: this.isOptionsCollapsed(),
      inspectorCollapsed: this.isInspectorCollapsed()
    };
    try {
      localStorage.setItem(STORAGE_KEY_LAYOUT, JSON.stringify(state));
    } catch (e) {
      console.warn('Genie: Failed to save layout state', e);
    }
  }

  private loadLayoutState(): GenieLayoutState {
    if (!this.isBrowser) return this.getDefaultLayoutState();

    const defaultState: GenieLayoutState = {
      x: 40,
      y: 40,
      width: 1200,
      height: 800,
      isMaximized: false,
      optionsWidth: 350,
      inspectorWidth: 400,
      optionsCollapsed: false,
      inspectorCollapsed: false
    };

    try {
      const raw = localStorage.getItem(STORAGE_KEY_LAYOUT);
      if (raw) {
        const loaded = JSON.parse(raw);
        return {...defaultState, ...loaded};
      }
    } catch (e) {
    }

    return defaultState;
  }

  private getDefaultLayoutState(): GenieLayoutState {
    return {
      x: 40, y: 40, width: 1200, height: 800,
      isMaximized: false, optionsWidth: 350, inspectorWidth: 400,
      optionsCollapsed: false, inspectorCollapsed: false
    };
  }
}
