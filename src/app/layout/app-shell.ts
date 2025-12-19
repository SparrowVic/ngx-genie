import {CommonModule, DOCUMENT} from '@angular/common';
import {Component, OnInit, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';
import {CardModule} from 'primeng/card';
import {DividerModule} from 'primeng/divider';
import {MenuItem} from 'primeng/api';
import {PanelMenuModule} from 'primeng/panelmenu';
import {TagModule} from 'primeng/tag';
import {ToolbarModule} from 'primeng/toolbar';
import {ToggleSwitchModule} from 'primeng/toggleswitch';

@Component({
  standalone: true,
  selector: 'app-shell',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    ToolbarModule,
    PanelMenuModule,
    CardModule,
    TagModule,
    DividerModule,
    ToggleSwitchModule
  ],
  template: `
    <div class="doc-shell">
      <p-toolbar class="topbar">
        <ng-template #start>
          <div class="topbar__brand">
            <span class="eyebrow">ngx-genie</span>
            <h1>GenieOS Docs</h1>
            <p class="muted">Angular Dependency Inspector</p>
          </div>
        </ng-template>
        <ng-template #center>
          <nav class="topbar__nav">
            <a
              *ngFor="let link of navLinks"
              [routerLink]="link.path"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{exact: true}"
            >
              {{ link.label }}
            </a>
          </nav>
        </ng-template>
        <ng-template #end>
          <div class="topbar__actions">
            <div class="theme-switch">
              <span class="label">Theme</span>
              <p-toggleswitch [(ngModel)]="isDark" (ngModelChange)="applyTheme()"></p-toggleswitch>
            </div>
            <div class="shortcut-hint">
              <span class="label">Shortcut</span>
              <span class="shortcut-key">F1</span>
            </div>
            <a class="topbar__link" [href]="repoUrl" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
        </ng-template>
      </p-toolbar>

      <div class="doc-body">
        <aside class="doc-sidebar">
          <p-panelmenu [model]="navItems"></p-panelmenu>

          <p-card class="sidebar-note">
            <ng-template #title>Requirements</ng-template>
            <ul class="note-list">
              <li>Angular 18+ with Signals and Standalone APIs.</li>
              <li>Development mode (needs window.ng debug hooks).</li>
              <li>Add <code>&lt;ngx-genie /&gt;</code> once in AppComponent.</li>
            </ul>
            <div class="note-tags">
              <p-tag value="Dev Mode" severity="info"></p-tag>
              <p-tag value="Overlay" severity="success"></p-tag>
            </div>
          </p-card>
        </aside>

        <main class="doc-content">
          <router-outlet></router-outlet>
          <p-divider></p-divider>
          <div class="doc-footer">
            <div>
              <h4>GenieOS Documentation</h4>
              <p class="muted">
                A calmer, developer-first guide to the ngx-genie overlay, diagnostics, and dependency views.
              </p>
            </div>
            <div class="footer-meta">
              <p-tag value="Angular 21" severity="info"></p-tag>
              <p-tag value="PrimeNG 21" severity="success"></p-tag>
              <p-tag value="Devtools" severity="warn"></p-tag>
            </div>
          </div>
        </main>
      </div>
    </div>
  `
})
export class AppShellComponent implements OnInit {
  private document = inject(DOCUMENT);

  navLinks = [
    {label: 'Overview', path: '/overview'},
    {label: 'Getting Started', path: '/getting-started'},
    {label: 'Views', path: '/views'},
    {label: 'Inspector', path: '/inspector'},
    {label: 'Diagnostics', path: '/diagnostics'},
    {label: 'Architecture', path: '/architecture'}
  ];

  navItems: MenuItem[] = [
    {
      label: 'Getting Started',
      items: [
        {label: 'Overview', routerLink: '/overview'},
        {label: 'Install & Configure', routerLink: '/getting-started'}
      ]
    },
    {
      label: 'Guides',
      items: [
        {label: 'Views & Visualizations', routerLink: '/views'},
        {label: 'Inspector & Filters', routerLink: '/inspector'}
      ]
    },
    {
      label: 'Diagnostics',
      items: [
        {label: 'Issue Catalog', routerLink: '/diagnostics'}
      ]
    },
    {
      label: 'Internals',
      items: [
        {label: 'Architecture', routerLink: '/architecture'}
      ]
    }
  ];

  repoUrl = 'https://github.com/SparrowVic/ngx-genie';
  isDark = false;

  ngOnInit(): void {
    const stored = this.getStoredTheme();
    this.isDark = stored ?? this.prefersDarkMode();
    this.applyTheme();
  }

  applyTheme(): void {
    const root = this.document.documentElement;
    if (this.isDark) {
      root.classList.add('p-dark');
    } else {
      root.classList.remove('p-dark');
    }
    this.storeTheme(this.isDark ? 'dark' : 'light');
  }

  private prefersDarkMode(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return false;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  private getStoredTheme(): boolean | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const value = localStorage.getItem('genie-theme');
    if (value === 'dark') {
      return true;
    }
    if (value === 'light') {
      return false;
    }
    return null;
  }

  private storeTheme(theme: 'light' | 'dark'): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem('genie-theme', theme);
  }
}
