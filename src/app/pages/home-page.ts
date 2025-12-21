import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';

@Component({
  standalone: true,
  selector: 'app-home',
  imports: [CommonModule, RouterLink, ButtonModule, CardModule, TagModule],
  template: `
    <div class="home-page">
      <!-- Hero Section -->
      <section class="hero">
        <div class="hero-content">
          <div class="hero-badge">
            <p-tag severity="success" value="Developer Tools" [rounded]="true"></p-tag>
            <span class="hero-version">v1.0.0</span>
          </div>

          <h1 class="hero-title">
            Make the Invisible
            <span class="gradient-text">Visible</span>
          </h1>

          <p class="hero-subtitle">
            GenieOS is the ultimate Angular DI inspector. Visualize your dependency injection tree,
            detect architectural issues, and understand your application like never before.
          </p>

          <div class="hero-actions">
            <p-button
              label="Get Started"
              icon="pi pi-arrow-right"
              iconPos="right"
              [routerLink]="['/docs']"
              styleClass="hero-btn-primary"></p-button>
            <p-button
              label="Try Playground"
              icon="pi pi-play"
              severity="secondary"
              [outlined]="true"
              [routerLink]="['/playground']"
              styleClass="hero-btn-secondary"></p-button>
          </div>

          <div class="hero-stats">
            <div class="stat">
              <div class="stat-value">5</div>
              <div class="stat-label">Visualization Modes</div>
            </div>
            <div class="stat">
              <div class="stat-value">8</div>
              <div class="stat-label">Diagnostic Checks</div>
            </div>
            <div class="stat">
              <div class="stat-value">Real-Time</div>
              <div class="stat-label">Live Monitoring</div>
            </div>
          </div>
        </div>

        <div class="hero-visual">
          <div class="visual-card card-tree">
            <div class="card-icon">🌳</div>
            <div class="card-title">Tree View</div>
          </div>
          <div class="visual-card card-chart">
            <div class="card-icon">📊</div>
            <div class="card-title">Org Chart</div>
          </div>
          <div class="visual-card card-constellation">
            <div class="card-icon">✨</div>
            <div class="card-title">Constellation</div>
          </div>
          <div class="visual-card card-matrix">
            <div class="card-icon">🎯</div>
            <div class="card-title">Matrix</div>
          </div>
          <div class="visual-card card-diagnostics">
            <div class="card-icon">🔍</div>
            <div class="card-title">Diagnostics</div>
          </div>
        </div>
      </section>

      <!-- Features Grid -->
      <section class="features-section">
        <div class="section-header">
          <p-tag value="Features" severity="info" [rounded]="true"></p-tag>
          <h2>Powerful Visualization & Analysis</h2>
          <p>Everything you need to understand your Angular application's architecture</p>
        </div>

        <div class="features-grid">
          <div class="feature-card">
            <div class="feature-icon tree-icon">🌳</div>
            <h3>Tree View</h3>
            <p>Classic hierarchical view of your component tree with collapsible nodes and dependency badges.</p>
            <a [routerLink]="['/features']" [fragment]="'tree'" class="feature-link">
              Explore Tree View <i class="pi pi-arrow-right"></i>
            </a>
          </div>

          <div class="feature-card">
            <div class="feature-icon chart-icon">📊</div>
            <h3>Org Chart</h3>
            <p>Beautiful organizational chart layout showing parent-child relationships at a glance.</p>
            <a [routerLink]="['/features']" [fragment]="'chart'" class="feature-link">
              Explore Org Chart <i class="pi pi-arrow-right"></i>
            </a>
          </div>

          <div class="feature-card">
            <div class="feature-icon constellation-icon">✨</div>
            <h3>Constellation View</h3>
            <p>Physics-based force-directed graph with interactive pan, zoom, and focus modes.</p>
            <a [routerLink]="['/features']" [fragment]="'constellation'" class="feature-link">
              Explore Constellation <i class="pi pi-arrow-right"></i>
            </a>
          </div>

          <div class="feature-card">
            <div class="feature-icon matrix-icon">🎯</div>
            <h3>Matrix View</h3>
            <p>High-performance dependency matrix with Matrix rain animation and virtual scrolling.</p>
            <a [routerLink]="['/features']" [fragment]="'matrix'" class="feature-link">
              Explore Matrix <i class="pi pi-arrow-right"></i>
            </a>
          </div>

          <div class="feature-card">
            <div class="feature-icon diagnostics-icon">🔍</div>
            <h3>Diagnostics</h3>
            <p>Automated issue detection with integrity scoring and actionable suggestions.</p>
            <a [routerLink]="['/features']" [fragment]="'diagnostics'" class="feature-link">
              Explore Diagnostics <i class="pi pi-arrow-right"></i>
            </a>
          </div>

          <div class="feature-card">
            <div class="feature-icon filter-icon">⚡</div>
            <h3>Advanced Filtering</h3>
            <p>Powerful filters with regex support, type filtering, and custom hide rules.</p>
            <a [routerLink]="['/features']" [fragment]="'filtering'" class="feature-link">
              Explore Filtering <i class="pi pi-arrow-right"></i>
            </a>
          </div>
        </div>
      </section>

      <!-- Use Cases -->
      <section class="use-cases-section">
        <div class="section-header">
          <p-tag value="Use Cases" [rounded]="true"></p-tag>
          <h2>Built for Every Developer Need</h2>
        </div>

        <div class="use-cases-grid">
          <p-card class="use-case-card">
            <ng-template pTemplate="header">
              <div class="use-case-header">
                <div class="use-case-icon">🐛</div>
                <h3>Debugging</h3>
              </div>
            </ng-template>
            <p>Track down singleton violations, memory leaks, and mysterious DI issues with real-time inspection.</p>
          </p-card>

          <p-card class="use-case-card">
            <ng-template pTemplate="header">
              <div class="use-case-header">
                <div class="use-case-icon">🏗️</div>
                <h3>Architecture</h3>
              </div>
            </ng-template>
            <p>Visualize dependency flow, identify high coupling, and ensure architectural best practices.</p>
          </p-card>

          <p-card class="use-case-card">
            <ng-template pTemplate="header">
              <div class="use-case-header">
                <div class="use-case-icon">⚡</div>
                <h3>Performance</h3>
              </div>
            </ng-template>
            <p>Find heavy state, detect change detection issues, and optimize your application's runtime.</p>
          </p-card>

          <p-card class="use-case-card">
            <ng-template pTemplate="header">
              <div class="use-case-header">
                <div class="use-case-icon">📚</div>
                <h3>Learning</h3>
              </div>
            </ng-template>
            <p>Understand how Angular DI works, explore existing codebases, and onboard new team members.</p>
          </p-card>
        </div>
      </section>

      <!-- CTA Section -->
      <section class="cta-section">
        <div class="cta-content">
          <h2>Ready to See Your App Differently?</h2>
          <p>Install GenieOS and start exploring your Angular application today.</p>
          <div class="cta-actions">
            <p-button
              label="Get Started"
              icon="pi pi-download"
              size="large"
              [routerLink]="['/docs']"></p-button>
            <p-button
              label="View on GitHub"
              icon="pi pi-github"
              severity="secondary"
              [outlined]="true"
              size="large"></p-button>
          </div>
        </div>
      </section>
    </div>
  `
})
export class HomePage {}
