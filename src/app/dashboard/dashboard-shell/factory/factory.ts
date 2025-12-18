import {ChangeDetectorRef, Component, ElementRef} from '@angular/core';
import {DashboardShellService} from '../../dashboard-shell.service';

@Component({
  standalone: true,
  selector: 'app-factory',
  imports: [],
  providers: [DashboardShellService],
  template: `
    <p>factory works!</p>
  `
})
export class Factory {
  constructor(elRef: ElementRef, cdRef: ChangeDetectorRef, readonly shell: DashboardShellService) {
  }

}
