import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';
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
