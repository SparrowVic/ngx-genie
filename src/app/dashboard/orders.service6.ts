import {Injectable, signal, computed} from '@angular/core';
import {OrdersServiceFive} from './orders.service5';
import {OrdersServiceThree} from './orders.service3';
import {OrdersServiceTwo} from './orders.service2';
import {OrdersService} from './orders.service';

@Injectable({
  providedIn: 'platform',
  useFactory: (required: OrdersServiceThree, optional?: OrdersServiceFive) => {
    return new OrdersServiceTwo();
  },
  deps: [OrdersServiceThree, [new OrdersServiceFive(), OrdersService]]

})
export class OrdersServiceSix {
  readonly id = 'OrdersService6';


  factoryTimestamp = signal(Date.now());
  instantiationSource = signal('platform-injector');


  debugInfo = computed(() => `${this.id} created at ${this.factoryTimestamp()}`);

  constructor() {
  }
}
