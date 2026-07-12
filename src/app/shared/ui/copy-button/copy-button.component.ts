import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  PLATFORM_ID,
  inject,
  input,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { IconComponent } from '../icon/icon.component';

/**
 * ui-copy-button — writes `value` to the clipboard and briefly flips to a "Copied!"
 * confirmation state (~1.6s). Clipboard access is guarded for non-browser platforms and
 * falls back to a legacy execCommand path where the async Clipboard API is unavailable.
 */
@Component({
  selector: 'ui-copy-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  templateUrl: './copy-button.component.html',
  styleUrl: './copy-button.component.scss',
})
export class CopyButtonComponent implements OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly value = input.required<string>();
  readonly label = input('Copy');

  readonly copied = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  copy(): void {
    if (!this.isBrowser) return;
    const text = this.value();
    const clipboard = navigator.clipboard;
    if (clipboard?.writeText) {
      clipboard.writeText(text).then(
        () => this.flash(),
        () => this.legacyCopy(text),
      );
    } else {
      this.legacyCopy(text);
    }
  }

  private legacyCopy(text: string): void {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-9999px';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
      this.flash();
    } catch {
      /* Clipboard unavailable in this context — silently ignore. */
    }
  }

  private flash(): void {
    this.copied.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.copied.set(false), 1600);
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }
}
