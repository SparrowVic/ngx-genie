import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { CodeBlockComponent } from '../../../shared/ui/code-block/code-block.component';
import { DocSection } from '../../../core/models/content.model';

/**
 * app-docs-section — one anchored documentation block: an iconed heading, a lead
 * paragraph and (when present) a framed, copyable code sample. The host carries
 * the section id so the docs-page table of contents can scroll to and highlight
 * it.
 */
@Component({
  standalone: true,
  selector: 'app-docs-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './docs-section.component.html',
  styleUrl: './docs-section.component.scss',
  imports: [IconComponent, CodeBlockComponent],
})
export class DocsSectionComponent {
  readonly section = input.required<DocSection>();

  /** Whether a code sample should render for this section. */
  readonly hasCode = computed(() => !!this.section().code);

  /** Language badge for the code block, defaulting to TypeScript. */
  readonly lang = computed(() => this.section().lang ?? 'ts');

  /** A friendly filename for the code frame, derived from the section. */
  readonly filename = computed<string | undefined>(() => {
    const s = this.section();
    const byId: Record<string, string> = {
      configure: 'app.config.ts',
      ngmodule: 'app.module.ts',
    };
    if (byId[s.id]) return byId[s.id];
    return s.lang === 'bash' ? 'terminal' : undefined;
  });

  /** In-page anchor target for deep-linking a section. */
  readonly anchor = computed(() => `#${this.section().id}`);
}
