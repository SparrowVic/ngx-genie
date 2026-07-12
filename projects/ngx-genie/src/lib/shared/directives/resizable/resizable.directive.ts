import {Directive, ElementRef, inject, input, OnDestroy, output, Renderer2} from '@angular/core';

@Directive({
  standalone: true,
  selector: '[genieResizable]',
})
export class GenieResizableDirective implements OnDestroy {
  direction = input<'horizontal' | 'vertical'>('vertical');


  minSize = input(0);
  maxSize = input(9999);
  startSize = input(0);

  resizing = output<number>();
  resizeEnd = output<void>();

  private readonly el = inject(ElementRef);
  private readonly renderer = inject(Renderer2);

  private isResizing = false;
  private prevMouse = 0;
  private listeners: (() => void)[] = [];

  constructor() {
    this.listeners.push(
      this.renderer.listen(this.el.nativeElement, 'mousedown', (e) => this.onMouseDown(e))
    );
  }

  private onMouseDown(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    this.isResizing = true;


    this.prevMouse = this.direction() === 'horizontal' ? event.clientX : event.clientY;


    const moveListener = this.renderer.listen('document', 'mousemove', (e) => this.onMouseMove(e));
    const upListener = this.renderer.listen('document', 'mouseup', () => this.onMouseUp(moveListener, upListener));
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.isResizing) return;


    const currentMouse = this.direction() === 'horizontal' ? event.clientX : event.clientY;


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
