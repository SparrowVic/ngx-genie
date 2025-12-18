import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  InjectionToken,
  Renderer2, signal, Signal,
} from '@angular/core';
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
import {THEME_SIGNAL, ThemeConsumer} from './dashboard/theme-consumer/theme-consumer';
import {Router} from '@angular/router';

export const CONFIG_SIGNAL = new InjectionToken<Signal<number>>('ConfigSignal');

@Component({
  standalone: true,
  selector: 'app-root',
  imports: [GenieComponent, DashboardShellComponent, UpperCasePipe, TitleCasePipe, DecimalPipe, AsyncPipe, ThemeConsumer],
  providers: [
    OrdersService,
    DashboardShellService,

    OrdersServiceTwo,
    OrdersServiceThree,
    OrdersServiceFour,
    OrdersServiceFive,
    OrdersServiceSix,
    DatePipe,

    Router,

    {
      provide: CONFIG_SIGNAL,
      useValue: signal(100)
    },
    {
      provide: THEME_SIGNAL,
      useValue: signal('Dark Mode 🌑')
    }
  ],
  template: `
    <ngx-genie></ngx-genie>
    <app-dashboard-shell></app-dashboard-shell>

    <div>
      {{ "aaaaa" | uppercase }}
    </div>


    <div>
      {{ "bbbbb" | titlecase }}
    </div>


    <div>
      {{ "123" |number }}
    </div>

    <div>
      {{ test1$ | async }}
    </div>


    <h2>Dostawca Sygnału</h2>
    <app-theme-consumer/>
  `
})
export class App {
  test1$ = of('test1');
  test2$ = from(['test1', 'test2', 'test3']);

  er = inject(ElementRef);
  r = inject(Renderer2);

  constructor(
    vcr: ChangeDetectorRef,
  ) {
  }
}
