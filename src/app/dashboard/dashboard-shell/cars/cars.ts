import {Component} from '@angular/core';

import {interval, Subscription} from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-cars',
  imports: [],
  template: `
    <p>cars works!</p>
    @for (i of [1,1,1]; track i) {
      <div>ngFor test</div>
    }
    @if (true) {
      <div>ngIf test</div>
    }
    `
})
export class Cars {
  // @ts-ignore
  private dataSubscription: Subscription;
  private otherSub = new Subscription();

  constructor() {
    // this.dataSubscription = interval(1000).pipe().subscribe(val => console.log(val));
  }
}
