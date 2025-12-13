import {Injectable, signal, linkedSignal, computed} from '@angular/core';

@Injectable()
export class DashboardShellService {
  readonly id = 'DashboardShellService';

  counter = signal(0);


  currentUser = signal('Admin User');


  dashboardTitle = linkedSignal({
    source: this.currentUser,
    computation: (user, previous) => `${user}'s Dashboard`
  });


  activityLevel = computed(() => this.counter() > 10 ? 'High' : 'Low');

  constructor() {
  }
}
