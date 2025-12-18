import {Injectable, signal} from '@angular/core';

@Injectable({providedIn: 'platform', useValue: 3})
export class OrdersServiceFour {
  readonly id = 'OrdersService4';

  multiplier = signal(3);
  multiplier33 = signal(333);
  multiplier44 = signal(44);

  constructor() {
  }
}
