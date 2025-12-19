import { Routes } from '@angular/router';
import { NavComponent } from './layout/nav.component';

export const routes: Routes = [
  {
    path: '',
    component: NavComponent,
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/home.page').then(m => m.HomePage)
      },
      {
        path: 'features',
        loadComponent: () => import('./pages/features.page').then(m => m.FeaturesPage)
      },
      {
        path: 'playground',
        loadComponent: () => import('./pages/playground.page').then(m => m.PlaygroundPage)
      },
      {
        path: 'docs',
        loadComponent: () => import('./pages/docs.page').then(m => m.DocsPage)
      }
    ]
  }
];
