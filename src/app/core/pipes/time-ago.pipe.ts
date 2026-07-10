import { Pipe, PipeTransform } from '@angular/core';

/**
 * Relative time. Pass ClockService.now() as the second argument so the pipe
 * recomputes reactively every tick: {{ ts | timeAgo: clock.now() }}.
 */
@Pipe({ name: 'timeAgo' })
export class TimeAgoPipe implements PipeTransform {
  transform(value: number | null | undefined, now: number = Date.now()): string {
    if (value == null) return '';
    const diff = Math.max(0, now - value);
    const s = Math.floor(diff / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }
}
