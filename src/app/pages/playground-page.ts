import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

@Component({
  standalone: true,
  selector: 'app-playground',
  imports: [CommonModule, CardModule, ButtonModule, TagModule],
  template: `
    <div class="playground-page">
      <div class="page-hero">
        <p-tag value="Interactive Demo" severity="success" [rounded]="true"></p-tag>
        <h1>Try GenieOS Live</h1>
        <p class="lead">
          This playground itself is an Angular application with GenieOS installed.
          Press <kbd>F1</kbd> to open the inspector and explore this app's structure!
        </p>
      </div>

      <div class="playground-content">
        <p-card class="instruction-card">
          <ng-template pTemplate="header">
            <div class="card-header-custom">
              <div class="header-icon">⌨️</div>
              <h3>Press F1 to Open GenieOS</h3>
            </div>
          </ng-template>

          <p>
            The keyboard shortcut will toggle the GenieOS inspector panel. Once open, you can:
          </p>

          <div class="instruction-list">
            <div class="instruction-item">
              <div class="step-number">1</div>
              <div class="step-content">
                <h4>Choose a View</h4>
                <p>Switch between Tree, Org Chart, Constellation, Matrix, or Diagnostics views</p>
              </div>
            </div>

            <div class="instruction-item">
              <div class="step-number">2</div>
              <div class="step-content">
                <h4>Explore the Tree</h4>
                <p>Click on components to inspect their dependencies and state</p>
              </div>
            </div>

            <div class="instruction-item">
              <div class="step-number">3</div>
              <div class="step-content">
                <h4>Apply Filters</h4>
                <p>Use the options panel to filter by type, hide framework code, or search</p>
              </div>
            </div>

            <div class="instruction-item">
              <div class="step-number">4</div>
              <div class="step-content">
                <h4>Run Diagnostics</h4>
                <p>Switch to Diagnostics view to see your application's integrity score</p>
              </div>
            </div>
          </div>
        </p-card>

        <div class="demo-grid">
          <p-card class="demo-card">
            <ng-template pTemplate="header">
              <div class="demo-header tree-demo">
                <span class="demo-icon">🌳</span>
              </div>
            </ng-template>
            <h3>Tree View</h3>
            <p>See the hierarchical structure of this playground application</p>
          </p-card>

          <p-card class="demo-card">
            <ng-template pTemplate="header">
              <div class="demo-header chart-demo">
                <span class="demo-icon">📊</span>
              </div>
            </ng-template>
            <h3>Org Chart</h3>
            <p>Visualize component relationships in an org chart layout</p>
          </p-card>

          <p-card class="demo-card">
            <ng-template pTemplate="header">
              <div class="demo-header constellation-demo">
                <span class="demo-icon">✨</span>
              </div>
            </ng-template>
            <h3>Constellation</h3>
            <p>Watch the physics-based graph animate and settle</p>
          </p-card>

          <p-card class="demo-card">
            <ng-template pTemplate="header">
              <div class="demo-header matrix-demo">
                <span class="demo-icon">🎯</span>
              </div>
            </ng-template>
            <h3>Matrix</h3>
            <p>Explore the dependency matrix with Matrix rain</p>
          </p-card>

          <p-card class="demo-card">
            <ng-template pTemplate="header">
              <div class="demo-header diagnostics-demo">
                <span class="demo-icon">🔍</span>
              </div>
            </ng-template>
            <h3>Diagnostics</h3>
            <p>Check the integrity score of this application</p>
          </p-card>
        </div>

        <div class="playground-tips">
          <h3>💡 Pro Tips</h3>
          <div class="tips-grid">
            <div class="tip">
              <strong>Live Watch:</strong> Enable live watch mode to see real-time updates as your app changes
            </div>
            <div class="tip">
              <strong>Deep Focus:</strong> Right-click a component to focus only on its subtree
            </div>
            <div class="tip">
              <strong>Filter Presets:</strong> Save your favorite filter configurations for quick access
            </div>
            <div class="tip">
              <strong>Export Data:</strong> Copy diagnostic reports to clipboard for sharing with your team
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class PlaygroundPage {}
