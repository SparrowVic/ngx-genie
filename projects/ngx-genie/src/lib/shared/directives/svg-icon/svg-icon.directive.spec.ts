import {Component, signal, ChangeDetectionStrategy} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';

import {SvgIconDirective} from './svg-icon.directive';

/**
 * Behavioural spec for SvgIconDirective.
 *
 * Wiring, read from the source (svg-icon.directive.ts):
 *
 *   - selector: `[genieSvgIcon]`.
 *   - a single REQUIRED signal input `svgContent` aliased to `genieSvgIcon`
 *     (`input.required({alias: 'genieSvgIcon'})`), typed `string`.
 *   - `ngOnChanges()` -> `updateIcon()`. Signal inputs still fire ngOnChanges, so every
 *     bound-value change re-runs `updateIcon`.
 *   - `updateIcon()`:
 *       * if `!this.svgContent()` (falsy: '', null, undefined) -> set host `innerHTML = ''`
 *         and RETURN early (the host class is NOT touched);
 *       * otherwise set host `innerHTML = this.svgContent()` (RAW — no Angular sanitizer)
 *         and `classList.add('ngx-genie-icon-host')`.
 *
 * Characterization notes captured below:
 *   - The directive is a generic raw-innerHTML writer; "svg" is only a naming convention —
 *     it happily injects plain text or arbitrary HTML. It bypasses Angular's DomSanitizer,
 *     so inline event-handler attributes survive verbatim (they are NOT dispatched here).
 *   - The `ngx-genie-icon-host` class is only ever ADDED, never removed. Switching from a
 *     non-empty icon back to empty clears the markup but leaves the class behind (tested).
 *   - A whitespace-only string is truthy, so it counts as "present" and gets rendered
 *     (with the class added), even though it has no visible icon.
 *   - Because the selector IS the input alias, applying the directive always supplies a
 *     binding; binding `null`/`undefined` (via cast) is the realistic "missing" path and is
 *     handled gracefully (markup cleared, no throw).
 */

// A square-ish icon: root <svg> with viewBox + attributes and a nested <path>.
const ICON_SQUARE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">' +
  '<path d="M4 4h16v16H4z"></path>' +
  '</svg>';

// A distinct icon (different viewBox, a class attribute, a nested <circle>).
const ICON_CIRCLE =
  '<svg viewBox="0 0 32 32" class="genie-circle" data-icon="circle">' +
  '<circle cx="16" cy="16" r="8"></circle>' +
  '</svg>';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Standalone by default under Angular 21 — the directive is imported directly.
@Component({
  selector: 'genie-svg-host',
  template: `<div class="host-target" [genieSvgIcon]="content()"></div>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [SvgIconDirective],
})
class HostComponent {
  // A signal drives the binding so that updating it marks the view dirty — essential under
  // this zoneless test setup, where mutating a plain field would NOT schedule change detection
  // (the second detectChanges would run only its check-no-changes pass and throw NG0100).
  // Typed `string` to match the input contract; individual tests cast for the null/undefined
  // "missing value" path.
  content = signal<string>('');
}

describe('SvgIconDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  /** The element the directive is applied to (also the element it mutates). */
  function target(): HTMLElement {
    return fixture.nativeElement.querySelector('.host-target') as HTMLElement;
  }

  /** Resolve the directive instance for white-box assertions. */
  function directive(): SvgIconDirective {
    const de = fixture.debugElement.query(By.directive(SvgIconDirective));
    return de.injector.get(SvgIconDirective);
  }

  /** Set the bound value and flush change detection (which fires ngOnChanges -> updateIcon). */
  function render(value: string): void {
    host.content.set(value);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  describe('construction & wiring', () => {
    it('applies the directive to the [genieSvgIcon] element', () => {
      fixture.detectChanges();
      expect(directive())
        .withContext('directive should be attached to the host-target element')
        .toBeInstanceOf(SvgIconDirective);
    });

    it('exposes the bound value through the aliased required signal input', () => {
      render(ICON_SQUARE);
      expect(directive().svgContent())
        .withContext('genieSvgIcon alias must feed the svgContent signal')
        .toBe(ICON_SQUARE);
    });
  });

  describe('rendering a known icon', () => {
    it('injects the raw markup into the host innerHTML', () => {
      render(ICON_SQUARE);
      const el = target();
      // Read back via the parsed DOM rather than exact string (the parser may normalise
      // attribute quoting/order), but confirm the structural essentials survived.
      expect(el.querySelector('svg')).withContext('an <svg> root must be rendered').not.toBeNull();
      expect(el.querySelector('svg > path'))
        .withContext('the nested <path> must be rendered')
        .not.toBeNull();
    });

    it('parses the string into a real SVG DOM node (SVG namespace, not inert text)', () => {
      render(ICON_SQUARE);
      const svg = target().querySelector('svg')!;
      expect(svg.namespaceURI)
        .withContext('innerHTML assignment must parse <svg> into the SVG namespace')
        .toBe(SVG_NS);
      // A stray text node with the literal markup would leave textContent === the raw string.
      expect(target().textContent)
        .withContext('markup must be parsed, not inserted as literal text')
        .not.toContain('<svg');
    });

    it('preserves svg attributes and nested-element attributes verbatim', () => {
      render(ICON_SQUARE);
      const svg = target().querySelector('svg')!;
      expect(svg.getAttribute('viewBox')).withContext('viewBox preserved').toBe('0 0 24 24');
      expect(svg.getAttribute('fill')).withContext('fill preserved').toBe('none');
      expect(svg.getAttribute('stroke')).withContext('stroke preserved').toBe('currentColor');
      expect(target().querySelector('path')!.getAttribute('d'))
        .withContext('nested path `d` preserved')
        .toBe('M4 4h16v16H4z');
    });

    it('adds the ngx-genie-icon-host class when content is present', () => {
      render(ICON_SQUARE);
      expect(target().classList.contains('ngx-genie-icon-host'))
        .withContext('marker class is added for non-empty content')
        .toBe(true);
    });

    it('renders multiple root nodes from a single string', () => {
      render(ICON_SQUARE + ICON_CIRCLE);
      expect(target().querySelectorAll('svg').length)
        .withContext('both <svg> roots should be present')
        .toBe(2);
    });

    it('renders arbitrary (non-svg) HTML too — it is a generic innerHTML writer', () => {
      render('<span class="plain">hi</span>');
      const span = target().querySelector('span.plain');
      expect(span).withContext('non-svg markup is still injected').not.toBeNull();
      expect(span!.textContent).toBe('hi');
      expect(target().classList.contains('ngx-genie-icon-host'))
        .withContext('class added for any truthy content, svg or not')
        .toBe(true);
    });

    it('injects plain text with no tags as a text node', () => {
      render('just text');
      expect(target().querySelector('svg')).withContext('no element to find').toBeNull();
      expect(target().textContent).withContext('text set verbatim').toBe('just text');
      expect(target().classList.contains('ngx-genie-icon-host')).toBe(true);
    });

    it('does NOT sanitize — inline event-handler attributes survive (DomSanitizer bypassed)', () => {
      // Angular's [innerHTML] binding would strip an inline handler; writing nativeElement.innerHTML
      // directly does not. onclick is inert unless clicked, so this only proves preservation.
      render('<svg viewBox="0 0 10 10"><rect width="10" height="10" onclick="window.__x=1"></rect></svg>');
      const rect = target().querySelector('rect')!;
      expect(rect.getAttribute('onclick'))
        .withContext('raw string is injected without sanitization')
        .toBe('window.__x=1');
    });
  });

  describe('updating the icon when the input changes', () => {
    it('fully replaces the previous icon when switching (no leftover nodes)', () => {
      render(ICON_SQUARE);
      expect(target().querySelector('path')).withContext('square rendered first').not.toBeNull();

      render(ICON_CIRCLE);
      expect(target().querySelectorAll('svg').length)
        .withContext('innerHTML assignment replaces, never appends')
        .toBe(1);
      expect(target().querySelector('circle')).withContext('circle is now present').not.toBeNull();
      expect(target().querySelector('path')).withContext('old square path is gone').toBeNull();
      expect(target().querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 32 32');
    });

    it('reflects successive updates including plain-text -> svg transitions', () => {
      render('first');
      expect(target().textContent).toBe('first');

      render(ICON_CIRCLE);
      expect(target().querySelector('circle')).not.toBeNull();
      expect(target().textContent).withContext('previous text wiped').not.toContain('first');
    });

    it('keeps the marker class present exactly once across repeated truthy updates', () => {
      render(ICON_SQUARE);
      render(ICON_CIRCLE);
      render(ICON_SQUARE);

      const marker = 'ngx-genie-icon-host';
      const occurrences = target()
        .className.split(/\s+/)
        .filter((c) => c === marker).length;
      expect(occurrences)
        .withContext('classList.add is idempotent — no duplicate marker tokens')
        .toBe(1);
    });
  });

  describe('empty / missing content handled gracefully', () => {
    it('renders nothing and adds no class for an empty-string binding', () => {
      render('');
      expect(target().innerHTML).withContext('empty string clears markup').toBe('');
      expect(target().classList.contains('ngx-genie-icon-host'))
        .withContext('marker class NOT added on the empty/early-return path')
        .toBe(false);
    });

    it('clears markup and does not throw when bound to null', () => {
      expect(() => render(null as unknown as string))
        .withContext('null must be handled without throwing')
        .not.toThrow();
      expect(target().innerHTML).toBe('');
      expect(target().classList.contains('ngx-genie-icon-host')).toBe(false);
    });

    it('clears markup and does not throw when bound to undefined', () => {
      expect(() => render(undefined as unknown as string))
        .withContext('undefined must be handled without throwing')
        .not.toThrow();
      expect(target().innerHTML).toBe('');
      expect(target().classList.contains('ngx-genie-icon-host')).toBe(false);
    });

    it('clears a previously-rendered icon when the value becomes empty', () => {
      render(ICON_SQUARE);
      expect(target().querySelector('svg')).not.toBeNull();

      render('');
      expect(target().innerHTML).withContext('markup wiped when value goes falsy').toBe('');
      expect(target().querySelector('svg')).toBeNull();
    });

    it('treats a whitespace-only string as present and renders it (characterization)', () => {
      render('   ');
      // A whitespace string is truthy, so the "present" branch runs.
      expect(target().innerHTML).withContext('whitespace is injected verbatim').toBe('   ');
      expect(target().classList.contains('ngx-genie-icon-host'))
        .withContext('whitespace counts as content -> class added')
        .toBe(true);
    });
  });

  describe('marker-class lifecycle characterization', () => {
    it('LEAK: the marker class is never removed after switching from icon back to empty', () => {
      render(ICON_SQUARE);
      expect(target().classList.contains('ngx-genie-icon-host'))
        .withContext('class added while content present')
        .toBe(true);

      render('');
      expect(target().innerHTML).withContext('markup is cleared').toBe('');
      expect(target().classList.contains('ngx-genie-icon-host'))
        .withContext('KNOWN CHARACTERIZATION: class is add-only, so it survives the clear')
        .toBe(true);
    });
  });

  describe('direct invocation of the private updateIcon (white-box)', () => {
    it('re-running updateIcon with unchanged content is idempotent', () => {
      render(ICON_SQUARE);
      const before = target().innerHTML;

      (directive() as any).updateIcon();

      expect(target().innerHTML).withContext('idempotent re-render').toBe(before);
      expect(target().querySelectorAll('svg').length)
        .withContext('no duplication from a manual re-run')
        .toBe(1);
    });
  });
});
