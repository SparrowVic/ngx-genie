import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from '@angular/core';
import { CopyButtonComponent } from '../copy-button/copy-button.component';

/**
 * ui-code-block — a framed snippet with a macOS-style title bar (traffic-light dots,
 * optional filename tab, language badge, copy button) and a whitespace-preserving body.
 * The exact `code` string is copied verbatim via the composed ui-copy-button.
 * `compact` drops the dots and language badge for narrow rails (e.g. a sidebar).
 */
@Component({
  selector: 'ui-code-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CopyButtonComponent],
  templateUrl: './code-block.component.html',
  styleUrl: './code-block.component.scss',
})
export class CodeBlockComponent {
  readonly code = input.required<string>();
  readonly lang = input('ts');
  readonly filename = input<string>();
  readonly compact = input(false, { transform: booleanAttribute });

  readonly languageLabel = computed(() => this.lang().toUpperCase());

  /** Region label for the keyboard-scrollable snippet body. */
  readonly bodyLabel = computed(() => {
    const name = this.filename();
    return name ? `Code sample — ${name}` : `Code sample (${this.languageLabel()})`;
  });
}
