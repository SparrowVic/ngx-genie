import { Pipe, PipeTransform } from '@angular/core';

/** {{ 1 | pluralize:'node' }} → "1 node"; {{ 3 | pluralize:'node' }} → "3 nodes". */
@Pipe({
  standalone: true, name: 'pluralize' })
export class PluralizePipe implements PipeTransform {
  transform(count: number | null | undefined, singular: string, plural?: string): string {
    const n = count ?? 0;
    const word = n === 1 ? singular : plural ?? `${singular}s`;
    return `${n} ${word}`;
  }
}
