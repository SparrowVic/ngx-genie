import {Component, inject} from '@angular/core';
import {DashboardShellService} from '../../dashboard-shell.service';


@Component({
  standalone: true,
  selector: 'app-users-list',
  providers: [
    DashboardShellService,
  ],
  template: `
    <div class="box">
      <p>Users list (uses DashboardShellService from parent)</p>
      <p>Service id: {{ shell.id }}</p>
    </div>
  `
})
export class UsersListComponent {
  constructor(readonly shell: DashboardShellService,
  ) {
  }
}
