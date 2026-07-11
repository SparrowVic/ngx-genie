import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Wraps matches of `query` in <mark class="hl">. The source text is
 * HTML-escaped piecewise (matching happens on the raw string, so entities are
 * never split), which lets literal markup like "<ngx-genie/>" in copy render
 * as text instead of being parsed or sanitised away.
 */
@Pipe({ name: 'highlight' })
export class HighlightPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(text: string | null | undefined, query: string | null | undefined): SafeHtml {
    const raw = text ?? '';
    const q = (query ?? '').trim();
    if (!q) return this.sanitizer.bypassSecurityTrustHtml(esc(raw));
    const rx = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
    const html = raw
      .split(rx)
      .map((part, i) => (i % 2 === 1 ? `<mark class="hl">${esc(part)}</mark>` : esc(part)))
      .join('');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
