import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CopyButtonComponent } from '../copy-button/copy-button.component';

/**
 * ui-code-block — a framed snippet with a macOS-style title bar (traffic-light dots,
 * optional filename, language badge, copy button) and a whitespace-preserving body.
 * The exact `code` string is copied verbatim via the composed ui-copy-button.
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

  readonly languageLabel = computed(() => this.lang().toUpperCase());
}
