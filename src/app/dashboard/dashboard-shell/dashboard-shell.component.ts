import {Component, inject} from '@angular/core';
import {OrdersListComponent} from './orders-list/orders-list.component';
import {DashboardShellService} from '../dashboard-shell.service';
import {UsersListComponent} from './users-list/users-list.component';
import {OrdersService} from '../orders.service';
import {OrderDetailsService} from '../order-details.service';
import {Factory} from './factory/factory';
import {Cars} from './cars/cars';
import {Colors} from './colors/colors';
import {OrdersServiceFive} from '../orders.service5';
import {OrdersServiceFour} from '../orders.service4';
import {OrdersServiceThree} from '../orders.service3';
import {OrdersServiceTwo} from '../orders.service2';
import {OrdersServiceSix} from '../orders.service6';
import {DumpDirOne} from '../../directives/dump-dir-one';
import {DumpDirTwoStd} from '../../directives/dump-dir-two-std';
import {DumpPipeOnePipe} from '../../pipes/dump-pipe-one-pipe';
import {DumpPipeTwoStdPipe} from '../../pipes/dump-pipe-two-std-pipe';
import {NgIf} from '@angular/common';
import {of} from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-dashboard-shell',
  template: `
    <h2>Dashboard Shell</h2>

    @if (true) {
      <div>TRUE IF TEST</div>
    }


    <div *ngIf="true">ngIf TEST</div>

    <div class="row">
      <section>
        <h3>Orders</h3>
        <app-orders-list></app-orders-list>
      </section>

      <section>
        <h3>Users</h3>
        <app-users-list></app-users-list>
      </section>

      <section>
        <h3>Factory</h3>
        <app-factory></app-factory>
      </section>

      <section>
        <h3 appDumpDirOne>Cars</h3>
        <app-cars></app-cars>
      </section>

      <section>
        <h3>Colors {{ 'asd' | dumpPipeTwoStd }}</h3>
        <app-colors></app-colors>
      </section>
    </div>


    <app-colors></app-colors>
    <app-colors></app-colors>
    <app-colors></app-colors>
  `,
  imports: [OrdersListComponent, UsersListComponent, Factory, Cars, Colors, DumpPipeTwoStdPipe, DumpDirOne, NgIf],
  providers: [
    DashboardShellService,
    OrdersService,
    OrderDetailsService,
    OrdersServiceTwo,
    OrdersServiceThree,
    OrdersServiceFour,
    OrdersServiceFive,
    OrdersServiceSix,
    DumpDirTwoStd,
    DumpPipeOnePipe,
  ]
})
export class DashboardShellComponent {
  intArr = [1, 1, 1];

  sub = of(123);

  constructor() {
    this.sub.subscribe()
  }
}
