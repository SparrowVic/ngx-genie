import {ChangeDetectionStrategy, Component, computed, input} from '@angular/core';
import {GenieServiceRegistration} from '../../../../../../models/genie-node.model';
import {SlicePipe, UpperCasePipe} from '@angular/common';

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
})
export class TreeDependencyItemComponent {
  dependency = input.required<GenieServiceRegistration>();
  selectDependency = input.required<(dep: GenieServiceRegistration) => void>();

  selectedServiceId = input<number | null>(null);

  protected readonly _dependency = this.dependency;

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

  protected _handleClick(event: MouseEvent): void {
    event.stopPropagation();
    this.selectDependency()(this.dependency());
  }
}
