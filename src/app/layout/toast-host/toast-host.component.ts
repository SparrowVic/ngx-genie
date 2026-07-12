import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NotificationService, ToastTone } from '../../core/services/notification.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';

/** Maps each toast tone to its accent CSS custom property. */
const TONE_ACCENT: Record<ToastTone, string> = {
  info: 'var(--cyan)',
  success: 'var(--emerald)',
  warn: 'var(--amber)',
};

/**
 * app-toast-host — a fixed bottom-right stack that renders live notifications
 * from NotificationService. Each toast is a tone-tinted glass card with an icon,
 * copy and a dismiss control; a "Clear all" affordance appears once several
 * beacons are stacked.
 */
@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toast-host.component.html',
  styleUrl: './toast-host.component.scss',
  imports: [IconComponent],
})
export class ToastHostComponent {
  private readonly notifications = inject(NotificationService);

  readonly toasts = this.notifications.toasts;
  readonly count = this.notifications.count;

  /** Accent custom property for a toast, driving its border, icon and glow tint. */
  accentFor(tone: ToastTone): string {
    return TONE_ACCENT[tone];
  }

  dismiss(id: number): void {
    this.notifications.dismiss(id);
  }

  clearAll(): void {
    this.notifications.clear();
  }
}
