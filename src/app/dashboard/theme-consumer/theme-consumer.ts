import {Component, inject, InjectionToken, Signal} from '@angular/core';

export const THEME_SIGNAL = new InjectionToken<Signal<string>>('ThemeSignal');

@Component({
  selector: 'app-theme-consumer',
  standalone: true,
  imports: [],
  template: `
    <div style="border: 1px solid #ccc; padding: 10px;">
      <h3>Konsument</h3>
      <p>Aktualny motyw: <strong>{{ theme() }}</strong></p>
    </div>
  `
})
export class ThemeConsumer {
  theme = inject(THEME_SIGNAL);
}
