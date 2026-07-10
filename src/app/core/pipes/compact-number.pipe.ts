import { Pipe, PipeTransform } from '@angular/core';

/** 18420 → "18.4k", 2500000 → "2.5M". */
@Pipe({ name: 'compactNumber' })
export class CompactNumberPipe implements PipeTransform {
  transform(value: number | null | undefined, digits = 1): string {
    const n = value ?? 0;
    const abs = Math.abs(n);
    const units: readonly [number, string][] = [
      [1e9, 'B'],
      [1e6, 'M'],
      [1e3, 'k'],
    ];
    for (const [factor, suffix] of units) {
      if (abs >= factor) {
        return (n / factor).toFixed(digits).replace(/\.0+$/, '') + suffix;
      }
    }
    return `${Math.round(n)}`;
  }
}
