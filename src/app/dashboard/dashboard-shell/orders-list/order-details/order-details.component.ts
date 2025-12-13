import {Component, inject} from '@angular/core';
import {OrderDetailsService} from '../../../order-details.service';
import {DashboardShellService} from '../../../dashboard-shell.service';

@Component({
  standalone: true,
  selector: 'app-order-details',
  templateUrl: './order-details.component.html',
  styleUrls: ['./order-details.component.scss'],
  providers: [
    OrderDetailsService
  ]
})
export class OrderDetailsComponent {
  constructor(readonly shell: DashboardShellService,
  ) {
  }
}
