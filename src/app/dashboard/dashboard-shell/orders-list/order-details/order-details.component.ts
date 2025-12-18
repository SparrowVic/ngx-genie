import {Component, inject} from '@angular/core';
import {OrderDetailsService} from '../../../order-details.service';
import {DashboardShellService} from '../../../dashboard-shell.service';

@Component({
  standalone: true,
  selector: 'app-order-details',
  providers: [
    OrderDetailsService
  ],
  template: `
    <div class="box nested">
      <p>Order details (uses OrderDetailsService)</p>
    </div>
  `
})
export class OrderDetailsComponent {
  constructor(readonly shell: DashboardShellService,
  ) {
  }
}
