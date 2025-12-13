import {Injectable, signal} from '@angular/core';

@Injectable({providedIn: 'root'})
export class OrdersServiceThree {
  readonly id = 'OrdersServiceThree';


  config = signal({theme: 'dark', language: 'pl'});


  notificationsCount = signal(5);

  constructor() {
  }
}
