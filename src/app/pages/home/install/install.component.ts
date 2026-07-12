import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { InstallService } from '../../../core/services/install.service';
import { HotkeyService } from '../../../core/services/hotkey.service';
import { SectionHeaderComponent } from '../../../shared/ui/section-header/section-header.component';
import { CodeBlockComponent } from '../../../shared/ui/code-block/code-block.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { InstallPickerComponent } from '../../../shared/install-picker/install-picker.component';
import { RevealOnScrollDirective } from '../../../core/directives/reveal-on-scroll.directive';
import { PluralizePipe } from '../../../core/pipes/pluralize.pipe';

/**
 * app-install — "Up and running in 30 seconds". A shared package-manager picker
 * (app-install-picker) whose selection reactively drives the install command,
 * followed by the three numbered setup steps, each with its own copyable code
 * block.
 */
@Component({
  selector: 'app-install',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SectionHeaderComponent,
    CodeBlockComponent,
    IconComponent,
    InstallPickerComponent,
    RevealOnScrollDirective,
    PluralizePipe,
  ],
  templateUrl: './install.component.html',
  styleUrl: './install.component.scss',
})
export class InstallComponent {
  protected readonly install = inject(InstallService);
  private readonly hotkey = inject(HotkeyService);

  /** Section subtitle — mentions the configured overlay hotkey. */
  protected readonly subtitle = `Add the dev dependency, register one standalone provider, then press ${this.hotkey.key}. GenieOS is tree-shaken out of production builds — zero runtime cost where it counts.`;
}
