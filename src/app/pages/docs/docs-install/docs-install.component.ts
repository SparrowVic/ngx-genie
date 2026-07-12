import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DocSection } from '../../../core/models/content.model';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { InstallPickerComponent } from '../../../shared/install-picker/install-picker.component';

/**
 * app-docs-install — the Installation block in the docs reading column: an iconed
 * heading and lead paragraph (from the shared docs content) followed by the
 * interactive package-manager picker whose selection swaps the install command.
 * Carries the section id so the table of contents can scroll to and highlight it.
 */
@Component({
  standalone: true,
  selector: 'app-docs-install',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './docs-install.component.html',
  styleUrl: './docs-install.component.scss',
  imports: [IconComponent, InstallPickerComponent],
})
export class DocsInstallComponent {
  readonly section = input.required<DocSection>();

  /** In-page anchor target for deep-linking the Installation section. */
  readonly anchor = computed(() => `#${this.section().id}`);
}
