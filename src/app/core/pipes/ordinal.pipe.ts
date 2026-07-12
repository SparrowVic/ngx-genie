import { Pipe, PipeTransform } from '@angular/core';

/** 1 → "1st", 2 → "2nd", 13 → "13th". */
@Pipe({
  standalone: true, name: 'ordinal' })
export class OrdinalPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    const n = value ?? 0;
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const mod = n % 100;
    return n + (suffixes[(mod - 20) % 10] || suffixes[mod] || suffixes[0]);
  }
}
