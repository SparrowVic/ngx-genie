import {computed, inject, Injectable, PLATFORM_ID, signal} from '@angular/core';
import {isPlatformBrowser} from '@angular/common';

export interface GeniePerformanceEntry {
  name: string;
  at: number;
  durationMs?: number;
  data?: Record<string, unknown>;
}

export interface GeniePerformanceSummaryEntry {
  count: number;
  avgMs: number;
  maxMs: number;
  lastMs: number;
}

export type GeniePerformanceSpan = (data?: Record<string, unknown>) => void;

const STORAGE_KEY_PERFORMANCE_ENABLED = 'ngx-genie:performance';
const MAX_PERFORMANCE_ENTRIES = 300;
const NOOP_SPAN: GeniePerformanceSpan = () => undefined;

@Injectable({providedIn: 'root'})
export class GeniePerformanceService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly _enabled = signal(this.readEnabledFlag());
  private readonly _entries = signal<GeniePerformanceEntry[]>([]);

  readonly enabled = computed(() => this._enabled());
  readonly entries = computed(() => this._entries());

  constructor() {
    this.exposeDebugApi();
  }

  isEnabled(): boolean {
    return this._enabled();
  }

  setEnabled(enabled: boolean): void {
    this._enabled.set(enabled);
    this.writeEnabledFlag(enabled);
  }

  clear(): void {
    this._entries.set([]);
  }

  snapshot(): GeniePerformanceEntry[] {
    return [...this._entries()];
  }

  summarize(): Record<string, GeniePerformanceSummaryEntry> {
    const groups = new Map<string, { count: number; total: number; max: number; last: number }>();

    for (const entry of this._entries()) {
      if (typeof entry.durationMs !== 'number') continue;
      const current = groups.get(entry.name) ?? {count: 0, total: 0, max: 0, last: 0};
      current.count++;
      current.total += entry.durationMs;
      current.max = Math.max(current.max, entry.durationMs);
      current.last = entry.durationMs;
      groups.set(entry.name, current);
    }

    const summary: Record<string, GeniePerformanceSummaryEntry> = {};
    for (const [name, group] of groups) {
      summary[name] = {
        count: group.count,
        avgMs: group.count > 0 ? group.total / group.count : 0,
        maxMs: group.max,
        lastMs: group.last
      };
    }
    return summary;
  }

  startSpan(name: string, data?: Record<string, unknown>): GeniePerformanceSpan {
    if (!this._enabled()) return NOOP_SPAN;

    const startedAt = this.now();
    let completed = false;
    return (endData?: Record<string, unknown>) => {
      if (completed) return;
      completed = true;
      this.recordDuration(name, this.now() - startedAt, this.mergeData(data, endData));
    };
  }

  recordDuration(name: string, durationMs: number, data?: Record<string, unknown>): void {
    if (!this._enabled()) return;
    this.pushEntry({
      name,
      at: this.now(),
      durationMs,
      data
    });
  }

  recordSample(name: string, data?: Record<string, unknown>): void {
    if (!this._enabled()) return;
    this.pushEntry({
      name,
      at: this.now(),
      data
    });
  }

  private pushEntry(entry: GeniePerformanceEntry): void {
    const current = this._entries();
    const next = current.length >= MAX_PERFORMANCE_ENTRIES
      ? current.slice(current.length - MAX_PERFORMANCE_ENTRIES + 1)
      : current.slice();
    next.push(entry);
    this._entries.set(next);
  }

  private mergeData(
    startData?: Record<string, unknown>,
    endData?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (!startData) return endData;
    if (!endData) return startData;
    return {...startData, ...endData};
  }

  private readEnabledFlag(): boolean {
    if (!this.isBrowser) return false;
    try {
      const win = window as unknown as { __NGX_GENIE_PERFORMANCE__?: boolean };
      if (typeof win.__NGX_GENIE_PERFORMANCE__ === 'boolean') return win.__NGX_GENIE_PERFORMANCE__;
      return localStorage.getItem(STORAGE_KEY_PERFORMANCE_ENABLED) === '1';
    } catch {
      return false;
    }
  }

  private writeEnabledFlag(enabled: boolean): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(STORAGE_KEY_PERFORMANCE_ENABLED, enabled ? '1' : '0');
    } catch {
    }
  }

  private exposeDebugApi(): void {
    if (!this.isBrowser) return;

    try {
      const win = window as unknown as {
        __ngxGeniePerformance?: Record<string, unknown>;
      };
      win.__ngxGeniePerformance = {
        enable: () => this.setEnabled(true),
        disable: () => this.setEnabled(false),
        clear: () => this.clear(),
        snapshot: () => this.snapshot(),
        summarize: () => this.summarize()
      };
    } catch {
    }
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }
}
