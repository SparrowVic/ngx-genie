import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  ViewEncapsulation
} from '@angular/core';
import {GenieServiceRegistration} from '../../../../../../models/genie-node.model';
import {SlicePipe, UpperCasePipe} from '@angular/common';
import {GenieExplorerStateService} from '../../../../explorer-state.service';

@Component({
  selector: 'lib-tree-dependency-item',
  standalone: true,
  imports: [
    UpperCasePipe,
    SlicePipe,
  ],
  templateUrl: './tree-dependency-item.component.html',
  styleUrl: './tree-dependency-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class TreeDependencyItemComponent {
  private readonly state = inject(GenieExplorerStateService);

  dependency = input.required<GenieServiceRegistration>();
  selectDependency = input.required<(dep: GenieServiceRegistration) => void>();
  selectedServiceId = input<number | null>(null);

  protected readonly _dependency = this.dependency;


  protected readonly isTooltipVisible = signal(false);
  protected readonly tooltipPosition = signal<{ x: number, y: number } | null>(null);
  private _tooltipTimeout: any;

  protected readonly _isRoot = computed(() => {
    const s = this.dependency();
    return s.isRoot || s.token?.['ɵprov']?.providedIn === 'root';
  });

  protected readonly _isFramework = computed(() => this.dependency().isFramework);

  protected readonly _isActive = computed(() =>
    this.dependency().id === this.selectedServiceId()
  );

  protected readonly _abbrType = computed(() => {
    const type = this.dependency().dependencyType;
    if (!type) return 'UNK';

    switch (type) {
      case 'Service':
        return 'SVC';
      case 'System':
        return 'SYS';
      case 'Value':
        return 'VAL';
      case 'Observable':
        return 'OBS';
      case 'Signal':
        return 'SIG';
      case 'Component':
        return 'CMP';
      case 'Directive':
        return 'DIR';
      case 'Pipe':
        return 'PIP';
      case 'Token':
        return 'TOK';
      default:
        return (type as string).substring(0, 3).toUpperCase();
    }
  });


  protected readonly _consumersList = computed(() => {
    const id = this.dependency().id;
    const usage = this.dependency().usageCount;
    if (usage === 0) return [];

    const consumers = this.state.serviceConsumersMap().get(id) || [];
    return consumers;
  });

  protected _handleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.selectDependency()(this.dependency());
  }


  protected onBadgeEnter(event: MouseEvent) {
    if (this._tooltipTimeout) clearTimeout(this._tooltipTimeout);

    const target = event.target as HTMLElement;
    const rect = target.getBoundingClientRect();


    this.tooltipPosition.set({
      x: rect.right + 10,
      y: rect.top
    });
    this.isTooltipVisible.set(true);
  }

  protected onBadgeLeave() {
    this._tooltipTimeout = setTimeout(() => {
      this.isTooltipVisible.set(false);
    }, 300);
  }

  protected onTooltipEnter() {
    if (this._tooltipTimeout) clearTimeout(this._tooltipTimeout);
  }

  protected onTooltipLeave() {
    this.isTooltipVisible.set(false);
  }
}
