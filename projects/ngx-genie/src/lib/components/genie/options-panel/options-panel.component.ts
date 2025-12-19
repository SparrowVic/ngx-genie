import {
  ChangeDetectionStrategy,
  Component,
  signal,
  input, output, effect, untracked, ViewEncapsulation
} from '@angular/core';

import {FormsModule} from '@angular/forms';
import {GenieServiceRegistration, GenieNode} from '../../../models/genie-node.model';
import {GenieFilterState, MatchMode, SearchMode} from './options-panel.models';
import {OptionsPanelControlsComponent} from './options-panel-controls/options-panel-controls.component';
import {
  OptionsPanelProviderTypesComponent
} from './options-panel-provider-types/options-panel-provider-types.component';
import {
  OptionsPanelNoiseReductionComponent
} from './options-panel-noise-reduction/options-panel-noise-reduction.component';
import {
  OptionsPanelScopeLifetimeComponent
} from './options-panel-scope-lifetime/options-panel-scope-lifetime.component';
import {
  OptionsPanelComplexityFilterComponent
} from './options-panel-complexity-filter/options-panel-complexity-filter.component';
import {OptionsPanelDeepSearchComponent} from './options-panel-deep-search/options-panel-deep-search.component';
import {GenOptionsPanelFiltersComponent} from './options-panel-filters/options-panel-filters.component';

@Component({
  selector: 'lib-options-panel',
  standalone: true,
  imports: [
    FormsModule,
    OptionsPanelControlsComponent,
    OptionsPanelProviderTypesComponent,
    OptionsPanelNoiseReductionComponent,
    OptionsPanelScopeLifetimeComponent,
    OptionsPanelComplexityFilterComponent,
    OptionsPanelDeepSearchComponent,
    GenOptionsPanelFiltersComponent
],
  templateUrl: './options-panel.component.html',
  styleUrl: './options-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class OptionsPanelComponent {

  readonly allNodes = input<GenieNode[]>([]);
  readonly allServices = input<GenieServiceRegistration[]>([]);
  readonly maxDetectedDeps = input<number>(20);
  readonly isDeepFocusMode = input<boolean>(false);

  readonly toggleDeepFocusMode = output<void>();
  readonly expandAll = output<void>();
  readonly collapseAll = output<void>();
  readonly filterChange = output<GenieFilterState>();

  protected readonly _hideUnusedDeps = signal(false);
  protected readonly _hideIsolatedComponents = signal(false);
  protected readonly _minDeps = signal(0);
  protected readonly _maxDeps = signal(100);

  protected readonly _hideInternals = signal(false);
  protected readonly _groupSimilarSiblings = signal(true);
  protected readonly _showRootOnly = signal(false);
  protected readonly _showLocalOnly = signal(false);

  protected readonly _showUserServices = signal(true);
  protected readonly _showUserPipes = signal(true);
  protected readonly _showUserDirectives = signal(true);
  protected readonly _showUserComponents = signal(true);
  protected readonly _showUserTokens = signal(true);
  protected readonly _showUserValues = signal(true);
  protected readonly _showUserObservables = signal(true);
  protected readonly _showUserSignals = signal(true);

  protected readonly _showFrameworkServices = signal(false);
  protected readonly _showFrameworkSystem = signal(false);
  protected readonly _showFrameworkPipes = signal(false);
  protected readonly _showFrameworkDirectives = signal(false);
  protected readonly _showFrameworkComponents = signal(false);
  protected readonly _showFrameworkTokens = signal(false);
  protected readonly _showFrameworkObservables = signal(false);
  protected readonly _showFrameworkSignals = signal(false);

  protected readonly _searchMode = signal<SearchMode>('component');
  protected readonly _matchMode = signal<MatchMode>('OR');
  protected readonly _selectedComponentTags = signal<Set<string>>(new Set());
  protected readonly _selectedDependencyTags = signal<Set<string>>(new Set());

  constructor() {
    effect(() => {
      const detectedMax = this.maxDetectedDeps();
      const currentMax = untracked(this._maxDeps);
      untracked(() => {
        if (currentMax !== detectedMax) {
          this._maxDeps.set(detectedMax);
        }
      });
    });

    effect(() => {
      const state: GenieFilterState = {
        hideUnusedDeps: this._hideUnusedDeps(),
        hideIsolatedComponents: this._hideIsolatedComponents(),
        minDeps: this._minDeps(),
        maxDeps: this._maxDeps(),
        hideInternals: this._hideInternals(),
        groupSimilarSiblings: this._groupSimilarSiblings(),
        showRootOnly: this._showRootOnly(),
        showLocalOnly: this._showLocalOnly(),

        showUserServices: this._showUserServices(),
        showUserPipes: this._showUserPipes(),
        showUserDirectives: this._showUserDirectives(),
        showUserComponents: this._showUserComponents(),
        showUserTokens: this._showUserTokens(),
        showUserValues: this._showUserValues(),
        showUserObservables: this._showUserObservables(),
        showUserSignals: this._showUserSignals(),

        showFrameworkServices: this._showFrameworkServices(),
        showFrameworkSystem: this._showFrameworkSystem(),
        showFrameworkPipes: this._showFrameworkPipes(),
        showFrameworkDirectives: this._showFrameworkDirectives(),
        showFrameworkComponents: this._showFrameworkComponents(),
        showFrameworkTokens: this._showFrameworkTokens(),
        showFrameworkObservables: this._showFrameworkObservables(),
        showFrameworkSignals: this._showFrameworkSignals(),

        componentTags: Array.from(this._selectedComponentTags()),
        dependencyTags: Array.from(this._selectedDependencyTags()),
        searchTags: [],
        searchMode: this._searchMode(),
        matchMode: this._matchMode()
      };

      this.filterChange.emit(state);
    });
  }

  protected _setShowRootOnly(val: boolean): void {
    this._showRootOnly.set(val);
    if (val) this._showLocalOnly.set(false);
  }

  protected _setShowLocalOnly(val: boolean): void {
    this._showLocalOnly.set(val);
    if (val) this._showRootOnly.set(false);
  }

  protected _updateTags(event: { mode: SearchMode, tags: Set<string> }): void {
    if (event.mode === 'component') {
      this._selectedComponentTags.set(event.tags);
    } else {
      this._selectedDependencyTags.set(event.tags);
    }
  }

  protected _toggleMatchMode(): void {
    this._matchMode.update(m => m === 'OR' ? 'AND' : 'OR');
  }

  protected _setMinDeps(val: number): void {
    if (val > this._maxDeps()) val = this._maxDeps();
    this._minDeps.set(val);
  }

  protected _setMaxDeps(val: number): void {
    if (val < this._minDeps()) val = this._minDeps();
    this._maxDeps.set(val);
  }
}
