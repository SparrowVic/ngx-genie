import {Directive, ElementRef, inject, input, output, PLATFORM_ID} from '@angular/core';
import {DOCUMENT, isPlatformBrowser} from '@angular/common';

export type WindowControlMode = 'drag' | 'resize';

export interface WindowPosition {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

/**
 * Universal directive for window operations with viewport constraints.
 * Supports both dragging and resizing modes with automatic boundary checks.
 *
 * @example
 * // Drag mode
 * <div genieWindowConstraints
 *      mode="drag"
 *      [windowPosition]="position()"
 *      [windowSize]="size()"
 *      (positionChange)="onPositionChange($event)">
 * </div>
 *
 * @example
 * // Resize mode
 * <div genieWindowConstraints
 *      mode="resize"
 *      [windowPosition]="position()"
 *      [windowSize]="size()"
 *      (sizeChange)="onSizeChange($event)">
 * </div>
 */
@Directive({
  selector: '[genieWindowConstraints]',
  standalone: true
})
export class GenieWindowConstraintsDirective {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly mode = input<WindowControlMode>('drag');
  readonly windowPosition = input.required<WindowPosition>();
  readonly windowSize = input.required<WindowSize>();
  readonly isMaximized = input<boolean>(false);
  readonly minVisibleMargin = input<number>(50);
  readonly minWidth = input<number>(600);
  readonly minHeight = input<number>(400);

  readonly positionChange = output<WindowPosition>();
  readonly sizeChange = output<WindowSize>();
  readonly operationEnd = output<void>();

  constructor(private elementRef: ElementRef<HTMLElement>) {
    if (!this.isBrowser) return;

    this.elementRef.nativeElement.addEventListener('mousedown', (event) => {
      this.onMouseDown(event);
    });
  }

  private onMouseDown(event: MouseEvent): void {
    if (this.isMaximized()) return;

    if (this.mode() === 'drag') {
      if ((event.target as HTMLElement).closest('button, input, a')) return;
    }

    if (this.mode() === 'resize') {
      event.stopPropagation();
      event.preventDefault();
    }

    if (this.mode() === 'drag') {
      this.startDrag(event);
    } else {
      this.startResize(event);
    }
  }

  private startDrag(event: MouseEvent): void {
    const startX = event.clientX;
    const startY = event.clientY;
    const {x, y} = this.windowPosition();

    const mouseMoveHandler = (e: MouseEvent) => {
      const newX = x + (e.clientX - startX);
      const newY = y + (e.clientY - startY);

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const windowWidth = this.windowSize().width;
      const windowHeight = this.windowSize().height;

      const minMargin = this.minVisibleMargin();
      const constrainedX = Math.max(
        minMargin - windowWidth,
        Math.min(newX, viewportWidth - minMargin)
      );
      const constrainedY = Math.max(
        0,
        Math.min(newY, viewportHeight - minMargin)
      );

      this.positionChange.emit({
        x: constrainedX,
        y: constrainedY
      });
    };

    const mouseUpHandler = () => {
      this.document.removeEventListener('mousemove', mouseMoveHandler);
      this.document.removeEventListener('mouseup', mouseUpHandler);
      this.operationEnd.emit();
    };

    this.document.addEventListener('mousemove', mouseMoveHandler);
    this.document.addEventListener('mouseup', mouseUpHandler);
  }

  private startResize(event: MouseEvent): void {
    const startX = event.clientX;
    const startY = event.clientY;
    const startW = this.windowSize().width;
    const startH = this.windowSize().height;

    const mouseMoveHandler = (e: MouseEvent) => {
      const newWidth = Math.max(this.minWidth(), startW + (e.clientX - startX));
      const newHeight = Math.max(this.minHeight(), startH + (e.clientY - startY));

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const {x, y} = this.windowPosition();

      const maxWidth = viewportWidth - x;
      const maxHeight = viewportHeight - y;

      this.sizeChange.emit({
        width: Math.min(newWidth, maxWidth),
        height: Math.min(newHeight, maxHeight)
      });
    };

    const mouseUpHandler = () => {
      this.document.removeEventListener('mousemove', mouseMoveHandler);
      this.document.removeEventListener('mouseup', mouseUpHandler);
      this.operationEnd.emit();
    };

    this.document.addEventListener('mousemove', mouseMoveHandler);
    this.document.addEventListener('mouseup', mouseUpHandler);
  }
}
