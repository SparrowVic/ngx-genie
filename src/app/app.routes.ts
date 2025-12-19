import {Routes} from '@angular/router';
import {AppShellComponent} from './layout/app-shell';
import {ArchitecturePageComponent} from './pages/architecture.page';
import {DiagnosticsPageComponent} from './pages/diagnostics.page';
import {GettingStartedPageComponent} from './pages/getting-started.page';
import {InspectorPageComponent} from './pages/inspector.page';
import {NotFoundPageComponent} from './pages/not-found.page';
import {OverviewPageComponent} from './pages/overview.page';
import {ViewsPageComponent} from './pages/views.page';

export const routes: Routes = [
  {
    path: '',
    component: AppShellComponent,
    children: [
      {path: '', pathMatch: 'full', redirectTo: 'overview'},
      {path: 'overview', component: OverviewPageComponent},
      {path: 'getting-started', component: GettingStartedPageComponent},
      {path: 'views', component: ViewsPageComponent},
      {path: 'inspector', component: InspectorPageComponent},
      {path: 'diagnostics', component: DiagnosticsPageComponent},
      {path: 'architecture', component: ArchitecturePageComponent},
      {path: '**', component: NotFoundPageComponent}
    ]
  }
];
