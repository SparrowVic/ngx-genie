import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NotificationService } from '../../core/services/notification.service';
import { HotkeyService } from '../../core/services/hotkey.service';
import { APP_BRAND } from '../../core/tokens/brand.token';
import { SectionHeaderComponent } from '../../shared/ui/section-header/section-header.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { RevealOnScrollDirective } from '../../core/directives/reveal-on-scroll.directive';
import { MagneticDirective } from '../../core/directives/magnetic.directive';
import { PluralizePipe } from '../../core/pipes/pluralize.pipe';
import { SignalLabComponent } from './signal-lab/signal-lab.component';
import { DiSimulatorComponent } from './di-simulator/di-simulator.component';
import { ProviderScopeComponent } from './provider-scope/provider-scope.component';

/** A short "how to read this" pointer shown under the header. */
interface Pointer {
  readonly icon: string;
  readonly text: string;
  readonly accent: string;
}

/**
 * app-playground-page — the interactive workbench. It exists to hand the GenieOS
 * overlay a set of *component-scoped* providers (Signal lab, DI simulator) to
 * visualise alongside the app-wide root services, then explains the difference.
 * Everything here is live: press F1 and watch the graph update as you play.
 */
@Component({
  standalone: true,
  selector: 'app-playground-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SectionHeaderComponent,
    ButtonComponent,
    IconComponent,
    RevealOnScrollDirective,
    MagneticDirective,
    PluralizePipe,
    SignalLabComponent,
    DiSimulatorComponent,
    ProviderScopeComponent,
  ],
  templateUrl: './playground-page.component.html',
  styleUrl: './playground-page.component.scss',
})
export class PlaygroundPageComponent {
  protected readonly brand = inject(APP_BRAND);
  protected readonly hotkey = inject(HotkeyService);
  private readonly notifications = inject(NotificationService);

  /** How many times the "inspect" hint has been fired this session. */
  private readonly _prompts = signal(0);
  readonly prompts = this._prompts.asReadonly();

  readonly pointers: readonly Pointer[] = [
    { icon: 'command', text: `Press ${this.hotkey.key} to open the overlay`, accent: 'var(--indigo)' },
    { icon: 'layers', text: 'Element-scoped providers nest here', accent: 'var(--cyan)' },
    { icon: 'eye', text: 'Live Inspector tracks every signal', accent: 'var(--violet)' },
  ];

  readonly promptLabel = computed(() =>
    this._prompts() === 0 ? `Press ${this.hotkey.key} to inspect` : 'Remind me again',
  );

  promptInspect(): void {
    this._prompts.update((n) => n + 1);
    this.notifications.push({
      title: 'Open GenieOS',
      message: `Press ${this.hotkey.key} to inspect this page’s dependency graph.`,
      tone: 'info',
      icon: 'command',
    });
  }
}
