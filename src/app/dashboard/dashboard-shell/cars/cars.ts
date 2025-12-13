import {Component} from '@angular/core';
import {NgForOf, NgIf} from '@angular/common';
import {interval, Subscription} from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-cars',
  imports: [
    NgForOf,
    NgIf
  ],
  templateUrl: './cars.html',
})
export class Cars {
  // @ts-ignore
  private dataSubscription: Subscription;
  private otherSub = new Subscription();

  constructor() {
    // this.dataSubscription = interval(1000).pipe().subscribe(val => console.log(val));
  }
}
