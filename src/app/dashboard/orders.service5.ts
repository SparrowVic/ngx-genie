import {Injectable, signal, computed} from '@angular/core';

@Injectable()
export class OrdersServiceFive {
  readonly id = 'OrdersService5';


  status = signal<'active' | 'idle' | 'error'>('active');


  isHealthy = computed(() => this.status() === 'active');

  constructor() {
  }
}
