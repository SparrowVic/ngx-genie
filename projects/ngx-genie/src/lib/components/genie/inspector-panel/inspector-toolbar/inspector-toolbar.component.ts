import {ChangeDetectionStrategy, Component, input, output, ViewEncapsulation} from '@angular/core';
import {FormsModule} from '@angular/forms';

@Component({
  selector: 'lib-inspector-toolbar',
  standalone: true,
  imports: [
    FormsModule
  ],
  templateUrl: './inspector-toolbar.component.html',
  styleUrl: './inspector-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class InspectorToolbarComponent {
  search = input('');
  typeFilter = input('All');
  depTypeFilter = input('All');
  modFilter = input('All');

  searchChange = output<string>();
  typeFilterChange = output<any>();
  depTypeFilterChange = output<any>();
  modFilterChange = output<any>();
}
