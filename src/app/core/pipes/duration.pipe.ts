import { Pipe, PipeTransform } from '@angular/core';

/** Milliseconds → human duration: 8 → "8ms", 1400 → "1.4s", 90000 → "1m 30s". */
@Pipe({
  standalone: true, name: 'duration' })
export class DurationPipe implements PipeTransform {
  transform(ms: number | null | undefined): string {
    const value = ms ?? 0;
    if (value < 1000) return `${Math.round(value)}ms`;
    const seconds = value / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return `${minutes}m ${rest}s`;
  }
}
