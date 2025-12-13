import {Injectable, signal, linkedSignal} from '@angular/core';

@Injectable({providedIn: 'platform', useValue: 3})
export class OrdersServiceFour {
  readonly id = 'OrdersService4';


  multiplier = signal(3);
  multiplier33 = signal(333);
  multiplier44 = signal(44);


  calculatedValue = linkedSignal(() => this.multiplier() * 100);

  constructor() {
  }
}
