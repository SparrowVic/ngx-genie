import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/** Inner SVG for each icon (24×24, stroke-based, currentColor). */
const ICONS: Record<string, string> = {
  sitemap: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-2h12v2M12 12v2"/>',
  hierarchy: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M12 7.5v3.5M12 11l-5 4.5M12 11l5 4.5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  sparkles: '<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z"/><path d="M19 15l.7 1.8L21.5 17.5l-1.8.7L19 20l-.7-1.8L16.5 17.5l1.8-.7z"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9.5 12l1.8 1.8L15 10"/>',
  radar: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/><path d="M12 12l6-4"/>',
  bolt: '<path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12z"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 14l4-4"/><circle cx="12" cy="14" r="1"/>',
  recycle: '<path d="M7 7l2-3 3 1M17 8l1 3.5-3.5.5M9 18l-3-.5-.5-3.5"/><path d="M9 4.5L5 11l2.5 1.5M15 4.5l4 6.5-2.5 1.5M15 19.5H8.5L8 16"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
  book: '<path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 1 2-2h11"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a1.5 1.5 0 0 0 1.3 2.2h11.4A1.5 1.5 0 0 0 19 18l-5-9V3"/><path d="M7.5 15h9"/>',
  github: '<path d="M9 19c-4 1.4-4-2.2-5.5-2.7M18.5 21v-3.3a3 3 0 0 0-.8-2.3c2.7-.3 5.5-1.3 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C4.6 1.7 3.6 2 3.6 2a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 2.2 8.4c0 4.6 2.8 5.7 5.5 6a3 3 0 0 0-.8 2.3V21"/>',
  npm: '<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M7 18V9h3v6M13 18V9h4v6M15 9v9"/>',
  yarn: '<circle cx="12" cy="12" r="9"/><path d="M9 6c-1 2-1 4 0 6-2 1-3 3-3 5M15 7c1 1 1 3 0 5 2 1 3 2 3 4"/>',
  pnpm: '<rect x="4" y="4" width="4.5" height="4.5"/><rect x="9.75" y="4" width="4.5" height="4.5"/><rect x="15.5" y="4" width="4.5" height="4.5"/><rect x="9.75" y="9.75" width="4.5" height="4.5"/><rect x="15.5" y="9.75" width="4.5" height="4.5"/><rect x="15.5" y="15.5" width="4.5" height="4.5"/>',
  bun: '<ellipse cx="12" cy="12" rx="9" ry="7.5"/><circle cx="9" cy="11" r="1"/><circle cx="15" cy="11" r="1"/><path d="M10 14c1 1 3 1 4 0"/>',
  download: '<path d="M12 3v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  'arrow-right': '<path d="M4 12h16M14 6l6 6-6 6"/>',
  'arrow-up-right': '<path d="M7 17L17 7M8 7h9v9"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 6.5"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  command: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  star: '<path d="M12 3l2.6 6.3 6.4.5-4.9 4.2 1.5 6.3L12 17l-5.6 3.3 1.5-6.3L3 9.8l6.4-.5z"/>',
  heart: '<path d="M12 20s-7-4.3-9.3-8.3C1 8.5 2.5 5 6 5c2 0 3 1.2 4 2.5C11 6.2 12 5 14 5c3.5 0 5 3.5 3.3 6.7C19 15.7 12 20 12 20z"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  atom: '<circle cx="12" cy="12" r="1.5"/><ellipse cx="12" cy="12" rx="9" ry="4"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(120 12 12)"/>',
  lamp: '<path d="M4 15c0-4 3.5-6 8-6s8 2 8 4c0 1.5-2 2-4 2H8"/><path d="M17 15c2 0 3 1 3 2.5S18.5 20 17 20"/><circle cx="6" cy="9" r="1.5"/><path d="M6 7.5V5"/>',
  external: '<path d="M14 5h5v5M19 5l-8 8"/><path d="M17 13v6H5V7h6"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  zap: '<path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>',
};

/** Lightweight inline-SVG icon. Usage: <ui-icon name="constellation" [size]="20" />. */
@Component({
  selector: 'ui-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `<span class="ui-icon" [innerHTML]="markup()"></span>`,
  styles: [`ui-icon .ui-icon{display:inline-flex;line-height:0}ui-icon svg{display:block}`],
})
export class IconComponent {
  private readonly sanitizer = inject(DomSanitizer);
  readonly name = input.required<string>();
  readonly size = input(18);
  readonly strokeWidth = input(1.8);

  readonly markup = computed<SafeHtml>(() => {
    const body = ICONS[this.name()] ?? ICONS['circle'];
    const svg = `<svg width="${this.size()}" height="${this.size()}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${this.strokeWidth()}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  });
}
