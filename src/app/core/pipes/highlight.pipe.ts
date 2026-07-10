import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/** Wraps matches of `query` in <mark class="hl">. Returns sanitised SafeHtml. */
@Pipe({ name: 'highlight' })
export class HighlightPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(text: string | null | undefined, query: string | null | undefined): SafeHtml {
    const value = text ?? '';
    const q = (query ?? '').trim();
    if (!q) return value;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const html = value.replace(new RegExp(`(${escaped})`, 'ig'), '<mark class="hl">$1</mark>');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
