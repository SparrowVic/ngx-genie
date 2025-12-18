import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  ViewChild,
  effect,
  computed,
  OnDestroy
} from '@angular/core';
import {CommonModule, DOCUMENT} from '@angular/common';
import {interval, Subscription} from 'rxjs';

import {GenieConfig} from '../../models/genie-config.model';
import {GENIE_CONFIG} from '../../tokens/genie-config.token';
import {GenieResizableDirective} from '../../shared/directives/resizable/resizable.directive';

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
    CommonModule,
    GenieResizableDirective,
    HeaderComponent,
    ViewportComponent,
    OptionsPanelComponent,
    InspectorPanelComponent,
  ],
  providers: [GenieExplorerStateService],
  templateUrl: './genie.component.html',
  styleUrl: './genie.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenieComponent implements OnDestroy {

  readonly state = inject(GenieExplorerStateService);
  readonly config: GenieConfig = inject(GENIE_CONFIG);
  private readonly document = inject(DOCUMENT);

  @ViewChild('windowRef') windowRef!: ElementRef<HTMLElement>;

  private readonly initialState = this.loadLayoutState();

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
  private _liveSub: Subscription | null = null;
  private _keyListener: ((e: KeyboardEvent) => void) | null = null;

  private _saveTimeout: any = null;

  constructor() {
    if (this.config.enabled && this.config.hotkey) {
      this._keyListener = (event: KeyboardEvent) => {
        if (event.key === this.config.hotkey) {
          event.preventDefault();
          this.visible.update(v => !v);
        }
      };
      window.addEventListener('keydown', this._keyListener);
    }

    effect(() => {
      if (this.state.isLiveWatch()) {
        this._liveSub = interval(500).subscribe(() =>
          this.state.refreshTrigger.update(v => v + 1)
        );
      } else {
        if (this._liveSub) {
          this._liveSub.unsubscribe();
          this._liveSub = null;
        }
      }
    });
  }

  ngOnDestroy() {
    if (this._keyListener) {
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

  startWindowDrag(event: MouseEvent): void {
    if (this.isMaximized()) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const {x, y} = this.windowPosition();

    const mouseMoveHandler = (e: MouseEvent) => {
      this.windowPosition.set({
        x: x + (e.clientX - startX),
        y: y + (e.clientY - startY)
      });
    };

    const mouseUpHandler = () => {
      this.document.removeEventListener('mousemove', mouseMoveHandler);
      this.document.removeEventListener('mouseup', mouseUpHandler);
      this.saveLayoutState();
    };

    this.document.addEventListener('mousemove', mouseMoveHandler);
    this.document.addEventListener('mouseup', mouseUpHandler);
  }

  startWindowResize(event: MouseEvent): void {
    if (this.isMaximized()) return;
    event.stopPropagation();
    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;
    const rect = this.windowRef.nativeElement.getBoundingClientRect();
    const startW = rect.width;
    const startH = rect.height;

    const mouseMoveHandler = (e: MouseEvent) => {
      this.windowSize.set({
        width: Math.max(600, startW + (e.clientX - startX)),
        height: Math.max(400, startH + (e.clientY - startY))
      });
    };

    const mouseUpHandler = () => {
      this.document.removeEventListener('mousemove', mouseMoveHandler);
      this.document.removeEventListener('mouseup', mouseUpHandler);
      this.saveLayoutState();
    };

    this.document.addEventListener('mousemove', mouseMoveHandler);
    this.document.addEventListener('mouseup', mouseUpHandler);
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
}
