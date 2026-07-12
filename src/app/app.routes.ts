import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/nav/nav.component').then((m) => m.NavComponent),
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/home/home-page.component').then((m) => m.HomePageComponent),
      },
      {
        path: 'features',
        loadComponent: () => import('./pages/features/features-page.component').then((m) => m.FeaturesPageComponent),
      },
      {
        path: 'playground',
        loadComponent: () => import('./pages/playground/playground-page.component').then((m) => m.PlaygroundPageComponent),
      },
      {
        path: 'docs',
        loadComponent: () => import('./pages/docs/docs-page.component').then((m) => m.DocsPageComponent),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
