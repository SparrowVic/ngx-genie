import {Component} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';

import {GenieResizableDirective} from './resizable.directive';

/**
 * Behavioural spec for GenieResizableDirective.
 *
 * The directive is *mouse* driven (despite the "resize handle" framing it uses raw
 * `mousedown`/`mousemove`/`mouseup`, not PointerEvents). Wiring, read from the source:
 *
 *   - constructor: a single `mousedown` listener is attached to the HOST element via
 *     Renderer2 and pushed into the private `listeners[]` cleanup array.
 *   - onMouseDown: preventDefault + stopPropagation, sets `isResizing = true`, snapshots
 *     `prevMouse` from clientX (horizontal) or clientY (vertical, the default), and attaches
 *     `document` `mousemove` + `mouseup` listeners. NOTE: these two global listeners are held
 *     only in local consts — they are NOT pushed into `listeners[]`.
 *   - onMouseMove: emits `resizing` with the signed delta (current - prev); updates `prevMouse`;
 *     early-returns (no emit) when not resizing or when the delta is exactly 0.
 *   - onMouseUp: emits `resizeEnd` once (guarded by `isResizing`), clears the flag, and
 *     unsubscribes the per-drag move + up listeners.
 *   - ngOnDestroy: unsubscribes everything in `listeners[]` (i.e. ONLY the host mousedown).
 *
 * Characterization notes captured below:
 *   - `minSize` / `maxSize` / `startSize` inputs exist but are NEVER read — deltas are emitted
 *     completely unclamped.
 *   - Because the per-drag `document` listeners are not tracked in `listeners[]`, destroying the
 *     directive mid-drag does NOT remove them (a leak). Tested explicitly.
 */

// Standalone by default under Angular 21 — the directive is imported directly.
@Component({
  template: `
    <div
      genieResizable
      [direction]="dir"
      [minSize]="minSize"
      [maxSize]="maxSize"
      [startSize]="startSize"
    ></div>
  `,
  imports: [GenieResizableDirective],
})
class HostComponent {
  dir: 'horizontal' | 'vertical' = 'vertical';
  minSize = 0;
  maxSize = 9999;
  startSize = 0;
}

function mouse(type: string, init: MouseEventInit = {}): MouseEvent {
  return new MouseEvent(type, {bubbles: true, cancelable: true, ...init});
}

describe('GenieResizableDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let directive: GenieResizableDirective;
  let hostEl: HTMLElement;

  let resizingEvents: number[];
  let resizeEndCount: number;

  /** Set up the fixture, subscribe to outputs, attach root to the DOM for bubbling tests. */
  function setup(direction: 'horizontal' | 'vertical' = 'vertical'): void {
    host.dir = direction;
    fixture.detectChanges();

    const de = fixture.debugElement.query(By.directive(GenieResizableDirective));
    directive = de.injector.get(GenieResizableDirective);
    hostEl = de.nativeElement as HTMLElement;

    resizingEvents = [];
    resizeEndCount = 0;
    directive.resizing.subscribe((v: number) => resizingEvents.push(v));
    directive.resizeEnd.subscribe(() => (resizeEndCount += 1));

    // Attach to the document so `stopPropagation`/bubbling assertions are meaningful.
    document.body.appendChild(fixture.nativeElement);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  afterEach(() => {
    // Flush any per-drag `document` listeners a test may have left dangling (incl. the
    // deliberate mid-drag leak) so tests stay isolated.
    document.dispatchEvent(mouse('mouseup'));
    try {
      fixture.destroy();
    } catch {
      /* already destroyed by the test under exercise */
    }
    if (fixture.nativeElement?.parentNode) {
      fixture.nativeElement.parentNode.removeChild(fixture.nativeElement);
    }
  });

  describe('construction & host listener wiring', () => {
    it('instantiates the directive on the host element', () => {
      setup();
      expect(directive)
        .withContext('directive should be applied to the [genieResizable] element')
        .toBeInstanceOf(GenieResizableDirective);
    });

    it('registers exactly one cleanup listener (the host mousedown) after construction', () => {
      setup();
      const listeners = (directive as any).listeners as Array<() => void>;
      expect(listeners.length)
        .withContext('only the host mousedown unsub is tracked at construction time')
        .toBe(1);
    });

    it('exposes the documented defaults for its signal inputs', () => {
      setup();
      expect(directive.direction()).withContext('default direction').toBe('vertical');
      expect(directive.minSize()).withContext('default minSize').toBe(0);
      expect(directive.maxSize()).withContext('default maxSize').toBe(9999);
      expect(directive.startSize()).withContext('default startSize').toBe(0);
    });

    it('does not start resizing before any interaction', () => {
      setup();
      expect((directive as any).isResizing).toBe(false);
      expect(resizingEvents.length).toBe(0);
    });
  });

  describe('starting a drag (mousedown on the host)', () => {
    it('sets isResizing and snapshots clientY as prevMouse for vertical direction', () => {
      setup('vertical');
      // clientX intentionally differs from clientY to prove the vertical axis is read.
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 500, clientY: 100}));

      expect((directive as any).isResizing).withContext('drag should be active').toBe(true);
      expect((directive as any).prevMouse)
        .withContext('vertical direction snapshots clientY')
        .toBe(100);
    });

    it('snapshots clientX as prevMouse for horizontal direction', () => {
      setup('horizontal');
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 5}));

      expect((directive as any).prevMouse)
        .withContext('horizontal direction snapshots clientX')
        .toBe(200);
    });

    it('calls preventDefault on the mousedown event', () => {
      setup();
      const evt = mouse('mousedown', {clientY: 10});
      const notCancelled = hostEl.dispatchEvent(evt);

      expect(evt.defaultPrevented).withContext('preventDefault() must be called').toBe(true);
      expect(notCancelled).withContext('dispatchEvent returns false when default prevented').toBe(false);
    });

    it('calls stopPropagation so the mousedown does not bubble to ancestors', () => {
      setup();
      let bubbledToDocument = false;
      const docHandler = () => (bubbledToDocument = true);
      document.addEventListener('mousedown', docHandler);

      hostEl.dispatchEvent(mouse('mousedown', {clientY: 10}));

      expect(bubbledToDocument)
        .withContext('stopPropagation() must prevent the event reaching document')
        .toBe(false);
      document.removeEventListener('mousedown', docHandler);
    });

    it('does not emit resizing or resizeEnd merely by starting a drag', () => {
      setup();
      hostEl.dispatchEvent(mouse('mousedown', {clientY: 10}));

      expect(resizingEvents.length).withContext('no move yet').toBe(0);
      expect(resizeEndCount).withContext('drag not ended').toBe(0);
    });
  });

  describe('resizing (mousemove emits signed deltas)', () => {
    it('emits a positive delta when the pointer moves down (vertical)', () => {
      setup('vertical');
      hostEl.dispatchEvent(mouse('mousedown', {clientY: 100}));
      document.dispatchEvent(mouse('mousemove', {clientY: 150}));

      expect(resizingEvents).withContext('150 - 100 = +50').toEqual([50]);
    });

    it('emits a negative delta when the pointer moves up (vertical)', () => {
      setup('vertical');
      hostEl.dispatchEvent(mouse('mousedown', {clientY: 100}));
      document.dispatchEvent(mouse('mousemove', {clientY: 60}));

      expect(resizingEvents).withContext('60 - 100 = -40').toEqual([-40]);
    });

    it('tracks prevMouse across successive moves, emitting incremental deltas', () => {
      setup('vertical');
      hostEl.dispatchEvent(mouse('mousedown', {clientY: 100}));
      document.dispatchEvent(mouse('mousemove', {clientY: 150})); // +50
      document.dispatchEvent(mouse('mousemove', {clientY: 130})); // -20
      document.dispatchEvent(mouse('mousemove', {clientY: 200})); // +70

      expect(resizingEvents)
        .withContext('each delta is relative to the previous move, not the origin')
        .toEqual([50, -20, 70]);
      expect((directive as any).prevMouse).withContext('prevMouse tracks the last position').toBe(200);
    });

    it('uses clientX for horizontal direction and ignores clientY', () => {
      setup('horizontal');
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 0}));
      // clientY swings wildly but must be ignored; only clientX drives the delta.
      document.dispatchEvent(mouse('mousemove', {clientX: 260, clientY: 9999}));

      expect(resizingEvents).withContext('260 - 200 = +60 on the X axis').toEqual([60]);
    });

    it('does not emit when the delta is exactly 0 (no movement)', () => {
      setup('vertical');
      hostEl.dispatchEvent(mouse('mousedown', {clientY: 100}));
      document.dispatchEvent(mouse('mousemove', {clientY: 100})); // delta 0 -> skipped

      expect(resizingEvents).withContext('zero-delta moves are suppressed').toEqual([]);
    });

    it('suppresses a zero-delta move but still emits the surrounding non-zero deltas', () => {
      setup('vertical');
      hostEl.dispatchEvent(mouse('mousedown', {clientY: 100}));
      document.dispatchEvent(mouse('mousemove', {clientY: 120})); // +20
      document.dispatchEvent(mouse('mousemove', {clientY: 120})); // 0 -> skipped
      document.dispatchEvent(mouse('mousemove', {clientY: 90})); // -30

      expect(resizingEvents).toEqual([20, -30]);
    });

    it('does not emit unclamped-beyond-maxSize deltas any differently (min/max/startSize are unused)', () => {
      // Characterization: maxSize is deliberately tiny but the emitted delta is NOT clamped —
      // the directive never reads minSize/maxSize/startSize.
      host.maxSize = 10;
      host.minSize = -10;
      setup('vertical');
      host.maxSize = 10; // re-assert after setup's detectChanges
      fixture.detectChanges();

      hostEl.dispatchEvent(mouse('mousedown', {clientY: 0}));
      document.dispatchEvent(mouse('mousemove', {clientY: 500}));

      expect(resizingEvents)
        .withContext('delta is emitted raw (500), proving maxSize is never consulted')
        .toEqual([500]);
    });

    it('ignores moves that arrive before a drag has started (guard: !isResizing)', () => {
      // No mousedown yet -> no document listener exists, and the guard would also short-circuit.
      setup('vertical');
      (directive as any).onMouseMove(mouse('mousemove', {clientY: 999}));

      expect(resizingEvents).withContext('onMouseMove no-ops while isResizing is false').toEqual([]);
    });
  });

  describe('ending a drag (mouseup)', () => {
    it('emits resizeEnd exactly once and clears isResizing', () => {
      setup('vertical');
      hostEl.dispatchEvent(mouse('mousedown', {clientY: 100}));
      document.dispatchEvent(mouse('mousemove', {clientY: 150}));
      document.dispatchEvent(mouse('mouseup'));

      expect(resizeEndCount).withContext('resizeEnd fires once per drag').toBe(1);
      expect((directive as any).isResizing).withContext('flag reset on release').toBe(false);
    });

    it('emits resizeEnd even if no move happened between down and up', () => {
      setup('vertical');
      hostEl.dispatchEvent(mouse('mousedown', {clientY: 100}));
      document.dispatchEvent(mouse('mouseup'));

      expect(resizingEvents).withContext('no move => no resizing').toEqual([]);
      expect(resizeEndCount).withContext('resizeEnd still fires on release').toBe(1);
    });

    it('does not emit resizing for moves dispatched after release', () => {
      setup('vertical');
      hostEl.dispatchEvent(mouse('mousedown', {clientY: 100}));
      document.dispatchEvent(mouse('mousemove', {clientY: 150})); // +50
      document.dispatchEvent(mouse('mouseup'));
      document.dispatchEvent(mouse('mousemove', {clientY: 400})); // ignored — listener removed

      expect(resizingEvents).withContext('only the pre-release move is captured').toEqual([50]);
    });

    it('removes the document mousemove listener on release (onMouseMove no longer invoked)', () => {
      setup('vertical');
      hostEl.dispatchEvent(mouse('mousedown', {clientY: 100}));
      document.dispatchEvent(mouse('mouseup'));

      const moveSpy = spyOn(directive as any, 'onMouseMove').and.callThrough();
      document.dispatchEvent(mouse('mousemove', {clientY: 200}));

      expect(moveSpy)
        .withContext('the per-drag mousemove listener must be torn down on mouseup')
        .not.toHaveBeenCalled();
    });

    it('supports repeated independent drag cycles without accumulating listeners', () => {
      setup('vertical');

      // Cycle 1
      hostEl.dispatchEvent(mouse('mousedown', {clientY: 0}));
      document.dispatchEvent(mouse('mousemove', {clientY: 10})); // +10
      document.dispatchEvent(mouse('mouseup'));

      // Cycle 2 — a fresh origin; deltas must not carry over from cycle 1.
      hostEl.dispatchEvent(mouse('mousedown', {clientY: 1000}));
      document.dispatchEvent(mouse('mousemove', {clientY: 1005})); // +5
      document.dispatchEvent(mouse('mouseup'));

      expect(resizingEvents).withContext('each cycle emits independently').toEqual([10, 5]);
      expect(resizeEndCount).withContext('one resizeEnd per cycle').toBe(2);
      // Only the single host mousedown unsub is ever tracked — per-drag listeners are transient.
      expect((directive as any).listeners.length)
        .withContext('cleanup array never grows with drag cycles')
        .toBe(1);
    });
  });

  describe('onMouseUp guard (characterization of the private handler)', () => {
    it('does NOT emit resizeEnd when called while not resizing, but still tears down listeners', () => {
      setup('vertical');
      const moveUnsub = jasmine.createSpy('moveUnsub');
      const upUnsub = jasmine.createSpy('upUnsub');

      // isResizing is false here (no active drag).
      (directive as any).onMouseUp(moveUnsub, upUnsub);

      expect(resizeEndCount).withContext('resizeEnd is guarded by isResizing').toBe(0);
      expect(moveUnsub).withContext('move listener always unsubscribed').toHaveBeenCalledTimes(1);
      expect(upUnsub).withContext('up listener always unsubscribed').toHaveBeenCalledTimes(1);
    });

    it('emits resizeEnd and tears down listeners when called while resizing', () => {
      setup('vertical');
      const moveUnsub = jasmine.createSpy('moveUnsub');
      const upUnsub = jasmine.createSpy('upUnsub');
      (directive as any).isResizing = true;

      (directive as any).onMouseUp(moveUnsub, upUnsub);

      expect(resizeEndCount).withContext('resizeEnd fires when a drag was active').toBe(1);
      expect((directive as any).isResizing).toBe(false);
      expect(moveUnsub).toHaveBeenCalledTimes(1);
      expect(upUnsub).toHaveBeenCalledTimes(1);
    });
  });

  describe('ngOnDestroy cleanup', () => {
    it('removes the host mousedown listener so post-destroy mousedowns are inert', () => {
      setup('vertical');
      fixture.destroy();

      // The element is detached; dispatching mousedown must NOT start a new drag.
      hostEl.dispatchEvent(mouse('mousedown', {clientY: 100}));

      expect((directive as any).isResizing)
        .withContext('destroyed directive no longer reacts to host mousedown')
        .toBe(false);
    });

    it('leaves an in-progress drag\'s global mousemove listener attached after destroy (characterized leak)', () => {
      // The per-drag `document` listeners are stored only in local consts inside onMouseDown and
      // are never pushed into `listeners[]`, so ngOnDestroy cannot remove them. Destroying the
      // directive mid-drag therefore leaves the global mousemove listener live.
      setup('vertical');
      hostEl.dispatchEvent(mouse('mousedown', {clientY: 0}));

      const moveSpy = spyOn(directive as any, 'onMouseMove').and.callThrough();
      fixture.destroy();

      // A move dispatched after destroy still reaches the (leaked) handler.
      document.dispatchEvent(mouse('mousemove', {clientY: 50}));

      expect(moveSpy)
        .withContext('KNOWN LEAK: mid-drag document listeners survive ngOnDestroy')
        .toHaveBeenCalledTimes(1);
      // afterEach dispatches a mouseup which triggers the still-live up listener and finally
      // removes both leaked global listeners, keeping subsequent tests isolated.
    });
  });
});
