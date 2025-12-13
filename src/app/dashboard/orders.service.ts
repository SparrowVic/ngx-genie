import {Injectable, signal, computed, linkedSignal} from '@angular/core';
import {of} from 'rxjs';

@Injectable()
export class OrdersService {
  readonly id = 'OrdersService';
  sub = of(123);

  constructor() {
    this.sub.subscribe()
  }

  orders = signal([
    {id: 1, name: 'Order A'},
    {id: 2, name: 'Order B'}
  ]);


  selectedOrderId = signal<number | null>(1);


  activeOrderDetails = linkedSignal(() => {
    return this.orders().find(o => o.id === this.selectedOrderId()) || null;
  });
}
