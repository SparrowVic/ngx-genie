import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  ViewEncapsulation
} from '@angular/core';
import {GenieServiceRegistration, GenieTreeNode} from '../../../../models/genie-node.model';
import {JsonTreeComponent} from '../json-tree/json-tree.component';
import {GenieResizableDirective} from '../../../../shared/directives/resizable/resizable.directive';
import {NgClass} from '@angular/common';

@Component({
  selector: 'lib-inspector-provider-details',
  standalone: true,
  imports: [
    JsonTreeComponent,
    GenieResizableDirective,
    NgClass
  ],
  templateUrl: './inspector-provider-details.component.html',
  styleUrl: './inspector-provider-details.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom
})
export class InspectorProviderDetailsComponent {
  private el = inject(ElementRef);

  service = input.required<GenieServiceRegistration | null>();
  state = input.required<any>();
  path = input.required<GenieTreeNode[]>();
  isLiveWatch = input(false);


  snapshotHeight = signal(300);

  consoleLog = output<void>();


  readonly HEADER_HEIGHT = 34;

  protected _scopeInfo = computed(() => {
    const svc = this.service();
    if (!svc) return {label: 'Unknown', cls: ''};
    const isRoot = svc.isRoot ?? (svc.token?.['ɵprov']?.providedIn === 'root');
    if (svc.token?.['ɵprov']?.providedIn === 'platform') return {label: 'PLATFORM', cls: 'scope-platform'};
    return isRoot ? {label: 'ROOT', cls: 'scope-root'} : {label: 'COMPONENT / MODULE', cls: 'scope-component'};
  });

  onSnapshotResize(delta: number) {
    const hostHeight = this.el.nativeElement.offsetHeight;
    if (!hostHeight) return;


    const minTop = this.HEADER_HEIGHT;
    const minBottom = this.HEADER_HEIGHT;
    const maxTop = hostHeight - minBottom - 6;

    this.snapshotHeight.update(currentHeight => {
      const newHeight = currentHeight + delta;
      return Math.max(minTop, Math.min(newHeight, maxTop));
    });
  }


  snapToTop() {
    this.snapshotHeight.set(this.HEADER_HEIGHT);
  }


  snapToBottom() {
    const hostHeight = this.el.nativeElement.offsetHeight;
    if (!hostHeight) return;


    const maxTop = hostHeight - this.HEADER_HEIGHT - 6;
    this.snapshotHeight.set(maxTop);
  }
}
