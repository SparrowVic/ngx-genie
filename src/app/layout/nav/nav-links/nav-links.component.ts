import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { ScrollSpyService } from '../../../core/services/scroll-spy.service';
import { NavLink } from '../../../core/models/nav.model';

/**
 * app-nav-links — the primary navigation rail. Renders a typed NavLink[] with
 * RouterLink/RouterLinkActive + ui-icon. Reads ScrollSpyService.scrolled() to
 * tighten the rail once the page starts moving.
 */
@Component({
  standalone: true,
  selector: 'app-nav-links',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './nav-links.component.html',
  styleUrl: './nav-links.component.scss',
  imports: [RouterLink, RouterLinkActive, IconComponent],
})
export class NavLinksComponent {
  private readonly scrollSpy = inject(ScrollSpyService);

  /** Whether the viewport has scrolled past the fold — drives a compact rail. */
  protected readonly scrolled = this.scrollSpy.scrolled;

  protected readonly links: readonly NavLink[] = [
    { label: 'Home', path: '/', icon: 'home', exact: true },
    { label: 'Features', path: '/features', icon: 'sparkles' },
    { label: 'Playground', path: '/playground', icon: 'flask' },
    { label: 'Docs', path: '/docs', icon: 'book' },
  ];
}
