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
  templateUrl: './colors.html',
})
export class Colors {


  constructor(
    private logger: OrdersService,
    private auth: OrdersServiceTwo,
    private data: OrdersServiceThree
  ) {
  }
}
