import {ChangeDetectionStrategy, Component, input, output, ViewEncapsulation} from '@angular/core';

@Component({
  selector: 'lib-options-panel-controls',
  standalone: true,
  imports: [],
  templateUrl: './options-panel-controls.component.html',
  styleUrl: './options-panel-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class OptionsPanelControlsComponent {

  readonly isDeepFocusMode = input<boolean>(false);


  readonly expandAll = output<void>();
  readonly collapseAll = output<void>();
  readonly toggleDeepFocusMode = output<void>();

  protected _onExpandAll(): void {
    this.expandAll.emit();
  }

  protected _onCollapseAll(): void {
    this.collapseAll.emit();
  }

  protected _onToggleDeepFocus(): void {
    this.toggleDeepFocusMode.emit();
  }
}
