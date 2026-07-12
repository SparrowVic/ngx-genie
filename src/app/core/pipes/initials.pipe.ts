import { Pipe, PipeTransform } from '@angular/core';

/** "Ada Lovelace" → "AL". */
@Pipe({
  standalone: true, name: 'initials' })
export class InitialsPipe implements PipeTransform {
  transform(name: string | null | undefined, max = 2): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    return parts
      .slice(0, max)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('');
  }
}
