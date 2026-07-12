import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../../../shared/ui/logo/logo.component';
import { MagneticDirective } from '../../../core/directives/magnetic.directive';
import { APP_BRAND } from '../../../core/tokens/brand.token';

/**
 * app-nav-logo — the brand anchor in the top bar. Wraps the animated ui-logo in
 * a home routerLink with a subtle magnetic pull, plus a mono codename badge
 * pulled straight from the brand token (so it shows up in the DI graph).
 */
@Component({
  selector: 'app-nav-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './nav-logo.component.html',
  styleUrl: './nav-logo.component.scss',
  imports: [RouterLink, LogoComponent, MagneticDirective],
})
export class NavLogoComponent {
  protected readonly brand = inject(APP_BRAND);
}
