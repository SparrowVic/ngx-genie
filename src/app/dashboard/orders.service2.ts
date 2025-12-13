import {Injectable, Self, signal, WritableSignal} from '@angular/core';

@Injectable({providedIn: 'root'})
export class OrdersServiceTwo {
  readonly id = 'OrdersService2';


  tags: WritableSignal<string[]> = signal(['urgent', 'new']);


  filterEnabled = signal(true);

  constructor() {
  }
}


export class Dependency {
}

@Injectable()


class NeedsDependency {
  constructor(@Self() dependency: Dependency) {
  }
}
