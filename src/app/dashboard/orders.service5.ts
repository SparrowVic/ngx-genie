import {Injectable, signal, computed, linkedSignal} from '@angular/core';

@Injectable()
export class OrdersServiceFive {
  readonly id = 'OrdersService5';


  status = signal<'active' | 'idle' | 'error'>('active');


  errorCode = linkedSignal({
    source: this.status,
    computation: (currentStatus, previous) => currentStatus === 'error' ? 500 : null
  });


  isHealthy = computed(() => this.status() === 'active');

  constructor() {
  }
}
