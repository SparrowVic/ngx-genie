import {Component, inject, InjectionToken, Injector, Self} from '@angular/core';
import {OrderDetailsComponent} from './order-details/order-details.component';
import {OrdersService} from '../../orders.service';
import {OrderDetailsService} from '../../order-details.service';
import {Cars} from '../cars/cars';
import {Colors} from '../colors/colors';
import {Factory} from '../factory/factory';
import {DashboardShellService} from '../../dashboard-shell.service';
import {Dependency} from '../../orders.service2';

const TOKEN = new InjectionToken<any>('SomeToken');


@Component({
  standalone: true,
  selector: 'app-orders-list',
  templateUrl: './orders-list.component.html',
  styleUrl: './orders-list.component.scss',
  imports: [OrderDetailsComponent, Cars, Colors, Factory],
  providers: [
    OrdersService,
    OrderDetailsService,
    Dependency,
    {provide: TOKEN, useValue: {someProperty: 'exampleValue'}}
  ]
})
export class OrdersListComponent {

  constructor(readonly shell: DashboardShellService, @Self() public dependency: Dependency
  ) {


  }
}
