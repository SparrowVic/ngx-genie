import {CommonModule} from '@angular/common';
import {Component} from '@angular/core';
import {RouterLink} from '@angular/router';
import {ButtonModule} from 'primeng/button';

@Component({
  standalone: true,
  selector: 'app-not-found-page',
  imports: [CommonModule, RouterLink, ButtonModule],
  template: `
    <div class="doc-page">
      <section class="doc-section">
        <h1>Page not found</h1>
        <p class="lead">The documentation section you requested does not exist.</p>
        <div class="doc-actions">
          <p-button label="Go to Overview" routerLink="/overview"></p-button>
        </div>
      </section>
    </div>
  `
})
export class NotFoundPageComponent {}
