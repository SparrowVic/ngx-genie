import {
  NgModule,
  ModuleWithProviders,
  APP_INITIALIZER,
  inject,
  ApplicationRef
} from '@angular/core';

import {GenieComponent} from './components/genie/genie.component';
import {GenieRegistryService} from './services/genie-registry.service';
import {GenieConfig} from './models/genie-config.model';
import {DEFAULT_GENIE_CONFIG} from './configs/genie-config';
import {GENIE_CONFIG} from './tokens/genie-config.token';

/**
 * NgModule for ngx-genie that provides compatibility with NgModule-based applications.
 *
 * @usageNotes
 * Import `GenieModule.forRoot()` in your root AppModule:
 *
 * ```typescript
 * import { GenieModule } from 'ngx-genie';
 *
 * @NgModule({
 *   imports: [
 *     BrowserModule,
 *     GenieModule.forRoot({ hotkey: 'F2', visibleOnStart: false })
 *   ],
 *   bootstrap: [AppComponent]
 * })
 * export class AppModule {}
 * ```
 *
 * Then add the `<ngx-genie>` component to your root component's template.
 *
 * For standalone applications, use `provideGenie()` instead.
 */
@NgModule({
  imports: [GenieComponent],
  exports: [GenieComponent],
})
export class GenieModule {
  /**
   * Configures the GenieModule for the root application module.
   *
   * @param config Optional configuration to customize ngx-genie behavior.
   * @returns A ModuleWithProviders containing the GenieModule and its required providers.
   */
  static forRoot(config: Partial<GenieConfig> = {}): ModuleWithProviders<GenieModule> {
    const merged: GenieConfig = {
      ...DEFAULT_GENIE_CONFIG,
      ...config,
    };

    return {
      ngModule: GenieModule,
      providers: [
        GenieRegistryService,
        {
          provide: GENIE_CONFIG,
          useValue: merged,
        },
        {
          provide: APP_INITIALIZER,
          multi: true,
          useFactory: () => {
            const registry = inject(GenieRegistryService);
            const appRef = inject(ApplicationRef);

            return () => {
              const sub = appRef.isStable.subscribe(isStable => {
                if (isStable) {
                  setTimeout(() => registry.scanApplication(), 500);
                  sub.unsubscribe();
                }
              });
            };
          }
        }
      ]
    };
  }
}
