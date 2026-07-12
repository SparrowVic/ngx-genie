import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { RippleDirective } from '../../../core/directives/ripple.directive';
import { MagneticDirective } from '../../../core/directives/magnetic.directive';
import { ThemeService } from '../../../core/services/theme.service';
import { CommandPaletteService } from '../../../core/services/command-palette.service';
import { APP_BRAND } from '../../../core/tokens/brand.token';

/**
 * app-nav-actions — the trailing cluster: a command-palette trigger (with the
 * platform-aware shortcut kbd), a theme toggle wired to ThemeService, and a
 * GitHub link resolved from the brand token.
 */
@Component({
  standalone: true,
  selector: 'app-nav-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './nav-actions.component.html',
  styleUrl: './nav-actions.component.scss',
  imports: [IconComponent, RippleDirective, MagneticDirective],
})
export class NavActionsComponent {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly theme = inject(ThemeService);
  protected readonly palette = inject(CommandPaletteService);
  protected readonly brand = inject(APP_BRAND);

  /** ⌘K on Apple platforms, Ctrl K elsewhere. */
  protected readonly shortcut = this.detectShortcut();

  protected toggleTheme(): void {
    this.theme.toggle();
  }

  protected openPalette(): void {
    this.palette.openPalette();
  }

  private detectShortcut(): string {
    if (!this.isBrowser) return 'Ctrl K';
    const probe = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
    return /Mac|iPhone|iPad|iPod/i.test(probe) ? '⌘ K' : 'Ctrl K';
  }
}
