import {Component} from '@angular/core';
import {GenieComponent} from 'genie';
import {RouterOutlet} from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-root',
  imports: [GenieComponent, RouterOutlet],
  template: `
    <div class="app-surface">
      <ngx-genie></ngx-genie>
      <router-outlet></router-outlet>
    </div>
  `
})
export class App {
}
