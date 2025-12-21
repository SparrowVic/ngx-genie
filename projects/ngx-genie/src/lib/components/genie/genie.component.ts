import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  ViewChild,
  computed,
  OnDestroy, ViewEncapsulation, PLATFORM_ID
} from '@angular/core';
import {DOCUMENT, isPlatformBrowser} from '@angular/common';

import {GenieConfig} from '../../models/genie-config.model';
import {GENIE_CONFIG} from '../../tokens/genie-config.token';
import {GenieResizableDirective} from '../../shared/directives/resizable/resizable.directive';
import {GenieWindowConstraintsDirective} from '../../shared/directives/window-constraints/window-constraints.directive';

import {HeaderComponent} from './header/header.component';
import {GenieViewMode, ViewportComponent} from './viewport/viewport.component';
import {OptionsPanelComponent} from './options-panel/options-panel.component';
import {InspectorPanelComponent} from './inspector-panel/inspector-panel.component';

import {GenieExplorerStateService} from './explorer-state.service';
import {GenieFilterState} from './options-panel/options-panel.models';

const STORAGE_KEY_LAYOUT = 'genie_layout_config';

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
  standalone: true,
  selector: 'ngx-genie',
  imports: [
    GenieResizableDirective,
    GenieWindowConstraintsDirective,
    HeaderComponent,
    ViewportComponent,
    OptionsPanelComponent,
    InspectorPanelComponent
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
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  @ViewChild('windowRef') windowRef!: ElementRef<HTMLElement>;

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

  constructor() {
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
      // @ts-ignore
      window['$ngx-genie'] = svc.instance;
      console.log(`%cAccessible as window.$genie`, 'color: #10b981; font-style: italic;');
    }
  }

  toggleDeepFocusMode = () => this.state.isDeepFocusMode.update(v => !v);
  toggleLiveWatch = () => this.state.isLiveWatch.update(v => !v);

  toggleNode = (id: number) => this.state.toggleNode(id);
  getProvidersForNode = (node: any) => this.state.getProvidersForNode(node.id);
  selectDependency = (s: any) => this.state.selectDependency(s);
  selectNode = (n: any) => this.state.selectNode(n);

  onWindowPositionChange(position: {x: number; y: number}): void {
    this.windowPosition.set(position);
  }

  onWindowSizeChange(size: {width: number; height: number}): void {
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
