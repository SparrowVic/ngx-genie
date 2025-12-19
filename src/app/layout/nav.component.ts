import {Component, effect, signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import {RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';
import {ButtonModule} from 'primeng/button';

@Component({
  standalone: true,
  selector: 'app-nav',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ButtonModule],
  template: `
    <div class="app-layout" [class.dark-theme]="isDark()">
      <nav class="main-nav">
        <div class="nav-content">
          <a routerLink="/" class="nav-brand">
            <span class="brand-icon">🧞</span>
            <span class="brand-name">GenieOS</span>
            <span class="brand-badge">Angular DI Inspector</span>
          </a>

          <div class="nav-links">
            <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">
              Home
            </a>
            <a routerLink="/features" routerLinkActive="active">
              Features
            </a>
            <a routerLink="/playground" routerLinkActive="active">
              Playground
            </a>
            <a routerLink="/docs" routerLinkActive="active">
              Docs
            </a>
          </div>

          <div class="nav-actions">
            <button
              class="theme-toggle"
              (click)="toggleTheme()"
              [title]="isDark() ? 'Switch to light mode' : 'Switch to dark mode'">
              <i [class]="isDark() ? 'pi pi-sun' : 'pi pi-moon'"></i>
            </button>

            <a
              href="https://github.com/SparrowVic/ngx-genie"
              target="_blank"
              rel="noopener noreferrer"
              class="github-link"
              title="View on GitHub">
              <i class="pi pi-github"></i>
            </a>
          </div>
        </div>
      </nav>

      <main class="main-content">
        <router-outlet></router-outlet>
      </main>

      <footer class="main-footer">
        <div class="footer-content">
          <div class="footer-brand">
            <span class="brand-icon">🧞</span>
            <span class="brand-name">GenieOS</span>
          </div>

          <div class="footer-links">
            <a routerLink="/features">Features</a>
            <span class="separator">•</span>
            <a routerLink="/docs">Docs</a>
            <span class="separator">•</span>
            <a href="https://github.com" target="_blank">GitHub</a>
            <span class="separator">•</span>
            <a href="https://github.com" target="_blank">Issues</a>
          </div>

          <div class="footer-copyright">
            <p>Built with Angular & PrimeNG</p>
            <p>MIT License © 2024</p>
          </div>
        </div>
      </footer>
    </div>
  `,
  styles: [`
    :host {
      display: contents;
    }
  `]
})
export class NavComponent {
  isDark = signal(false);

  constructor() {
    const stored = localStorage.getItem('genie-playground-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialDark = stored === 'dark' || (!stored && prefersDark);
    this.isDark.set(initialDark);

    effect(() => {
      if (this.isDark()) {
        document.documentElement.classList.add('p-dark');
      } else {
        document.documentElement.classList.remove('p-dark');
      }
    });
  }

  toggleTheme() {
    const newValue = !this.isDark();
    this.isDark.set(newValue);
    localStorage.setItem('genie-playground-theme', newValue ? 'dark' : 'light');
  }
}
