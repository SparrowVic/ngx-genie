import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core';
import { NotificationService } from '../../../core/services/notification.service';
import { ButtonComponent } from '../../../shared/ui/button/button.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

/** Loose but honest email shape check — good enough for a demo opt-in. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * app-footer-newsletter — the "launch-ring" opt-in field. The address lives in a
 * two-way model() signal; validity and error visibility are derived with
 * computed(). Submitting a valid address pushes a success toast and resets.
 *
 * The opt-in is not wired to a backend yet, so the field and button ship
 * disabled behind a "coming soon" note. Flip {@link disabled} to `false` to
 * re-enable the (already-working) client-side flow once sign-ups launch.
 */
@Component({
  standalone: true,
  selector: 'app-footer-newsletter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './footer-newsletter.component.html',
  styleUrl: './footer-newsletter.component.scss',
  imports: [ButtonComponent, IconComponent],
})
export class FooterNewsletterComponent {
  private readonly notifications = inject(NotificationService);

  /** Sign-ups aren't live yet — the field and button are disabled until they are. */
  readonly disabled = true;

  /** Two-way bindable so a host could seed/read the value; also our source of truth. */
  readonly email = model('');
  readonly touched = signal(false);

  readonly valid = computed(() => EMAIL_PATTERN.test(this.email().trim()));
  readonly showError = computed(
    () => !this.disabled && this.touched() && this.email().trim().length > 0 && !this.valid(),
  );

  onInput(event: Event): void {
    this.email.set((event.target as HTMLInputElement).value);
  }

  submit(): void {
    if (this.disabled) return;
    this.touched.set(true);
    if (!this.valid()) return;

    const address = this.email().trim();
    this.notifications.push({
      title: 'You are on the launch ring',
      message: `${address} will receive GenieOS orbit updates and release beacons.`,
      tone: 'success',
      icon: 'sparkles',
    });
    this.email.set('');
    this.touched.set(false);
  }
}
