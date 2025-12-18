import {Component} from '@angular/core';
import {Cars} from '../cars/cars';
import {NgForOf} from '@angular/common';
import {OrdersService} from '../../orders.service';
import {OrdersServiceTwo} from '../../orders.service2';
import {OrdersServiceThree} from '../../orders.service3';

@Component({
  standalone: true,
  selector: 'app-colors',
  imports: [
    Cars,
    NgForOf
  ],
  template: `
    <p>colors works!</p>

    <app-cars></app-cars>

    <div *ngFor="let i of [1,1,1]">ngFor test</div>
  `
})
export class Colors {


  constructor(
    private logger: OrdersService,
    private auth: OrdersServiceTwo,
    private data: OrdersServiceThree
  ) {
  }
}
