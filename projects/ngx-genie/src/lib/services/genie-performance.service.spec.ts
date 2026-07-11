/**
 * Unit spec for GeniePerformanceService.
 *
 * The SUT reads a handful of ambient globals (window.__NGX_GENIE_PERFORMANCE__,
 * localStorage 'ngx-genie:performance') and installs a window.__ngxGeniePerformance
 * debug API from its constructor. Because the enabled flag is resolved *once* in a
 * field initializer (`_enabled = signal(this.readEnabledFlag())`), the ambient state
 * MUST be arranged BEFORE the service is instantiated via TestBed.inject().
 *
 * Every test starts from a clean slate (globals + localStorage wiped in before/afterEach)
 * so ordering can never leak state between specs. SSR behaviour is exercised by overriding
 * PLATFORM_ID with 'server' (the documented way to flip isPlatformBrowser() to false).
 */
import {PLATFORM_ID} from '@angular/core';
import {TestBed} from '@angular/core/testing';

import {
  GeniePerformanceEntry,
  GeniePerformanceService,
  GeniePerformanceSummaryEntry
} from './genie-performance.service';

const STORAGE_KEY = 'ngx-genie:performance';
const MAX_ENTRIES = 300;

/** Typed views onto the two ambient globals the SUT touches. */
interface PerfWindow {
  __NGX_GENIE_PERFORMANCE__?: unknown;
  __ngxGeniePerformance?: {
    enable(): void;
    disable(): void;
    clear(): void;
    snapshot(): GeniePerformanceEntry[];
    summarize(): Record<string, GeniePerformanceSummaryEntry>;
  };
}

function perfWindow(): PerfWindow {
  return window as unknown as PerfWindow;
}

/** Wipe every side-channel the SUT can read or write. */
function resetGlobals(): void {
  try {
    delete (window as unknown as Record<string, unknown>)['__NGX_GENIE_PERFORMANCE__'];
  } catch {
    /* ignore */
  }
  try {
    delete (window as unknown as Record<string, unknown>)['__ngxGeniePerformance'];
  } catch {
    /* ignore */
  }
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
}

describe('GeniePerformanceService', () => {
  beforeEach(() => {
    resetGlobals();
  });

  afterEach(() => {
    resetGlobals();
  });

  // Browser instance: no module config needed for a providedIn:'root' service —
  // PLATFORM_ID defaults to 'browser' under TestBed.
  function createBrowser(): GeniePerformanceService {
    return TestBed.inject(GeniePerformanceService);
  }

  // Server instance: override PLATFORM_ID BEFORE the service is constructed.
  function createServer(): GeniePerformanceService {
    TestBed.configureTestingModule({
      providers: [{provide: PLATFORM_ID, useValue: 'server'}]
    });
    return TestBed.inject(GeniePerformanceService);
  }

  describe('initial state & readEnabledFlag precedence', () => {
    it('defaults to disabled with an empty entry list when no flags are set', () => {
      const service = createBrowser();
      expect(service.isEnabled()).withContext('no flags => disabled').toBe(false);
      expect(service.enabled()).withContext('enabled() mirrors isEnabled()').toBe(false);
      expect(service.snapshot()).withContext('starts empty').toEqual([]);
      expect(service.entries()).withContext('entries() starts empty').toEqual([]);
    });

    it('reads enabled from localStorage "1" when the window override is absent', () => {
      localStorage.setItem(STORAGE_KEY, '1');
      expect(createBrowser().isEnabled()).toBe(true);
    });

    it('treats any localStorage value other than "1" as disabled', () => {
      localStorage.setItem(STORAGE_KEY, '0');
      expect(createBrowser().isEnabled()).withContext('"0" => disabled').toBe(false);
    });

    it('treats a non-"1" truthy-looking localStorage value ("true") as disabled', () => {
      localStorage.setItem(STORAGE_KEY, 'true');
      expect(createBrowser().isEnabled())
        .withContext('only the literal "1" enables via storage')
        .toBe(false);
    });

    it('window.__NGX_GENIE_PERFORMANCE__ === true wins over an unset storage flag', () => {
      perfWindow().__NGX_GENIE_PERFORMANCE__ = true;
      expect(createBrowser().isEnabled()).toBe(true);
    });

    it('window.__NGX_GENIE_PERFORMANCE__ === false OVERRIDES localStorage "1"', () => {
      // Boolean window override has strict precedence over storage.
      perfWindow().__NGX_GENIE_PERFORMANCE__ = false;
      localStorage.setItem(STORAGE_KEY, '1');
      expect(createBrowser().isEnabled())
        .withContext('boolean window flag wins even when storage says enabled')
        .toBe(false);
    });

    it('window.__NGX_GENIE_PERFORMANCE__ === true OVERRIDES localStorage "0"', () => {
      perfWindow().__NGX_GENIE_PERFORMANCE__ = true;
      localStorage.setItem(STORAGE_KEY, '0');
      expect(createBrowser().isEnabled()).toBe(true);
    });

    it('falls back to storage when the window override is a non-boolean (string "true")', () => {
      // Only a *boolean* window override is honoured; a string falls through to storage.
      (perfWindow() as {__NGX_GENIE_PERFORMANCE__?: unknown}).__NGX_GENIE_PERFORMANCE__ = 'true';
      localStorage.setItem(STORAGE_KEY, '1');
      expect(createBrowser().isEnabled())
        .withContext('non-boolean override is ignored; storage "1" applies')
        .toBe(true);
    });

    it('falls back to storage when the window override is the number 1 (not a boolean)', () => {
      (perfWindow() as {__NGX_GENIE_PERFORMANCE__?: unknown}).__NGX_GENIE_PERFORMANCE__ = 1;
      // No storage flag => disabled, because `1` is not typeof 'boolean'.
      expect(createBrowser().isEnabled()).toBe(false);
    });
  });

  describe('setEnabled / writeEnabledFlag', () => {
    it('setEnabled(true) flips the signal and writes "1" to localStorage', () => {
      const service = createBrowser();
      service.setEnabled(true);
      expect(service.isEnabled()).toBe(true);
      expect(service.enabled()).withContext('computed reflects new value').toBe(true);
      expect(localStorage.getItem(STORAGE_KEY)).withContext('persists "1"').toBe('1');
    });

    it('setEnabled(false) flips the signal and writes "0" to localStorage', () => {
      const service = createBrowser();
      service.setEnabled(true);
      service.setEnabled(false);
      expect(service.isEnabled()).toBe(false);
      expect(localStorage.getItem(STORAGE_KEY)).withContext('persists "0"').toBe('0');
    });
  });

  describe('startSpan', () => {
    it('returns a no-op span (records nothing) when disabled', () => {
      const service = createBrowser();
      const span = service.startSpan('boot');
      expect(typeof span).withContext('always returns a callable').toBe('function');
      span();
      span({extra: 1});
      expect(service.snapshot().length).withContext('no-op never records').toBe(0);
    });

    it('the disabled no-op span stays a no-op even if the service is enabled afterwards', () => {
      const service = createBrowser();
      const span = service.startSpan('boot'); // captured while disabled -> NOOP
      service.setEnabled(true);
      span();
      expect(service.snapshot().length)
        .withContext('NOOP is bound at creation time, not completion time')
        .toBe(0);
    });

    it('records a single duration entry on completion when enabled', () => {
      const service = createBrowser();
      service.setEnabled(true);

      // Deterministic clock: startSpan->now, completion->now (duration), recordDuration->now (at).
      spyOn(service as unknown as {now(): number}, 'now').and.returnValues(1000, 1150, 4242);

      const span = service.startSpan('render');
      expect(service.snapshot().length).withContext('startSpan itself records nothing').toBe(0);

      span();

      const snap = service.snapshot();
      expect(snap.length).withContext('exactly one entry after completion').toBe(1);
      expect(snap[0].name).toBe('render');
      expect(snap[0].durationMs).withContext('1150 - 1000').toBe(150);
      expect(snap[0].at).withContext('at stamped from the recordDuration now()').toBe(4242);
    });

    it('is idempotent — calling the span twice records only one entry', () => {
      const service = createBrowser();
      service.setEnabled(true);
      // 3 now() calls for the first completion; a second completion would call now() again
      // (returnValues would throw) — so exceeding the guard would fail this test loudly.
      spyOn(service as unknown as {now(): number}, 'now').and.returnValues(0, 10, 10);

      const span = service.startSpan('once');
      span();
      span(); // guarded by `completed` — must be a no-op
      expect(service.snapshot().length).withContext('completed guard prevents re-record').toBe(1);
    });

    it('does not record if the service is disabled between creation and completion', () => {
      // Characterization: completion re-checks enabled via recordDuration's own gate.
      const service = createBrowser();
      service.setEnabled(true);
      const span = service.startSpan('flaky');
      service.setEnabled(false);
      span();
      expect(service.snapshot().length)
        .withContext('recordDuration is gated by enabled at completion time')
        .toBe(0);
    });

    it('merges start data and end data (end keys win)', () => {
      const service = createBrowser();
      service.setEnabled(true);
      const span = service.startSpan('merge', {phase: 'start', keep: 'a'});
      span({phase: 'end', extra: 2});
      expect(service.snapshot()[0].data)
        .withContext('shallow merge; end overrides overlapping keys')
        .toEqual({phase: 'end', keep: 'a', extra: 2});
    });

    it('uses only start data when completion passes no end data', () => {
      const service = createBrowser();
      service.setEnabled(true);
      const span = service.startSpan('startonly', {phase: 'start'});
      span();
      expect(service.snapshot()[0].data).toEqual({phase: 'start'});
    });

    it('uses only end data when there was no start data', () => {
      const service = createBrowser();
      service.setEnabled(true);
      const span = service.startSpan('endonly');
      span({phase: 'end'});
      expect(service.snapshot()[0].data).toEqual({phase: 'end'});
    });

    it('leaves data undefined when neither start nor end data is supplied', () => {
      const service = createBrowser();
      service.setEnabled(true);
      const span = service.startSpan('nodata');
      span();
      expect(service.snapshot()[0].data).toBeUndefined();
    });
  });

  describe('recordDuration / recordSample gating', () => {
    it('recordDuration is a no-op while disabled', () => {
      const service = createBrowser();
      service.recordDuration('x', 42);
      expect(service.snapshot().length).toBe(0);
    });

    it('recordSample is a no-op while disabled', () => {
      const service = createBrowser();
      service.recordSample('x');
      expect(service.snapshot().length).toBe(0);
    });

    it('recordDuration appends an entry carrying durationMs when enabled', () => {
      const service = createBrowser();
      service.setEnabled(true);
      service.recordDuration('op', 12.5, {k: 'v'});
      const entry = service.snapshot()[0];
      expect(entry.name).toBe('op');
      expect(entry.durationMs).toBe(12.5);
      expect(entry.data).toEqual({k: 'v'});
      expect(typeof entry.at).withContext('at is stamped from now()').toBe('number');
    });

    it('recordSample appends an entry WITHOUT durationMs when enabled', () => {
      const service = createBrowser();
      service.setEnabled(true);
      service.recordSample('mark', {tag: 't'});
      const entry = service.snapshot()[0];
      expect(entry.name).toBe('mark');
      expect(entry.durationMs).withContext('samples have no duration').toBeUndefined();
      expect(entry.data).toEqual({tag: 't'});
    });
  });

  describe('summarize', () => {
    it('returns an empty object when there are no entries', () => {
      expect(createBrowser().summarize()).toEqual({});
    });

    it('groups duration entries by name with count/avgMs/maxMs/lastMs', () => {
      const service = createBrowser();
      service.setEnabled(true);
      service.recordDuration('a', 10);
      service.recordDuration('a', 20);
      service.recordDuration('a', 30);
      service.recordDuration('b', 5);

      const summary = service.summarize();
      expect(summary['a']).toEqual({count: 3, avgMs: 20, maxMs: 30, lastMs: 30});
      expect(summary['b']).toEqual({count: 1, avgMs: 5, maxMs: 5, lastMs: 5});
    });

    it('computes fractional averages and tracks the LAST duration by insertion order', () => {
      const service = createBrowser();
      service.setEnabled(true);
      service.recordDuration('avg', 10);
      service.recordDuration('avg', 5);
      expect(service.summarize()['avg'])
        .withContext('avg=(10+5)/2=7.5, max=10, last=5 (insertion order)')
        .toEqual({count: 2, avgMs: 7.5, maxMs: 10, lastMs: 5});
    });

    it('excludes recordSample entries (no durationMs) from the summary', () => {
      const service = createBrowser();
      service.setEnabled(true);
      service.recordSample('sampled');
      service.recordDuration('timed', 7);
      const summary = service.summarize();
      expect(summary['sampled']).withContext('samples are skipped').toBeUndefined();
      expect(summary['timed']).toEqual({count: 1, avgMs: 7, maxMs: 7, lastMs: 7});
    });

    it('counts a zero-millisecond duration (typeof 0 === "number")', () => {
      const service = createBrowser();
      service.setEnabled(true);
      service.recordDuration('zero', 0);
      expect(service.summarize()['zero']).toEqual({count: 1, avgMs: 0, maxMs: 0, lastMs: 0});
    });

    it('CHARACTERIZATION: maxMs is floored at 0 because Math.max seeds from 0', () => {
      // Quirk: the running `max` starts at 0, so a lone negative duration reports maxMs 0
      // even though count/avg/last reflect the negative value. This documents actual behavior.
      const service = createBrowser();
      service.setEnabled(true);
      service.recordDuration('neg', -5);
      expect(service.summarize()['neg']).toEqual({count: 1, avgMs: -5, maxMs: 0, lastMs: -5});
    });
  });

  describe('pushEntry cap (MAX_PERFORMANCE_ENTRIES = 300)', () => {
    it('grows up to exactly 300 entries', () => {
      const service = createBrowser();
      service.setEnabled(true);
      for (let i = 0; i < MAX_ENTRIES; i++) {
        service.recordSample('e', {i});
      }
      const snap = service.snapshot();
      expect(snap.length).toBe(300);
      expect(snap[0].data).withContext('oldest still present at the cap boundary').toEqual({i: 0});
      expect(snap[299].data).toEqual({i: 299});
    });

    it('at the boundary the oldest entry is dropped and the newest is kept', () => {
      const service = createBrowser();
      service.setEnabled(true);
      // Push 301 -> one over the cap: keeps last 300 (indices 1..300).
      for (let i = 0; i <= MAX_ENTRIES; i++) {
        service.recordSample('e', {i});
      }
      const snap = service.snapshot();
      expect(snap.length).withContext('stays capped at 300').toBe(300);
      expect(snap[0].data).withContext('index 0 was evicted').toEqual({i: 1});
      expect(snap[snap.length - 1].data).withContext('newest retained').toEqual({i: 300});
    });

    it('stays capped and keeps the newest window when pushed well past the cap', () => {
      const service = createBrowser();
      service.setEnabled(true);
      const total = 400;
      for (let i = 0; i < total; i++) {
        service.recordSample('e', {i});
      }
      const snap = service.snapshot();
      expect(snap.length).withContext('never exceeds 300').toBe(300);
      // Keeps the last 300: indices 100..399.
      expect(snap[0].data).toEqual({i: total - MAX_ENTRIES});
      expect(snap[snap.length - 1].data).toEqual({i: total - 1});
    });
  });

  describe('clear & snapshot', () => {
    it('clear() empties the entry list', () => {
      const service = createBrowser();
      service.setEnabled(true);
      service.recordSample('a');
      service.recordSample('b');
      expect(service.snapshot().length).toBe(2);
      service.clear();
      expect(service.snapshot()).withContext('cleared to empty').toEqual([]);
      expect(service.entries()).toEqual([]);
    });

    it('snapshot() returns a defensive copy — mutating it does not affect internal state', () => {
      const service = createBrowser();
      service.setEnabled(true);
      service.recordSample('a');

      const snap = service.snapshot();
      snap.push({name: 'injected', at: 0});
      snap.pop();
      snap.pop(); // try to wipe the copy entirely

      expect(service.snapshot().length).withContext('internal list untouched').toBe(1);
    });

    it('snapshot() returns a fresh array reference on each call', () => {
      const service = createBrowser();
      service.setEnabled(true);
      service.recordSample('a');
      expect(service.snapshot()).not.toBe(service.snapshot());
    });
  });

  describe('exposeDebugApi (window.__ngxGeniePerformance)', () => {
    it('registers the debug API on the window from the constructor', () => {
      createBrowser();
      const api = perfWindow().__ngxGeniePerformance;
      expect(api).withContext('debug api installed').toBeTruthy();
      expect(typeof api!.enable).toBe('function');
      expect(typeof api!.disable).toBe('function');
      expect(typeof api!.clear).toBe('function');
      expect(typeof api!.snapshot).toBe('function');
      expect(typeof api!.summarize).toBe('function');
    });

    it('enable()/disable() delegate to setEnabled on the same instance', () => {
      const service = createBrowser();
      const api = perfWindow().__ngxGeniePerformance!;

      api.enable();
      expect(service.isEnabled()).withContext('enable() -> setEnabled(true)').toBe(true);
      expect(localStorage.getItem(STORAGE_KEY)).toBe('1');

      api.disable();
      expect(service.isEnabled()).withContext('disable() -> setEnabled(false)').toBe(false);
      expect(localStorage.getItem(STORAGE_KEY)).toBe('0');
    });

    it('snapshot()/summarize() reflect the live service state via the debug API', () => {
      const service = createBrowser();
      const api = perfWindow().__ngxGeniePerformance!;
      service.setEnabled(true);
      service.recordDuration('d', 9);

      expect(api.snapshot().length).toBe(1);
      expect(api.summarize()['d']).toEqual({count: 1, avgMs: 9, maxMs: 9, lastMs: 9});
    });

    it('clear() via the debug API empties the entries', () => {
      const service = createBrowser();
      const api = perfWindow().__ngxGeniePerformance!;
      service.setEnabled(true);
      service.recordSample('a');
      api.clear();
      expect(service.snapshot()).toEqual([]);
    });
  });

  describe('SSR (PLATFORM_ID = "server") — isBrowser === false', () => {
    it('constructs without throwing on the server', () => {
      expect(() => createServer()).not.toThrow();
    });

    it('readEnabledFlag returns false regardless of window/localStorage flags', () => {
      perfWindow().__NGX_GENIE_PERFORMANCE__ = true;
      localStorage.setItem(STORAGE_KEY, '1');
      expect(createServer().isEnabled())
        .withContext('server short-circuits before reading any flag source')
        .toBe(false);
    });

    it('exposeDebugApi is a no-op — no window.__ngxGeniePerformance is installed', () => {
      createServer();
      expect(perfWindow().__ngxGeniePerformance)
        .withContext('debug api is not registered under SSR')
        .toBeUndefined();
    });

    it('setEnabled does not persist to localStorage under SSR and never throws', () => {
      const service = createServer();
      expect(() => service.setEnabled(true)).not.toThrow();
      expect(localStorage.getItem(STORAGE_KEY))
        .withContext('writeEnabledFlag is a no-op on the server')
        .toBeNull();
    });

    it('CHARACTERIZATION: setEnabled still flips the in-memory signal on the server', () => {
      // writeEnabledFlag is gated by isBrowser, but the signal itself is set unconditionally,
      // so recording works in-process even though nothing is persisted.
      const service = createServer();
      service.setEnabled(true);
      expect(service.isEnabled()).toBe(true);
      service.recordDuration('ssr', 3);
      expect(service.snapshot().length)
        .withContext('recording is gated only by the signal, which flipped')
        .toBe(1);
    });
  });

  describe('defensive try/catch paths', () => {
    it('readEnabledFlag swallows a throwing localStorage.getItem and reports disabled', () => {
      // No boolean window override => code reaches localStorage.getItem, which throws.
      spyOn(Storage.prototype, 'getItem').and.throwError('storage blocked');
      expect(createBrowser().isEnabled())
        .withContext('catch clause returns false')
        .toBe(false);
    });

    it('writeEnabledFlag swallows a throwing localStorage.setItem (setEnabled does not throw)', () => {
      const service = createBrowser();
      spyOn(Storage.prototype, 'setItem').and.throwError('storage blocked');
      expect(() => service.setEnabled(true)).not.toThrow();
      expect(service.isEnabled()).withContext('signal still updated despite write failure').toBe(true);
    });

    it('exposeDebugApi swallows a throwing window assignment (construction does not throw)', () => {
      // Make the assignment target throw on set; the constructor's try/catch must absorb it.
      Object.defineProperty(window, '__ngxGeniePerformance', {
        configurable: true,
        get: () => undefined,
        set: () => {
          throw new Error('frozen');
        }
      });
      try {
        let service: GeniePerformanceService | undefined;
        expect(() => (service = createBrowser())).not.toThrow();
        expect(service!.isEnabled()).withContext('service still usable').toBe(false);
      } finally {
        delete (window as unknown as Record<string, unknown>)['__ngxGeniePerformance'];
      }
    });
  });
});
