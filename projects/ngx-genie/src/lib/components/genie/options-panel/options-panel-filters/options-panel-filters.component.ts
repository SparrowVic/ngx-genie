import {ChangeDetectionStrategy, Component, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {GenModalComponent} from '../../../../shared/components/modal/modal.component';
import {GenAdvancedFiltersConfigComponent} from './advanced-filters-config/advanced-filters-config.component';
import {GenFilterService} from '../../../../services/filter.service';

@Component({
  selector: 'gen-options-panel-filters',
  standalone: true,
  imports: [
    FormsModule,
    GenModalComponent,
    GenAdvancedFiltersConfigComponent
  ],
  templateUrl: './options-panel-filters.component.html',
  styleUrl: './options-panel-filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GenOptionsPanelFiltersComponent {


  showAdvancedModal = signal(false);

  openAdvancedSettings() {
    this.showAdvancedModal.set(true);
  }

  closeAdvancedSettings() {
    this.showAdvancedModal.set(false);
  }
}
