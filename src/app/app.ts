import {ChangeDetectorRef, Component, ElementRef, inject, Renderer2, ViewContainerRef} from '@angular/core';
import {DashboardShellComponent} from './dashboard/dashboard-shell/dashboard-shell.component';
import {OrdersService} from './dashboard/orders.service';
import {DashboardShellService} from './dashboard/dashboard-shell.service';
import {OrdersServiceTwo} from './dashboard/orders.service2';
import {OrdersServiceThree} from './dashboard/orders.service3';
import {OrdersServiceFour} from './dashboard/orders.service4';
import {OrdersServiceFive} from './dashboard/orders.service5';
import {OrdersServiceSix} from './dashboard/orders.service6';
import {AsyncPipe, DatePipe, DecimalPipe, TitleCasePipe, UpperCasePipe} from '@angular/common';
import {from, of} from 'rxjs';
import {GenieComponent} from 'genie';

@Component({
  standalone: true,
  selector: 'app-root',
  imports: [GenieComponent, DashboardShellComponent, UpperCasePipe, TitleCasePipe, DecimalPipe, AsyncPipe],
  templateUrl: './app.html',
  providers: [
    OrdersService,
    DashboardShellService,

    OrdersServiceTwo,
    OrdersServiceThree,
    OrdersServiceFour,
    OrdersServiceFive,
    OrdersServiceSix,
    DatePipe
  ]
})
export class App {
  test1$ = of('test1');
  test2$ = from(['test1', 'test2', 'test3']);

  er = inject(ElementRef);
  r = inject(Renderer2);

  constructor(vcr: ChangeDetectorRef) {
  }
}
