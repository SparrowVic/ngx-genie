import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';
import { InstallService } from '../../core/services/install.service';
import { PackageManager } from '../../core/models/install.model';
import { CodeBlockComponent } from '../ui/code-block/code-block.component';
import { IconComponent } from '../ui/icon/icon.component';

/**
 * app-install-picker — the package-manager tablist (npm · pnpm · yarn · bun)
 * whose selection reactively drives the install command shown in a copyable code
 * frame. Selection is roving-tabindex accessible (arrows / Home / End), and the
 * chosen manager persists in {@link InstallService} so every picker on the site
 * stays in sync. Shared by the home "quick start" and the docs Installation
 * section.
 */
@Component({
  selector: 'app-install-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CodeBlockComponent, IconComponent],
  templateUrl: './install-picker.component.html',
  styleUrl: './install-picker.component.scss',
})
export class InstallPickerComponent {
  protected readonly install = inject(InstallService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Filename badge shown on the command's code frame. */
  readonly filename = input('Terminal');

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
