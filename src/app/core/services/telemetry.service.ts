import { Injectable, signal } from '@angular/core';
import { Metric } from '../models/metric.model';

/**
 * Static "by the numbers" facts for the home observatory band. Every value here is a
 * verifiable fact about the GenieOS overlay — there is no live feed and no simulated
 * trend; the tiles are a fixed, honest snapshot.
 */
@Injectable({ providedIn: 'root' })
export class TelemetryService {
  private readonly _metrics = signal<Metric[]>([
    { id: 'views', label: 'Inspector views', icon: 'eye', accent: 'var(--cyan)', value: 6 },
    { id: 'providers', label: 'Provider types', icon: 'layers', accent: 'var(--indigo)', value: 9 },
    { id: 'checks', label: 'Diagnostic checks', icon: 'shield', accent: 'var(--violet)', value: 8 },
    { id: 'severity', label: 'Severity levels', icon: 'gauge', accent: 'var(--magenta)', value: 3 },
    { id: 'workers', label: 'Web Workers', icon: 'cpu', accent: 'var(--emerald)', value: 2 },
    { id: 'angular', label: 'Angular version', icon: 'atom', accent: 'var(--amber)', value: 21 },
  ]);
  readonly metrics = this._metrics.asReadonly();
}
