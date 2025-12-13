import {Component, inject} from '@angular/core';
import {DashboardShellService} from '../../dashboard-shell.service';


@Component({
  standalone: true,
  selector: 'app-users-list',
  templateUrl: './users-list.component.html',
  styleUrls: ['./users-list.component.scss'],
  providers: [
    DashboardShellService,
  ]
})
export class UsersListComponent {
  constructor(readonly shell: DashboardShellService,
  ) {
  }
}
