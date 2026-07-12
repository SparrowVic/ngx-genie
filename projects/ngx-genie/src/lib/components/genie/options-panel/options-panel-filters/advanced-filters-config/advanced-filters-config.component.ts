import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject } from '@angular/core';
import { AdvancedConfigStore } from './advanced-config.store';
import { GicHeaderComponent } from './components/gic-header/gic-header.component';
import { GicTabsComponent } from './components/gic-tabs/gic-tabs.component';
import { GicIoPanelComponent } from './components/gic-io-panel/gic-io-panel.component';
import { GicRulesTabComponent } from './components/gic-rules-tab/gic-rules-tab.component';
import { GicTokensTabComponent } from './components/gic-tokens-tab/gic-tokens-tab.component';
import { GicFrameworkTabComponent } from './components/gic-framework-tab/gic-framework-tab.component';

/**
 * Shell for the "Advanced Internals Configuration" modal. Thin by design: it provides the
 * component-scoped {@link AdvancedConfigStore}, defines the design tokens (inherited through the
 * shadow boundary by every nested sub-component), and composes the granular pieces.
 */
@Component({
  standalone: true,
  selector: 'gen-advanced-filters-config',
  imports: [
    GicHeaderComponent,
    GicTabsComponent,
    GicIoPanelComponent,
    GicRulesTabComponent,
    GicTokensTabComponent,
    GicFrameworkTabComponent,
  ],
  providers: [AdvancedConfigStore],
  templateUrl: './advanced-filters-config.component.html',
  styleUrl: './advanced-filters-config.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class GenAdvancedFiltersConfigComponent {
  protected readonly store = inject(AdvancedConfigStore);
}
