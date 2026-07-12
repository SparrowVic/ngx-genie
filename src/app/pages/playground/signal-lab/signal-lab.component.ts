import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  model,
} from '@angular/core';
import { SignalLabService } from './signal-lab.service';
import { NotificationService } from '../../../core/services/notification.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { ButtonComponent } from '../../../shared/ui/button/button.component';
import { ChipComponent } from '../../../shared/ui/chip/chip.component';
import { SparklineComponent } from '../../../shared/ui/sparkline/sparkline.component';
import { PluralizePipe } from '../../../core/pipes/pluralize.pipe';

/** One row in the live readout table — a signal or computed and its value. */
interface Readout {
  readonly name: string;
  readonly kind: 'signal' | 'computed';
  readonly value: string;
  readonly accent: string;
}

/**
 * app-signal-lab — an interactive reactive store, backed by a component-scoped
 * SignalLabService. Buttons mutate the store, a model()-bound number input drives
 * the step, and every signal / computed is mirrored in a live readout table plus a
 * sparkline of the count's history. Open GenieOS (F1) to watch them update in the
 * Live Inspector as an element-scoped provider.
 */
@Component({
  standalone: true,
  selector: 'app-signal-lab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SignalLabService],
  imports: [IconComponent, ButtonComponent, ChipComponent, SparklineComponent, PluralizePipe],
  templateUrl: './signal-lab.component.html',
  styleUrl: './signal-lab.component.scss',
})
export class SignalLabComponent {
  protected readonly lab = inject(SignalLabService);
  private readonly notifications = inject(NotificationService);

  /** Two-way model input driving the step; mirrored into the service by an effect. */
  readonly step = model(1);

  /** A flat, render-ready snapshot of the whole reactive graph. */
  readonly readouts = computed<Readout[]>(() => [
    { name: 'count()', kind: 'signal', value: `${this.lab.count()}`, accent: 'var(--violet)' },
    { name: 'step()', kind: 'signal', value: `${this.lab.step()}`, accent: 'var(--indigo)' },
    { name: 'doubled()', kind: 'computed', value: `${this.lab.doubled()}`, accent: 'var(--cyan)' },
    { name: 'squared()', kind: 'computed', value: `${this.lab.squared()}`, accent: 'var(--magenta)' },
    {
      name: 'isEven()',
      kind: 'computed',
      value: `${this.lab.isEven()}`,
      accent: this.lab.isEven() ? 'var(--emerald)' : 'var(--amber)',
    },
    {
      name: 'history().length',
      kind: 'computed',
      value: `${this.lab.historyLength()}`,
      accent: 'var(--rose)',
    },
  ]);

  /** True while the store is at its pristine starting value. */
  readonly isPristine = computed(() => this.lab.count() === 0 && this.lab.historyLength() === 1);

  constructor() {
    // Keep the service's step signal in lock-step with the model input, so the
    // store — and therefore the inspector — is the single source of truth.
    effect(() => this.lab.setStep(this.step()), {allowSignalWrites: true});
  }

  onStepInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.step.set(Number.isFinite(value) ? value : 1);
  }

  increment(): void {
    this.lab.increment();
  }

  decrement(): void {
    this.lab.decrement();
  }

  reset(): void {
    this.lab.reset();
    this.step.set(1);
    this.notifications.push({
      title: 'Signal lab reset',
      message: 'count and history are back to zero.',
      tone: 'info',
      icon: 'recycle',
    });
  }
}
