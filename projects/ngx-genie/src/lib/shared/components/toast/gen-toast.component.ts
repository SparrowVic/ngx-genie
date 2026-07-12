import {ChangeDetectionStrategy, Component, ViewEncapsulation, inject} from '@angular/core';
import {GenieToastService} from '../../services/genie-toast.service';

/**
 * Shared, ephemeral toast surface. Render ONCE inside the overlay window; it reflects
 * {@link GenieToastService.toast} and lets the user dismiss it early. ShadowDom so it stays visually
 * isolated from the host app.
 */
@Component({
  selector: 'gen-toast',
  templateUrl: './gen-toast.component.html',
  styleUrl: './gen-toast.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class GenToastComponent {
  private readonly toastService = inject(GenieToastService);
  protected readonly toast = this.toastService.toast;

  protected dismiss(): void {
    this.toastService.dismiss();
  }
}
