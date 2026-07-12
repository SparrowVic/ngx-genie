import {ChangeDetectionStrategy, Component, input, output, ViewEncapsulation} from '@angular/core';
import {SlicePipe} from '@angular/common';
import {InspectorViewModel} from '../inspector-state.service';

@Component({
  standalone: true,
  selector: 'lib-inspector-providers-list',
  imports: [
    SlicePipe
  ],
  templateUrl: './inspector-providers-list.component.html',
  styleUrl: './inspector-providers-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom

})
export class InspectorProvidersListComponent {
  services = input.required<InspectorViewModel[]>();
  selectedId = input<number | undefined>(undefined);

  syncEnabled = input<boolean>(false);

  select = output<InspectorViewModel>();
}
