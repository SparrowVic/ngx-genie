import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  viewChild, ViewEncapsulation
} from '@angular/core';
import {MatchMode, SearchMode} from '../options-panel.models';
import {GenieNode, GenieServiceRegistration} from '../../../../models/genie-node.model';
import {FormsModule} from '@angular/forms';
import {ANGULAR_INTERNALS} from '../../../../configs/angular-internals';

@Component({
  selector: 'lib-options-panel-deep-search',
  standalone: true,
  imports: [
    FormsModule
  ],
  templateUrl: './options-panel-deep-search.component.html',
  styleUrl: './options-panel-deep-search.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
  host: {
    '(document:click)': '_onClickOutside($event)'
  }
})
export class OptionsPanelDeepSearchComponent {
  readonly allNodes = input<GenieNode[]>([]);
  readonly allServices = input<GenieServiceRegistration[]>([]);

  readonly searchMode = input.required<SearchMode>();
  readonly matchMode = input.required<MatchMode>();
  readonly selectedComponentTags = input.required<Set<string>>();
  readonly selectedDependencyTags = input.required<Set<string>>();


  readonly hideInternals = input<boolean>(false);
  readonly hideUnused = input<boolean>(false);


  readonly showServices = input<boolean>(true);
  readonly showTokens = input<boolean>(true);
  readonly showComponents = input<boolean>(true);
  readonly showDirectives = input<boolean>(true);
  readonly showPipes = input<boolean>(true);

  readonly updateSearchMode = output<SearchMode>();
  readonly updateMatchMode = output<void>();
  readonly updateTags = output<{ mode: SearchMode, tags: Set<string> }>();

  protected readonly _searchQuery = signal('');
  protected readonly _isDropdownOpen = signal(false);

  protected readonly _searchInput = viewChild<ElementRef>('searchInput');
  protected readonly _dropdownRef = viewChild<ElementRef>('dropdownRef');

  protected readonly _filteredOptions = computed(() => {
    const query = this._searchQuery().toLowerCase();
    const mode = this.searchMode();

    let options: string[] = [];

    if (mode === 'component') {

      const nodes = this.allNodes();
      const hideInternals = this.hideInternals();

      options = nodes
        .filter(n => {

          if (hideInternals && (ANGULAR_INTERNALS.has(n.label) || n.label.startsWith('ɵ'))) {
            return false;
          }
          return true;
        })
        .map(n => n.label);

    } else {

      const services = this.allServices();
      const hideUnused = this.hideUnused();

      const showSvc = this.showServices();
      const showTok = this.showTokens();
      const showComp = this.showComponents();
      const showDir = this.showDirectives();
      const showPipe = this.showPipes();

      options = services
        .filter(s => {

          if (hideUnused && (s.usageCount || 0) === 0) return false;


          const type = s.dependencyType || 'Service';
          if (type === 'Service' && !showSvc) return false;
          if ((type === 'Token' || type === 'Value') && !showTok) return false;
          if (type === 'Component' && !showComp) return false;
          if (type === 'Directive' && !showDir) return false;
          if (type === 'Pipe' && !showPipe) return false;

          return true;
        })
        .map(s => s.label);
    }


    const uniqueOptions = Array.from(new Set(options));
    return uniqueOptions
      .filter(opt => opt.toLowerCase().includes(query))
      .sort()
      .slice(0, 50);
  });

  protected _onSearchModeChange(mode: SearchMode): void {
    this.updateSearchMode.emit(mode);
    this._searchQuery.set('');
    this._isDropdownOpen.set(true);
  }

  protected _onSearchInputFocus(): void {
    this._isDropdownOpen.set(true);
  }

  protected _updateSearchQuery(query: string): void {
    this._searchQuery.set(query);
    this._isDropdownOpen.set(true);
  }

  protected _toggleTag(tag: string, event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();

    const mode = this.searchMode();
    const currentSet = new Set(
      mode === 'component' ? this.selectedComponentTags() : this.selectedDependencyTags()
    );

    if (currentSet.has(tag)) {
      currentSet.delete(tag);
    } else {
      currentSet.add(tag);
    }

    this.updateTags.emit({mode, tags: currentSet});
  }

  protected _removeTag(tag: string, type: SearchMode): void {
    const currentSet = new Set(
      type === 'component' ? this.selectedComponentTags() : this.selectedDependencyTags()
    );
    currentSet.delete(tag);
    this.updateTags.emit({mode: type, tags: currentSet});
  }

  protected _isTagSelected(tag: string): boolean {
    const mode = this.searchMode();
    if (mode === 'component') {
      return this.selectedComponentTags().has(tag);
    } else {
      return this.selectedDependencyTags().has(tag);
    }
  }

  protected _onClickOutside(event: MouseEvent): void {
    const dropdown = this._dropdownRef()?.nativeElement;
    const inputEl = this._searchInput()?.nativeElement;

    if (dropdown && inputEl) {
      const clickedInsideDropdown = dropdown.contains(event.target as Node);
      const clickedInsideInput = inputEl.contains(event.target as Node);
      if (!clickedInsideDropdown && !clickedInsideInput) {
        this._isDropdownOpen.set(false);
      }
    }
  }
}
