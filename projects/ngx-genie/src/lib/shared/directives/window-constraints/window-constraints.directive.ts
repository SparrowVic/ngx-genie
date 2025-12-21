import {Directive, ElementRef, EventEmitter, inject, Input, Output, PLATFORM_ID} from '@angular/core';
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

  /** Operation mode: 'drag' for moving window, 'resize' for changing size */
  @Input() mode: WindowControlMode = 'drag';

  /** Current window position */
  @Input() windowPosition!: WindowPosition;

  /** Current window size */
  @Input() windowSize!: WindowSize;

  /** Disable operations when window is maximized */
  @Input() isMaximized = false;

  /** Minimum pixels of window that must remain visible (for drag mode) */
  @Input() minVisibleMargin = 50;

  /** Minimum window width (for resize mode) */
  @Input() minWidth = 600;

  /** Minimum window height (for resize mode) */
  @Input() minHeight = 400;

  /** Emits new position when dragging (drag mode only) */
  @Output() positionChange = new EventEmitter<WindowPosition>();

  /** Emits new size when resizing (resize mode only) */
  @Output() sizeChange = new EventEmitter<WindowSize>();

  /** Emits when operation ends (both modes) */
  @Output() operationEnd = new EventEmitter<void>();

  constructor(private elementRef: ElementRef<HTMLElement>) {
    if (!this.isBrowser) return;

    this.elementRef.nativeElement.addEventListener('mousedown', (event) => {
      this.onMouseDown(event);
    });
  }

  private onMouseDown(event: MouseEvent): void {
    if (this.isMaximized) return;

    // For drag mode, check if clicking on interactive elements
    if (this.mode === 'drag') {
      if ((event.target as HTMLElement).closest('button, input, a')) return;
    }

    // For resize mode, prevent default and stop propagation
    if (this.mode === 'resize') {
      event.stopPropagation();
      event.preventDefault();
    }

    if (this.mode === 'drag') {
      this.startDrag(event);
    } else {
      this.startResize(event);
    }
  }

  private startDrag(event: MouseEvent): void {
    const startX = event.clientX;
    const startY = event.clientY;
    const {x, y} = this.windowPosition;

    const mouseMoveHandler = (e: MouseEvent) => {
      const newX = x + (e.clientX - startX);
      const newY = y + (e.clientY - startY);

      // Get viewport and window dimensions
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const windowWidth = this.windowSize.width;
      const windowHeight = this.windowSize.height;

      // Constrain position to keep window within viewport
      // At least minVisibleMargin pixels of window must be visible
      const constrainedX = Math.max(
        this.minVisibleMargin - windowWidth, // Left boundary
        Math.min(newX, viewportWidth - this.minVisibleMargin) // Right boundary
      );
      const constrainedY = Math.max(
        0, // Top boundary
        Math.min(newY, viewportHeight - this.minVisibleMargin) // Bottom boundary
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
    const startW = this.windowSize.width;
    const startH = this.windowSize.height;

    const mouseMoveHandler = (e: MouseEvent) => {
      const newWidth = Math.max(this.minWidth, startW + (e.clientX - startX));
      const newHeight = Math.max(this.minHeight, startH + (e.clientY - startY));

      // Get viewport dimensions and current window position
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const {x, y} = this.windowPosition;

      // Constrain size to prevent window from extending beyond viewport
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
