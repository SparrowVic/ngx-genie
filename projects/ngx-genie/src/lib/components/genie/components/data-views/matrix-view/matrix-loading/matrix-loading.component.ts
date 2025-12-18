import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
  ViewEncapsulation
} from '@angular/core';
import {CommonModule} from '@angular/common';

@Component({
  selector: 'lib-matrix-loading',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './matrix-loading.component.html',
  styleUrl: './matrix-loading.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class MatrixLoadingComponent implements OnInit, OnDestroy {
  readonly isDataReady = input<boolean>(false);

  readonly logLines = signal<string[]>([]);
  readonly progress = signal<number>(0);

  readonly animationComplete = output<void>();

  private intervalId: any;
  private currentStep = 0;
  private isPaused = false;

  private readonly messages = [
    'CONNECTING TO NEURAL NET...',
    'ALLOCATING MEMORY BLOCKS...',
    'DECRYPTING DEPENDENCY GRID...',
    'PARSING ANGULAR METADATA...',
    'INJECTING TOKENS...',
    'RESOLVING CIRCULAR DEPS...',
    'RENDERING VIRTUAL CONSTRUCT...',
    'WAKE UP, NEO...'
  ];

  constructor() {
    effect(() => {
      if (this.isDataReady() && this.isPaused) {
        this.isPaused = false;
        this.runNextStep();
      }
    });
  }

  ngOnInit() {
    this.runNextStep();
  }

  ngOnDestroy() {
    clearTimeout(this.intervalId);
  }

  private runNextStep() {
    const totalSteps = this.messages.length;

    if (this.currentStep >= totalSteps) {
      setTimeout(() => {
        this.animationComplete.emit();
      }, 1000);
      return;
    }

    if (this.currentStep === totalSteps - 1 && !this.isDataReady()) {
      this.isPaused = true;

      this.logLines.update(lines => {
        const waitingMsg = 'SYNCHRONIZING DATA STREAMS...';
        if (lines[lines.length - 1] !== waitingMsg) {
          return [...lines.slice(-5), waitingMsg];
        }
        return lines;
      });

      return;
    }

    const msg = this.messages[this.currentStep];
    this.logLines.update(lines => {
      const cleanLines = lines.filter(l => l !== 'SYNCHRONIZING DATA STREAMS...');
      return [...cleanLines.slice(-5), msg];
    });

    const percent = Math.round(((this.currentStep + 1) / totalSteps) * 100);
    this.progress.set(percent);

    this.currentStep++;
    this.intervalId = setTimeout(() => this.runNextStep(), 150);
  }
}
