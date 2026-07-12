import {Component, PLATFORM_ID, signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';

import {
  GenieWindowConstraintsDirective,
  WindowControlMode,
  WindowPosition,
  WindowSize,
} from './window-constraints.directive';

/**
 * Behavioural spec for GenieWindowConstraintsDirective.
 *
 * Wiring, read directly from the source:
 *
 *   - constructor: on the BROWSER platform a single `mousedown` listener is attached to the
 *     host element (addEventListener). On the server (`!isBrowser`) the constructor returns
 *     early and NO listener is wired.
 *   - onMouseDown: early-returns when `isMaximized()`. In 'drag' mode it bails when the event
 *     target `.closest('button, input, a')` matches. In 'resize' mode it calls
 *     stopPropagation() + preventDefault(). Then dispatches to startDrag / startResize.
 *   - startDrag: snapshots the ORIGIN clientX/clientY and the CURRENT windowPosition {x,y}.
 *     While moving it clamps:
 *       constrainedX = max(minVisibleMargin - windowWidth, min(newX, viewportWidth  - minVisibleMargin))
 *       constrainedY = max(0,                              min(newY, viewportHeight - minVisibleMargin))
 *     windowSize / minVisibleMargin / viewport are re-read on every move; the base {x,y} is NOT.
 *   - startResize: snapshots the ORIGIN clientX/clientY and the CURRENT size {w,h}. While moving:
 *       newWidth  = max(minWidth,  startW + dx)   then min(newWidth,  viewportWidth  - windowPosition.x)
 *       newHeight = max(minHeight, startH + dy)   then min(newHeight, viewportHeight - windowPosition.y)
 *     minWidth/minHeight/windowPosition/viewport are re-read on every move; the base {w,h} is NOT.
 *   - both operations attach `document` mousemove + mouseup listeners; the mouseup handler
 *     removes BOTH global listeners and emits `operationEnd`. This mouseup teardown is the ONLY
 *     cleanup path — the directive has no ngOnDestroy, so destroying it mid-drag would leak (not
 *     tested destructively here; the mouseup teardown / no-leak-after-release path IS tested).
 *
 * Geometry is made deterministic by stubbing `window.innerWidth`/`window.innerHeight`
 * (default 1000 x 800) rather than depending on the real Karma browser window.
 */

// Standalone by default under Angular 21 — the directive is imported directly.
@Component({
  standalone: true,
  template: `
    <div
      genieWindowConstraints
      [mode]="mode()"
      [windowPosition]="position()"
      [windowSize]="size()"
      [isMaximized]="maximized()"
      [minVisibleMargin]="minVisibleMargin()"
      [minWidth]="minWidth()"
      [minHeight]="minHeight()"
    >
      <button type="button" class="inner-btn">close</button>
      <input class="inner-input" />
      <a href="#" class="inner-link">link</a>
      <span class="plain">plain</span>
    </div>
  `,
  imports: [GenieWindowConstraintsDirective],
})
class HostComponent {
  // Signals so mid-operation mutations mark the host view dirty under zoneless CD; a plain field
  // would leave the update pass stale and trip ExpressionChangedAfterItHasBeenCheckedError.
  readonly mode = signal<WindowControlMode>('drag');
  readonly position = signal<WindowPosition>({x: 100, y: 100});
  readonly size = signal<WindowSize>({width: 800, height: 600});
  readonly maximized = signal(false);
  readonly minVisibleMargin = signal(50);
  readonly minWidth = signal(600);
  readonly minHeight = signal(400);
}

function mouse(type: string, init: MouseEventInit = {}): MouseEvent {
  return new MouseEvent(type, {bubbles: true, cancelable: true, ...init});
}

/**
 * Override the global viewport dimensions the directive reads via `window.innerWidth` /
 * `window.innerHeight`. Returns a restore function that re-installs the original descriptors.
 */
function stubViewport(width: number, height: number): () => void {
  const win = window as any;
  const originalW = Object.getOwnPropertyDescriptor(win, 'innerWidth');
  const originalH = Object.getOwnPropertyDescriptor(win, 'innerHeight');
  Object.defineProperty(win, 'innerWidth', {configurable: true, get: () => width});
  Object.defineProperty(win, 'innerHeight', {configurable: true, get: () => height});
  return () => {
    if (originalW) {
      Object.defineProperty(win, 'innerWidth', originalW);
    } else {
      delete win.innerWidth;
    }
    if (originalH) {
      Object.defineProperty(win, 'innerHeight', originalH);
    } else {
      delete win.innerHeight;
    }
  };
}

describe('GenieWindowConstraintsDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let directive: GenieWindowConstraintsDirective;
  let hostEl: HTMLElement;

  let positionEvents: WindowPosition[];
  let sizeEvents: WindowSize[];
  let operationEndCount: number;
  let restoreViewport: () => void;

  /** Trigger first CD (constructs the directive), wire outputs and pin a deterministic viewport. */
  function setup(mode: WindowControlMode = 'drag'): void {
    host.mode.set(mode);
    fixture.detectChanges();

    const de = fixture.debugElement.query(By.directive(GenieWindowConstraintsDirective));
    directive = de.injector.get(GenieWindowConstraintsDirective);
    hostEl = de.nativeElement as HTMLElement;

    positionEvents = [];
    sizeEvents = [];
    operationEndCount = 0;
    directive.positionChange.subscribe((p: WindowPosition) => positionEvents.push(p));
    directive.sizeChange.subscribe((s: WindowSize) => sizeEvents.push(s));
    directive.operationEnd.subscribe(() => (operationEndCount += 1));

    // Attach to the document so target/bubbling assertions are meaningful.
    document.body.appendChild(fixture.nativeElement);
  }

  beforeEach(() => {
    restoreViewport = stubViewport(1000, 800);
    TestBed.configureTestingModule({
      imports: [HostComponent],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  afterEach(() => {
    // Flush any per-operation `document` listeners a test may have left dangling so tests
    // stay isolated, then restore the real viewport getters.
    document.dispatchEvent(mouse('mouseup'));
    try {
      fixture.destroy();
    } catch {
      /* already destroyed by the test under exercise */
    }
    if (fixture.nativeElement?.parentNode) {
      fixture.nativeElement.parentNode.removeChild(fixture.nativeElement);
    }
    restoreViewport();
  });

  describe('construction & input defaults', () => {
    it('instantiates the directive on the [genieWindowConstraints] element', () => {
      setup();
      expect(directive)
        .withContext('directive should be applied to the host element')
        .toBeInstanceOf(GenieWindowConstraintsDirective);
    });

    it('exposes the documented defaults for its optional signal inputs', () => {
      setup();
      expect(directive.mode()).withContext('default mode').toBe('drag');
      expect(directive.isMaximized()).withContext('default isMaximized').toBe(false);
      expect(directive.minVisibleMargin()).withContext('default minVisibleMargin').toBe(50);
      expect(directive.minWidth()).withContext('default minWidth').toBe(600);
      expect(directive.minHeight()).withContext('default minHeight').toBe(400);
    });

    it('reflects the bound required inputs (windowPosition / windowSize)', () => {
      setup();
      expect(directive.windowPosition())
        .withContext('windowPosition mirrors the host binding')
        .toEqual({x: 100, y: 100});
      expect(directive.windowSize())
        .withContext('windowSize mirrors the host binding')
        .toEqual({width: 800, height: 600});
    });

    it('does not emit anything merely by being constructed', () => {
      setup();
      expect(positionEvents.length).withContext('no position emit at construction').toBe(0);
      expect(sizeEvents.length).withContext('no size emit at construction').toBe(0);
      expect(operationEndCount).withContext('no operationEnd at construction').toBe(0);
    });

    it('attaches its mousedown listener to the host element, not to document', () => {
      setup();
      // A mousedown dispatched straight on `document` must NOT start a drag: the listener is
      // scoped to the host element.
      document.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      document.dispatchEvent(mouse('mousemove', {clientX: 300, clientY: 300}));

      expect(positionEvents)
        .withContext('document-level mousedown is not observed by the directive')
        .toEqual([]);
    });
  });

  describe('drag mode — position clamping', () => {
    // Fixtures for every case below: position {100,100}, size {800,600}, viewport 1000x800,
    // minVisibleMargin 50. Origin mousedown is always at (200,200) so deltas are (client - 200).
    beforeEach(() => setup('drag'));

    it('emits an in-bounds position translated by the pointer delta', () => {
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      document.dispatchEvent(mouse('mousemove', {clientX: 250, clientY: 250})); // delta +50,+50

      expect(positionEvents)
        .withContext('base {100,100} + delta {50,50}, both within bounds')
        .toEqual([{x: 150, y: 150}]);
    });

    it('clamps X to the right edge (viewportWidth - minVisibleMargin)', () => {
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      document.dispatchEvent(mouse('mousemove', {clientX: 5000, clientY: 200})); // far right, no Y move

      // min(100 + 4800, 1000 - 50) = 950; Y delta 0 -> 100.
      expect(positionEvents).toEqual([{x: 950, y: 100}]);
    });

    it('clamps X to the left edge (minVisibleMargin - windowWidth)', () => {
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      document.dispatchEvent(mouse('mousemove', {clientX: -5000, clientY: 200})); // far left

      // max(50 - 800, ...) = -750, keeping `minVisibleMargin` px of the window on-screen.
      expect(positionEvents).toEqual([{x: -750, y: 100}]);
    });

    it('clamps Y to the top edge (0)', () => {
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      document.dispatchEvent(mouse('mousemove', {clientX: 200, clientY: -1000})); // far up

      expect(positionEvents).withContext('Y can never go negative').toEqual([{x: 100, y: 0}]);
    });

    it('clamps Y to the bottom edge (viewportHeight - minVisibleMargin)', () => {
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      document.dispatchEvent(mouse('mousemove', {clientX: 200, clientY: 5000})); // far down

      // min(100 + 4800, 800 - 50) = 750.
      expect(positionEvents).toEqual([{x: 100, y: 750}]);
    });

    it('emits once per mousemove, tracking a moving pointer', () => {
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      document.dispatchEvent(mouse('mousemove', {clientX: 210, clientY: 220})); // +10,+20
      document.dispatchEvent(mouse('mousemove', {clientX: 260, clientY: 205})); // +60,+5 (from origin)

      expect(positionEvents)
        .withContext('each move recomputes from the fixed origin/base, not incrementally')
        .toEqual([
          {x: 110, y: 120},
          {x: 160, y: 105},
        ]);
    });

    it('does not call preventDefault in drag mode', () => {
      const evt = mouse('mousedown', {clientX: 200, clientY: 200});
      const notCancelled = hostEl.dispatchEvent(evt);

      expect(evt.defaultPrevented).withContext('drag mode leaves the event cancelable').toBe(false);
      expect(notCancelled).withContext('dispatchEvent returns true when default not prevented').toBe(true);
    });
  });

  describe('drag mode — interactive-target guard (closest button/input/a)', () => {
    beforeEach(() => setup('drag'));

    it('does NOT start a drag when the mousedown target is a <button>', () => {
      const btn = hostEl.querySelector('.inner-btn') as HTMLElement;
      btn.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      document.dispatchEvent(mouse('mousemove', {clientX: 300, clientY: 300}));

      expect(positionEvents)
        .withContext('clicks that begin on a button must not drag the window')
        .toEqual([]);
    });

    it('does NOT start a drag when the mousedown target is an <input>', () => {
      const input = hostEl.querySelector('.inner-input') as HTMLElement;
      input.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      document.dispatchEvent(mouse('mousemove', {clientX: 300, clientY: 300}));

      expect(positionEvents).toEqual([]);
    });

    it('does NOT start a drag when the mousedown target is an <a>', () => {
      const link = hostEl.querySelector('.inner-link') as HTMLElement;
      link.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      document.dispatchEvent(mouse('mousemove', {clientX: 300, clientY: 300}));

      expect(positionEvents).toEqual([]);
    });

    it('DOES start a drag when the target is a non-interactive descendant (plain span)', () => {
      const span = hostEl.querySelector('.plain') as HTMLElement;
      span.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      document.dispatchEvent(mouse('mousemove', {clientX: 250, clientY: 250}));

      expect(positionEvents)
        .withContext('non-interactive content still drags the window')
        .toEqual([{x: 150, y: 150}]);
    });
  });

  describe('resize mode — size clamping', () => {
    // Fixtures: position {100,100}, size {800,600}, viewport 1000x800, minWidth 600, minHeight 400.
    // Origin mousedown is at (500,500); deltas are (client - 500).
    beforeEach(() => setup('resize'));

    it('emits an in-bounds size grown by the pointer delta', () => {
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 500, clientY: 500}));
      document.dispatchEvent(mouse('mousemove', {clientX: 550, clientY: 550})); // +50,+50

      // width  = max(600, 800+50)=850, min(850, 1000-100)=850
      // height = max(400, 600+50)=650, min(650, 800-100)=650
      expect(sizeEvents).toEqual([{width: 850, height: 650}]);
    });

    it('clamps width up to minWidth', () => {
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 500, clientY: 500}));
      document.dispatchEvent(mouse('mousemove', {clientX: 100, clientY: 500})); // dx -400, dy 0

      // width = max(600, 800-400)=600 (minWidth wins); height stays 600.
      expect(sizeEvents).toEqual([{width: 600, height: 600}]);
    });

    it('clamps height up to minHeight', () => {
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 500, clientY: 500}));
      document.dispatchEvent(mouse('mousemove', {clientX: 500, clientY: 100})); // dx 0, dy -400

      // height = max(400, 600-400)=400 (minHeight wins); width stays 800.
      expect(sizeEvents).toEqual([{width: 800, height: 400}]);
    });

    it('clamps width down to the viewport-relative max (viewportWidth - x)', () => {
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 500, clientY: 500}));
      document.dispatchEvent(mouse('mousemove', {clientX: 2000, clientY: 500})); // dx +1500

      // width = max(600, 800+1500)=2300, min(2300, 1000-100)=900.
      expect(sizeEvents).toEqual([{width: 900, height: 600}]);
    });

    it('clamps height down to the viewport-relative max (viewportHeight - y)', () => {
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 500, clientY: 500}));
      document.dispatchEvent(mouse('mousemove', {clientX: 500, clientY: 3000})); // dy +2500

      // height = max(400, 600+2500)=3100, min(3100, 800-100)=700.
      expect(sizeEvents).toEqual([{width: 800, height: 700}]);
    });

    it('calls preventDefault and stopPropagation on the resize mousedown', () => {
      const evt = mouse('mousedown', {clientX: 500, clientY: 500});
      const stopSpy = spyOn(evt, 'stopPropagation').and.callThrough();
      const notCancelled = hostEl.dispatchEvent(evt);

      expect(stopSpy).withContext('resize swallows the mousedown from ancestors').toHaveBeenCalled();
      expect(evt.defaultPrevented).withContext('resize prevents default').toBe(true);
      expect(notCancelled).toBe(false);
    });

    it('ignores the button/input/a guard in resize mode (guard is drag-only)', () => {
      // The `.closest('button, input, a')` short-circuit only runs in drag mode, so a resize that
      // begins on the button still resizes.
      const btn = hostEl.querySelector('.inner-btn') as HTMLElement;
      btn.dispatchEvent(mouse('mousedown', {clientX: 500, clientY: 500}));
      document.dispatchEvent(mouse('mousemove', {clientX: 550, clientY: 550}));

      expect(sizeEvents)
        .withContext('resize is not blocked by interactive targets')
        .toEqual([{width: 850, height: 650}]);
    });

    it('does not emit positionChange while resizing', () => {
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 500, clientY: 500}));
      document.dispatchEvent(mouse('mousemove', {clientX: 550, clientY: 550}));

      expect(positionEvents).withContext('resize only emits sizeChange').toEqual([]);
    });
  });

  describe('isMaximized guard', () => {
    it('does not start a drag while maximized', () => {
      host.maximized.set(true);
      setup('drag');
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      document.dispatchEvent(mouse('mousemove', {clientX: 300, clientY: 300}));

      expect(positionEvents).withContext('maximized windows do not drag').toEqual([]);
    });

    it('does not start a resize while maximized', () => {
      host.maximized.set(true);
      setup('resize');
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 500, clientY: 500}));
      document.dispatchEvent(mouse('mousemove', {clientX: 600, clientY: 600}));

      expect(sizeEvents).withContext('maximized windows do not resize').toEqual([]);
    });

    it('does not attach global listeners while maximized (a later mouseup emits nothing)', () => {
      host.maximized.set(true);
      setup('drag');
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      document.dispatchEvent(mouse('mouseup'));

      expect(operationEndCount)
        .withContext('no operation was started, so no operationEnd fires')
        .toBe(0);
    });

    it('resumes dragging after being un-maximized', () => {
      host.maximized.set(true);
      setup('drag');
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      expect(positionEvents.length).withContext('blocked while maximized').toBe(0);

      host.maximized.set(false);
      fixture.detectChanges();
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      document.dispatchEvent(mouse('mousemove', {clientX: 250, clientY: 250}));

      expect(positionEvents).withContext('drag works once un-maximized').toEqual([{x: 150, y: 150}]);
    });
  });

  describe('operation lifecycle & global-listener cleanup (no leak)', () => {
    it('emits operationEnd once on mouseup after a drag', () => {
      setup('drag');
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      document.dispatchEvent(mouse('mousemove', {clientX: 250, clientY: 250}));
      document.dispatchEvent(mouse('mouseup'));

      expect(operationEndCount).withContext('operationEnd fires exactly once per drag').toBe(1);
    });

    it('emits operationEnd once on mouseup after a resize', () => {
      setup('resize');
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 500, clientY: 500}));
      document.dispatchEvent(mouse('mousemove', {clientX: 550, clientY: 550}));
      document.dispatchEvent(mouse('mouseup'));

      expect(operationEndCount).withContext('operationEnd fires exactly once per resize').toBe(1);
    });

    it('emits operationEnd even if no move happened between down and up', () => {
      setup('drag');
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      document.dispatchEvent(mouse('mouseup'));

      expect(positionEvents).withContext('no move => no positionChange').toEqual([]);
      expect(operationEndCount).withContext('operationEnd still fires on release').toBe(1);
    });

    it('removes the document mousemove listener on mouseup (drag): later moves are inert', () => {
      setup('drag');
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      document.dispatchEvent(mouse('mousemove', {clientX: 250, clientY: 250})); // captured
      document.dispatchEvent(mouse('mouseup'));
      document.dispatchEvent(mouse('mousemove', {clientX: 400, clientY: 400})); // ignored

      expect(positionEvents)
        .withContext('the drag mousemove listener is torn down on release — no leak')
        .toEqual([{x: 150, y: 150}]);
    });

    it('removes the document mousemove listener on mouseup (resize): later moves are inert', () => {
      setup('resize');
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 500, clientY: 500}));
      document.dispatchEvent(mouse('mousemove', {clientX: 550, clientY: 550})); // captured
      document.dispatchEvent(mouse('mouseup'));
      document.dispatchEvent(mouse('mousemove', {clientX: 700, clientY: 700})); // ignored

      expect(sizeEvents)
        .withContext('the resize mousemove listener is torn down on release — no leak')
        .toEqual([{width: 850, height: 650}]);
    });

    it('does not re-emit operationEnd on a second stray mouseup after release', () => {
      setup('drag');
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      document.dispatchEvent(mouse('mouseup'));
      document.dispatchEvent(mouse('mouseup')); // the up listener was already removed

      expect(operationEndCount)
        .withContext('the mouseup listener removed itself, so a second up is inert')
        .toBe(1);
    });

    it('supports repeated independent drag cycles with a fresh origin/base each time', () => {
      setup('drag');

      // Cycle 1 — base {100,100}, origin (200,200).
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
      document.dispatchEvent(mouse('mousemove', {clientX: 230, clientY: 240})); // {130,140}
      document.dispatchEvent(mouse('mouseup'));

      // Cycle 2 — a completely new origin (0,0); base is still {100,100} (host unchanged).
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 0, clientY: 0}));
      document.dispatchEvent(mouse('mousemove', {clientX: 10, clientY: 20})); // {110,120}
      document.dispatchEvent(mouse('mouseup'));

      expect(positionEvents)
        .withContext('each cycle recomputes from its own origin, not the previous one')
        .toEqual([
          {x: 130, y: 140},
          {x: 110, y: 120},
        ]);
      expect(operationEndCount).withContext('one operationEnd per cycle').toBe(2);
    });

    it('CHARACTERIZATION: overlapping mousedowns register independent handlers (no guard)', () => {
      // There is no "already dragging" guard, so a second mousedown before mouseup attaches a
      // SECOND set of global listeners. A single mousemove then emits twice — once per live
      // handler, each computed from its own captured origin.
      setup('drag');
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200})); // origin A
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 300, clientY: 300})); // origin B
      document.dispatchEvent(mouse('mousemove', {clientX: 350, clientY: 350}));

      // Handler A: base 100 + (350-200)=250. Handler B: base 100 + (350-300)=150.
      expect(positionEvents)
        .withContext('both overlapping drag handlers fire for one move')
        .toEqual([
          {x: 250, y: 250},
          {x: 150, y: 150},
        ]);
    });
  });

  describe('reacting to live input changes mid-operation', () => {
    it('drag: re-reads windowSize on every move (affects the left-edge clamp)', () => {
      setup('drag');
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));

      // Shrink the window mid-drag; the left clamp is (minVisibleMargin - windowWidth).
      host.size.set({width: 300, height: 600});
      fixture.detectChanges();
      document.dispatchEvent(mouse('mousemove', {clientX: -5000, clientY: 200})); // far left

      // With width 300 the floor is 50 - 300 = -250 (not -750 from the original 800 width).
      expect(positionEvents)
        .withContext('windowSize is read live, so the clamp uses the NEW width')
        .toEqual([{x: -250, y: 100}]);
    });

    it('drag: re-reads minVisibleMargin on every move (affects the right-edge clamp)', () => {
      setup('drag');
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));

      host.minVisibleMargin.set(100);
      fixture.detectChanges();
      document.dispatchEvent(mouse('mousemove', {clientX: 5000, clientY: 200})); // far right

      // Right clamp becomes 1000 - 100 = 900 (not 950 from the original margin of 50).
      expect(positionEvents).toEqual([{x: 900, y: 100}]);
    });

    it('drag: CHARACTERIZATION — the base {x,y} is snapshotted at mousedown, not re-read', () => {
      setup('drag');
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200})); // base captured as {100,100}

      // Change the host position AFTER the drag started; the in-flight drag must ignore it.
      host.position.set({x: 500, y: 500});
      fixture.detectChanges();
      document.dispatchEvent(mouse('mousemove', {clientX: 250, clientY: 250})); // delta +50,+50

      expect(positionEvents)
        .withContext('base stays {100,100} + delta, NOT the updated {500,500}')
        .toEqual([{x: 150, y: 150}]);
    });

    it('resize: re-reads windowPosition on every move (affects the max-size clamp)', () => {
      setup('resize');
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 500, clientY: 500}));

      // Move the window right/up mid-resize; maxWidth = viewportWidth - x, maxHeight = viewportHeight - y.
      host.position.set({x: 400, y: 100});
      fixture.detectChanges();
      document.dispatchEvent(mouse('mousemove', {clientX: 700, clientY: 500})); // dx +200, dy 0

      // width  = max(600, 800+200)=1000, min(1000, 1000-400)=600
      // height = max(400, 600+0)=600,    min(600,  800-100)=600
      expect(sizeEvents)
        .withContext('windowPosition is read live, so maxWidth uses the NEW x')
        .toEqual([{width: 600, height: 600}]);
    });

    it('resize: CHARACTERIZATION — the base {w,h} is snapshotted at mousedown, not re-read', () => {
      setup('resize');
      hostEl.dispatchEvent(mouse('mousedown', {clientX: 500, clientY: 500})); // base captured as {800,600}

      host.size.set({width: 900, height: 900});
      fixture.detectChanges();
      document.dispatchEvent(mouse('mousemove', {clientX: 550, clientY: 550})); // +50,+50

      // width = max(600, 800+50)=850 (base 800, not the updated 900), min(850, 900)=850.
      expect(sizeEvents)
        .withContext('base size stays {800,600}; only min/max/position are live')
        .toEqual([{width: 850, height: 650}]);
    });
  });
});

/**
 * SSR / server-platform path: with PLATFORM_ID === 'server' the constructor returns before
 * wiring the host mousedown listener, so the directive is completely inert. A separate module
 * configuration is required to override PLATFORM_ID.
 */
describe('GenieWindowConstraintsDirective (SSR / server platform)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let directive: GenieWindowConstraintsDirective;
  let hostEl: HTMLElement;
  let positionEvents: WindowPosition[];
  let sizeEvents: WindowSize[];
  let restoreViewport: () => void;

  beforeEach(() => {
    restoreViewport = stubViewport(1000, 800);
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{provide: PLATFORM_ID, useValue: 'server'}],
    });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const de = fixture.debugElement.query(By.directive(GenieWindowConstraintsDirective));
    directive = de.injector.get(GenieWindowConstraintsDirective);
    hostEl = de.nativeElement as HTMLElement;

    positionEvents = [];
    sizeEvents = [];
    directive.positionChange.subscribe((p) => positionEvents.push(p));
    directive.sizeChange.subscribe((s) => sizeEvents.push(s));
    document.body.appendChild(fixture.nativeElement);
  });

  afterEach(() => {
    document.dispatchEvent(mouse('mouseup'));
    try {
      fixture.destroy();
    } catch {
      /* noop */
    }
    if (fixture.nativeElement?.parentNode) {
      fixture.nativeElement.parentNode.removeChild(fixture.nativeElement);
    }
    restoreViewport();
  });

  it('still instantiates the directive on the server', () => {
    expect(directive).toBeInstanceOf(GenieWindowConstraintsDirective);
  });

  it('does not wire the host mousedown listener (drag is inert)', () => {
    hostEl.dispatchEvent(mouse('mousedown', {clientX: 200, clientY: 200}));
    document.dispatchEvent(mouse('mousemove', {clientX: 300, clientY: 300}));

    expect(positionEvents)
      .withContext('no mousedown listener is attached on the server platform')
      .toEqual([]);
  });

  it('does not wire the host mousedown listener in resize mode either', () => {
    fixture.componentInstance.mode.set('resize');
    fixture.detectChanges();
    hostEl.dispatchEvent(mouse('mousedown', {clientX: 500, clientY: 500}));
    document.dispatchEvent(mouse('mousemove', {clientX: 600, clientY: 600}));

    expect(sizeEvents).withContext('resize is also inert on the server').toEqual([]);
  });
});
