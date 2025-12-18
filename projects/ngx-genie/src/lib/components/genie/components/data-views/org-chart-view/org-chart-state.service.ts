import {Injectable} from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class OrgChartStateService {
  private _viewTransform = {x: 0, y: 0, k: 1};

  get viewTransform() {
    return this._viewTransform;
  }

  saveViewTransform(transform: { x: number, y: number, k: number }) {
    this._viewTransform = transform;
  }

  hasTransform(): boolean {
    return this._viewTransform.x !== 0 ||
      this._viewTransform.y !== 0 ||
      this._viewTransform.k !== 1;
  }
}
