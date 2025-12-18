import {Injectable} from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ConstellationStateService {
  private readonly _savedPositions = new Map<string, { x: number, y: number }>();

  private _savedViewTransform = {x: 0, y: 0, k: 1};

  get positions() {
    return this._savedPositions;
  }

  get viewTransform() {
    return this._savedViewTransform;
  }

  savePositions(nodes: Map<string, { x: number, y: number }>) {
    this._savedPositions.clear();
    nodes.forEach((val, key) => {
      this._savedPositions.set(key, {x: val.x, y: val.y});
    });
  }

  saveViewTransform(transform: { x: number, y: number, k: number }) {
    this._savedViewTransform = transform;
  }

  hasPositions(): boolean {
    return this._savedPositions.size > 0;
  }

  hasTransform(): boolean {
    return this._savedViewTransform.x !== 0 ||
      this._savedViewTransform.y !== 0 ||
      this._savedViewTransform.k !== 1;
  }

  clear() {
    this._savedPositions.clear();
    this._savedViewTransform = {x: 0, y: 0, k: 1};
  }
}
