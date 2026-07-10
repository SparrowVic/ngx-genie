import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ScrollSpyService } from '../../core/services/scroll-spy.service';
import { ThemeService } from '../../core/services/theme.service';
import { CommandPaletteService } from '../../core/services/command-palette.service';
import { FEATURE_FLAGS } from '../../core/tokens/feature-flags.token';
import { NavLogoComponent } from './nav-logo/nav-logo.component';
import { NavLinksComponent } from './nav-links/nav-links.component';
import { NavActionsComponent } from './nav-actions/nav-actions.component';
import { CommandPaletteComponent } from './command-palette/command-palette.component';
import { CosmicBackgroundComponent } from '../cosmic-background/cosmic-background.component';
import { FooterComponent } from '../footer/footer.component';
import { ToastHostComponent } from '../toast-host/toast-host.component';

/**
 * app-nav — the router shell for the whole site. Paints the cosmic background,
 * a sticky glass top bar (logo · links · actions), a scroll-progress hairline,
 * the routed <main>, the footer, the command palette and the toast host.
 * Drives ScrollSpyService from the window scroll position and opens the palette
 * on ⌘K / Ctrl-K.
 */
@Component({
  selector: 'app-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './nav.component.html',
  styleUrl: './nav.component.scss',
  imports: [
    RouterOutlet,
    CosmicBackgroundComponent,
    NavLogoComponent,
    NavLinksComponent,
    NavActionsComponent,
    FooterComponent,
    CommandPaletteComponent,
    ToastHostComponent,
  ],
  host: {
    class: 'app-shell',
    '[class.is-cosmic]': 'theme.isDark()',
    '(window:scroll)': 'onScroll()',
    '(window:resize)': 'onScroll()',
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class NavComponent {
  protected readonly scrollSpy = inject(ScrollSpyService);
  protected readonly theme = inject(ThemeService);
  protected readonly flags = inject(FEATURE_FLAGS);
  private readonly palette = inject(CommandPaletteService);

  /** Map the window scroll position onto the shared scroll-progress signal. */
  protected onScroll(): void {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    this.scrollSpy.setProgress(max > 0 ? window.scrollY / max : 0);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.flags.commandPalette) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.palette.toggle();
    }
  }
}
