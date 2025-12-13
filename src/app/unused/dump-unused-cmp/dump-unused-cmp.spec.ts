import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DumpUnusedCmp } from './dump-unused-cmp';

describe('DumpUnusedCmp', () => {
  let component: DumpUnusedCmp;
  let fixture: ComponentFixture<DumpUnusedCmp>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DumpUnusedCmp]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DumpUnusedCmp);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
