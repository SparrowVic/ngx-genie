import { ChangeDetectionStrategy, Component, ElementRef, inject } from '@angular/core';
import { InstallService } from '../../../core/services/install.service';
import { PackageManager } from '../../../core/models/install.model';
import { SectionHeaderComponent } from '../../../shared/ui/section-header/section-header.component';
import { CodeBlockComponent } from '../../../shared/ui/code-block/code-block.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { RevealOnScrollDirective } from '../../../core/directives/reveal-on-scroll.directive';
import { PluralizePipe } from '../../../core/pipes/pluralize.pipe';

/**
 * app-install — "Up and running in 30 seconds". A package-manager picker whose
 * selection reactively drives the install command, followed by the three
 * numbered setup steps, each with its own copyable code block.
 */
@Component({
  selector: 'app-install',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SectionHeaderComponent,
    CodeBlockComponent,
    IconComponent,
    RevealOnScrollDirective,
    PluralizePipe,
  ],
  templateUrl: './install.component.html',
  styleUrl: './install.component.scss',
})
export class InstallComponent {
  protected readonly install = inject(InstallService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected select(manager: PackageManager): void {
    this.install.select(manager);
  }

  /**
   * Roving-tabindex keyboard support for the package-manager tablist:
   * arrows cycle through the managers, Home/End jump, selection follows focus.
   */
  protected onTablistKeydown(event: KeyboardEvent): void {
    const managers = this.install.commands().map((c) => c.manager);
    const current = managers.indexOf(this.install.manager());
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (current + 1) % managers.length;
        break;
      case 'ArrowLeft':
        next = (current - 1 + managers.length) % managers.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = managers.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const manager = managers[next];
    this.select(manager);
    this.host.nativeElement.querySelector<HTMLElement>(`#pm-tab-${manager}`)?.focus();
  }
}
