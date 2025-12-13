import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';
import {SlicePipe} from '@angular/common';
import {InspectorViewModel} from '../inspector-state.service';

@Component({
  selector: 'lib-inspector-providers-list',
  standalone: true,
  imports: [
    SlicePipe
  ],
  templateUrl: './inspector-providers-list.component.html',
  styleUrl: './inspector-providers-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,

})
export class InspectorProvidersListComponent {
  services = input.required<InspectorViewModel[]>();
  selectedId = input<number | undefined>(undefined);

  syncEnabled = input<boolean>(false);

  select = output<InspectorViewModel>();
}
