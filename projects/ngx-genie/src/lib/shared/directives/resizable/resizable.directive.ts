import {Directive, ElementRef, EventEmitter, Input, OnDestroy, Output, Renderer2} from '@angular/core';

@Directive({
  selector: '[genieResizable]',
  standalone: true
})
export class GenieResizableDirective implements OnDestroy {
  @Input() direction: 'horizontal' | 'vertical' = 'vertical';


  @Input() minSize = 0;
  @Input() maxSize = 9999;
  @Input() startSize = 0;

  @Output() resizing = new EventEmitter<number>();
  @Output() resizeEnd = new EventEmitter<void>();

  private isResizing = false;
  private prevMouse = 0;
  private listeners: (() => void)[] = [];

  constructor(private el: ElementRef, private renderer: Renderer2) {
    this.listeners.push(
      this.renderer.listen(this.el.nativeElement, 'mousedown', (e) => this.onMouseDown(e))
    );
  }

  private onMouseDown(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    this.isResizing = true;


    this.prevMouse = this.direction === 'horizontal' ? event.clientX : event.clientY;


    const moveListener = this.renderer.listen('document', 'mousemove', (e) => this.onMouseMove(e));
    const upListener = this.renderer.listen('document', 'mouseup', () => this.onMouseUp(moveListener, upListener));
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.isResizing) return;


    const currentMouse = this.direction === 'horizontal' ? event.clientX : event.clientY;


    const delta = currentMouse - this.prevMouse;


    this.prevMouse = currentMouse;


    if (delta === 0) return;


    this.resizing.emit(delta);
  }

  private onMouseUp(moveListener: () => void, upListener: () => void): void {
    if (this.isResizing) {
      this.isResizing = false;
      this.resizeEnd.emit();
    }

    moveListener();
    upListener();
  }

  ngOnDestroy(): void {
    this.listeners.forEach(unsub => unsub());
  }
}
