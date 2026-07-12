import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { APP_BRAND } from '../../../../core/tokens/brand.token';
import { HotkeyService } from '../../../../core/services/hotkey.service';
import { prefersReducedMotion } from '../../../../core/directives/reduced-motion';

type LineKind = 'command' | 'muted' | 'comment' | 'keyword' | 'code' | 'blank';

interface TerminalLine {
  readonly kind: LineKind;
  readonly text: string;
  readonly prompt?: string;
}

interface RenderedLine extends TerminalLine {
  /** The portion of the line revealed so far by the typewriter. */
  readonly shown: string;
  /** True once the full line text has been typed out. */
  readonly complete: boolean;
}

/**
 * app-hero-terminal — a glassy faux terminal that typewriter-types the GenieOS
 * install command and the provideGenie() setup snippet. A single `cursor` signal
 * (advanced by an interval) drives how many characters are revealed; every line's
 * visible slice is derived reactively via computed().
 */
@Component({
  standalone: true,
  selector: 'app-hero-terminal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hero-terminal.component.html',
  styleUrl: './hero-terminal.component.scss',
  imports: [IconComponent],
})
export class HeroTerminalComponent {
  private readonly brand = inject(APP_BRAND);
  protected readonly hotkey = inject(HotkeyService);
  private readonly destroyRef = inject(DestroyRef);

  /** Number of characters typed across the whole script so far. */
  private readonly cursor = signal(0);

  /** The full scripted session — install, then the provider registration. */
  readonly script = computed<TerminalLine[]>(() => [
    { kind: 'command', prompt: '$', text: 'npm i -D ngx-genie' },
    { kind: 'muted', text: `added 1 package · ngx-genie@${this.brand.version}` },
    { kind: 'blank', text: '' },
    { kind: 'comment', text: '// app.config.ts' },
    { kind: 'keyword', text: "import { provideGenie } from 'ngx-genie';" },
    { kind: 'blank', text: '' },
    { kind: 'code', text: 'export const appConfig: ApplicationConfig = {' },
    { kind: 'code', text: '  providers: [' },
    { kind: 'code', text: `    provideGenie({ hotkey: '${this.hotkey.key}' }),` },
    { kind: 'code', text: '  ],' },
    { kind: 'code', text: '};' },
  ]);

  /** Total typeable characters (line text + one "newline pause" per line). */
  private readonly total = computed(() =>
    this.script().reduce((sum, line) => sum + line.text.length + 1, 0),
  );

  /** Walk the script and reveal only as many characters as the cursor allows. */
  readonly rendered = computed<RenderedLine[]>(() => {
    let budget = this.cursor();
    const out: RenderedLine[] = [];
    for (const line of this.script()) {
      const take = Math.min(line.text.length, budget);
      out.push({ ...line, shown: line.text.slice(0, take), complete: take >= line.text.length });
      budget -= line.text.length;
      if (budget <= 0) break;
      budget -= 1; // pause across the line break before the next line begins
      if (budget <= 0) break;
    }
    return out;
  });

  /** True once the entire script has finished typing. */
  readonly done = computed(() => this.cursor() >= this.total());

  readonly ariaLabel = computed(
    () => `Terminal installing and configuring ${this.brand.name} (${this.brand.codename}).`,
  );

  constructor() {
    afterNextRender(() => {
      // JS-driven motion: under prefers-reduced-motion, show the finished session.
      if (prefersReducedMotion()) {
        this.cursor.set(this.total());
        return;
      }
      const id = setInterval(() => {
        if (this.cursor() >= this.total()) {
          clearInterval(id);
          return;
        }
        this.cursor.update((c) => c + 1);
      }, 42);
      this.destroyRef.onDestroy(() => clearInterval(id));
    });
  }
}
