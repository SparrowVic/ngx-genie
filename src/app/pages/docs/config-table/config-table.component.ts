import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { PluralizePipe } from '../../../core/pipes/pluralize.pipe';
import { ConfigOption } from '../../../core/models/content.model';

/**
 * app-config-table — a clean, responsive rendering of the provideGenie() config
 * surface. On wide viewports it reads as a four-column table (name / type /
 * default / description); on narrow ones each option collapses into a labelled
 * card. Default values are tinted by their runtime type so booleans, strings and
 * numbers are scannable at a glance.
 */
@Component({
  standalone: true,
  selector: 'app-config-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './config-table.component.html',
  styleUrl: './config-table.component.scss',
  imports: [PluralizePipe],
})
export class ConfigTableComponent {
  readonly options = input.required<ConfigOption[]>();

  /** Column headings, kept in one place so the head + a11y stay in sync. */
  readonly columns = ['Option', 'Type', 'Default', 'Description'] as const;

  /** Row the pointer/keyboard is currently resting on (drives the highlight). */
  private readonly _activeName = signal<string | null>(null);
  readonly activeName = this._activeName.asReadonly();

  readonly count = computed(() => this.options().length);

  setActive(name: string): void {
    this._activeName.set(name);
  }

  clear(): void {
    this._activeName.set(null);
  }

  /** Tint a default value by the option's declared type for quick scanning. */
  accentForDefault(option: ConfigOption): string {
    const type = option.type.toLowerCase();
    if (type.includes('bool')) return 'var(--emerald)';
    if (type.includes('string')) return 'var(--cyan)';
    if (type.includes('number')) return 'var(--amber)';
    return 'var(--violet)';
  }
}
