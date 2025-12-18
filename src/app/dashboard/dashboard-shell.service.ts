import {Injectable, signal, computed} from '@angular/core';

@Injectable()
export class DashboardShellService {
  readonly id = 'DashboardShellService';

  counter = signal(0);


  currentUser = signal('Admin User');


  activityLevel = computed(() => this.counter() > 10 ? 'High' : 'Low');

  constructor() {
  }
}
