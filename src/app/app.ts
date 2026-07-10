import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GenieComponent } from 'genie';
import { RouterOutlet } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ThemeService } from './core/services/theme.service';
import { APP_BRAND } from './core/tokens/brand.token';

@Component({
  selector: 'app-root',
  imports: [GenieComponent, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly titleService = inject(Title);
  /** Injected so the theme effect activates immediately on boot. */
  protected readonly theme = inject(ThemeService);
  protected readonly brand = inject(APP_BRAND);

  constructor() {
    this.titleService.setTitle(`${this.brand.name} — ${this.brand.tagline}`);
  }
}
