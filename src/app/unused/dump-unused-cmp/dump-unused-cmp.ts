import {Component, inject} from '@angular/core';
import {OrdersService} from '../../dashboard/orders.service';
import {OrdersServiceTwo} from '../../dashboard/orders.service2';

@Component({
  selector: 'app-dump-unused-cmp',
  standalone: true,
  imports: [],
  templateUrl: './dump-unused-cmp.html',
  styleUrl: './dump-unused-cmp.scss',
  providers: [OrdersService, OrdersServiceTwo]
})
export class DumpUnusedCmp {

  readonly ordersServiceTwo: OrdersServiceTwo = inject(OrdersServiceTwo);

  constructor(private readonly ordersService: OrdersService) {
  }
}
