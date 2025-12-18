import {Component, inject, InjectionToken, Injector, Self} from '@angular/core';
import {OrderDetailsComponent} from './order-details/order-details.component';
import {OrdersService} from '../../orders.service';
import {OrderDetailsService} from '../../order-details.service';
import {Cars} from '../cars/cars';
import {Colors} from '../colors/colors';
import {Factory} from '../factory/factory';
import {DashboardShellService} from '../../dashboard-shell.service';
import {Dependency, OrdersServiceTwo} from '../../orders.service2';

const TOKEN = new InjectionToken<any>('SomeToken');


@Component({
  standalone: true,
  selector: 'app-orders-list',
  imports: [OrderDetailsComponent, Cars, Colors, Factory],
  providers: [
    OrdersService,
    OrderDetailsService,
    Dependency,
    {provide: TOKEN, useValue: {someProperty: 'exampleValue'}},
    DashboardShellService
  ],
  template: `
    <div class="box">
      <p>Orders list (uses OrdersService)</p>
      <app-order-details></app-order-details>

      <section>
        <h3>Factory</h3>
        <app-factory></app-factory>
      </section>

      <section>
        <h3>Cars</h3>
        <app-cars></app-cars>
      </section>

      <section>
        <h3>Colors</h3>
        <app-colors></app-colors>
      </section>
    </div>
  `
})
export class OrdersListComponent {

  constructor(readonly asd: OrdersServiceTwo, @Self() public dependency: Dependency
  ) {


  }
}
