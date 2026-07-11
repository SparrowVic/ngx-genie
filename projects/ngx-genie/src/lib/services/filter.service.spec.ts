/**
 * Behavioural spec for {@link GenFilterService}.
 *
 * The service is `providedIn: 'root'`, injects PLATFORM_ID, and persists its config to
 * localStorage via a constructor `effect()` that ALSO clears an internal classification
 * cache on every config change. Effects only flush on `TestBed.tick()` (Angular 21), so
 * tests that depend on the save / cache-clear side effects call it explicitly and treat the
 * pre-tick state as the (deliberately) stale characterization.
 *
 * Conventions mirror configs/angular-internals-compat.spec.ts:
 *   - TestBed.configureTestingModule / TestBed.inject
 *   - private access via `(svc as any)` and `any`-casts for ɵ / off-contract shapes
 *   - withContext() on non-obvious assertions
 *
 * localStorage is cleared before AND after every test to avoid cross-test pollution.
 */
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { GenFilterService, FilterMatchType, FilterRule } from './filter.service';
import {
  INTERNAL_CATEGORIES,
  INTERNAL_NAME_TO_CATEGORY,
  normalizeInternalName,
} from '../configs/angular-internals';

// Must match the private constants inside filter.service.ts.
const STORAGE_KEY = 'genie_filters_config';
const STORAGE_VERSION = 2;

interface MakeOpts {
  platform?: 'browser' | 'server';
  /** Raw string to seed localStorage[STORAGE_KEY] with BEFORE the constructor runs. */
  seed?: string;
}

/**
 * Build a fresh service instance. Any storage seed is written before `inject()` so the
 * constructor's `loadFromStorage()` observes it. Call at most once per test (a second
 * `configureTestingModule` after instantiation throws).
 */
function makeService(opts: MakeOpts = {}): GenFilterService {
  if (opts.seed !== undefined) localStorage.setItem(STORAGE_KEY, opts.seed);
  TestBed.configureTestingModule({
    providers: opts.platform === 'server' ? [{ provide: PLATFORM_ID, useValue: 'server' }] : [],
  });
  return TestBed.inject(GenFilterService);
}

describe('GenFilterService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  // ---------------------------------------------------------------------------
  describe('config helpers (angular-internals)', () => {
    it('normalizeInternalName strips exactly one leading underscore', () => {
      expect(normalizeInternalName('NgIf')).toBe('NgIf');
      expect(normalizeInternalName('_NgIf')).toBe('NgIf');
      expect(normalizeInternalName('__NgIf'))
        .withContext('only ONE leading underscore is stripped')
        .toBe('_NgIf');
      expect(normalizeInternalName('')).toBe('');
    });

    it('maps built-in raw names to their category id', () => {
      expect(INTERNAL_NAME_TO_CATEGORY.get('NgIf')).toBe('common-directives');
      expect(INTERNAL_NAME_TO_CATEGORY.get('RouterOutlet')).toBe('router-directives');
      expect(INTERNAL_NAME_TO_CATEGORY.get('NotARealAngularThing')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  describe('checkFilterStatus — precedence', () => {
    it('empty token name => { hidden:false, reason:"Visible" }', () => {
      const svc = makeService();
      expect(svc.checkFilterStatus('')).toEqual({ hidden: false, reason: 'Visible' });
    });

    it('an unknown, un-categorised token => Visible', () => {
      const svc = makeService();
      const res = svc.checkFilterStatus('MyOwnService');
      expect(res.hidden).toBe(false);
      expect(res.reason).toBe('Visible');
    });

    it('manualShown WINS over manualHidden (same token in both sets)', () => {
      const svc = makeService();
      // applyState (via import) does NOT enforce set-exclusivity, so we can craft the
      // otherwise-impossible "in both" state to exercise the ordering in checkFilterStatus.
      const r = svc.importConfig(JSON.stringify({ manualHidden: ['Dup'], manualShown: ['Dup'] }));
      expect(r.ok).toBe(true);
      const res = svc.checkFilterStatus('Dup');
      expect(res.hidden).withContext('manualShown is checked first').toBe(false);
      expect(res.reason).toBe('Manual');
      expect(res.detail).toBe('Pinned visible');
    });

    it('manualHidden WINS over a matching enabled "show" rule', () => {
      const svc = makeService();
      svc.toggleManualState('NgIf', true); // -> manualHidden
      svc.addRule({ type: 'Prefix', value: 'Ng', action: 'show' }); // would force-show
      const res = svc.checkFilterStatus('NgIf');
      expect(res.hidden).withContext('manual short-circuits before rules').toBe(true);
      expect(res.reason).toBe('Manual');
      expect(res.detail).toBe('Hidden by you');
    });

    it('an enabled rule WINS over a hidden category ("show" rule un-hides a category member)', () => {
      const svc = makeService();
      // common-directives is hidden by default, so NgIf would be Category-hidden.
      svc.addRule({ type: 'Exact', value: 'NgIf', action: 'show' });
      const res = svc.checkFilterStatus('NgIf');
      expect(res.hidden).withContext('rule beats category').toBe(false);
      expect(res.reason).toBe('Rule');
    });

    it('the FIRST enabled matching rule wins (order = insertion order)', () => {
      const svc = makeService();
      const first = svc.addRule({ type: 'Prefix', value: 'F', action: 'hide' });
      const second = svc.addRule({ type: 'Exact', value: 'Foo', action: 'show' });
      expect(first && second).toBeTruthy();

      let res = svc.checkFilterStatus('Foo');
      expect(res.reason).toBe('Rule');
      expect(res.rule?.id).withContext('earlier rule matched first').toBe(first!.id);
      expect(res.hidden).toBe(true);

      // Disable the first — now the second ("show") governs.
      svc.toggleRule(first!.id);
      res = svc.checkFilterStatus('Foo');
      expect(res.rule?.id).toBe(second!.id);
      expect(res.hidden).toBe(false);
    });

    it('a disabled rule is skipped entirely', () => {
      const svc = makeService();
      const rule = svc.addRule({ type: 'Exact', value: 'Foo', action: 'hide' });
      svc.toggleRule(rule!.id); // disable
      const res = svc.checkFilterStatus('Foo');
      expect(res.hidden).withContext('disabled hide rule no longer applies').toBe(false);
      expect(res.reason).toBe('Visible');
    });

    it('a "hide" rule reports hidden:true with reason Rule and detail = rule value', () => {
      const svc = makeService();
      const rule = svc.addRule({ type: 'Exact', value: 'Foo', action: 'hide' });
      const res = svc.checkFilterStatus('Foo');
      expect(res.hidden).toBe(true);
      expect(res.reason).toBe('Rule');
      expect(res.detail).toBe('Foo');
      expect(res.rule?.id).toBe(rule!.id);
    });

    it('a "show" rule reports hidden:false with reason Rule', () => {
      const svc = makeService();
      svc.addRule({ type: 'Exact', value: 'Foo', action: 'show' });
      const res = svc.checkFilterStatus('Foo');
      expect(res.hidden).toBe(false);
      expect(res.reason).toBe('Rule');
    });

    it('a hidden category member reports reason Category with its id + label', () => {
      const svc = makeService();
      const res = svc.checkFilterStatus('NgIf');
      expect(res.hidden).toBe(true);
      expect(res.reason).toBe('Category');
      expect(res.categoryId).toBe('common-directives');
      expect(res.detail).withContext('detail is the category label').toBe('Common Directives');
    });
  });

  // ---------------------------------------------------------------------------
  describe('testRule', () => {
    let svc: GenFilterService;
    beforeEach(() => (svc = makeService()));

    it('Exact: matches identical string only', () => {
      expect(svc.testRule('NgIf', { type: 'Exact', value: 'NgIf' })).toBe(true);
      expect(svc.testRule('NgIff', { type: 'Exact', value: 'NgIf' })).toBe(false);
    });

    it('Prefix: positive & negative', () => {
      expect(svc.testRule('NgIf', { type: 'Prefix', value: 'Ng' })).toBe(true);
      expect(svc.testRule('XNgIf', { type: 'Prefix', value: 'Ng' })).toBe(false);
    });

    it('Suffix: positive & negative', () => {
      expect(svc.testRule('NgIf', { type: 'Suffix', value: 'If' })).toBe(true);
      expect(svc.testRule('IfX', { type: 'Suffix', value: 'If' })).toBe(false);
    });

    it('Regex: positive & negative', () => {
      expect(svc.testRule('NgIf', { type: 'Regex', value: '^Ng' })).toBe(true);
      expect(svc.testRule('XNgIf', { type: 'Regex', value: '^Ng' })).toBe(false);
    });

    it('empty value => false for every type', () => {
      expect(svc.testRule('NgIf', { type: 'Exact', value: '' })).toBe(false);
      expect(svc.testRule('NgIf', { type: 'Prefix', value: '' })).toBe(false);
      expect(svc.testRule('NgIf', { type: 'Suffix', value: '' })).toBe(false);
      expect(svc.testRule('NgIf', { type: 'Regex', value: '' })).toBe(false);
    });

    it('an INVALID regex "[" => false and does NOT throw', () => {
      expect(() => svc.testRule('NgIf', { type: 'Regex', value: '[' })).not.toThrow();
      expect(svc.testRule('NgIf', { type: 'Regex', value: '[' })).toBe(false);
    });

    it('an unknown match type => false (default branch)', () => {
      expect(svc.testRule('NgIf', { type: 'Bogus' as FilterMatchType, value: 'NgIf' })).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  describe('isForceShown', () => {
    it('true when manually pinned visible', () => {
      const svc = makeService();
      svc.toggleManualState('A', false); // pin visible
      expect(svc.isForceShown('A')).toBe(true);
    });

    it('true when an enabled "show" rule matches', () => {
      const svc = makeService();
      svc.addRule({ type: 'Prefix', value: 'Ng', action: 'show' });
      expect(svc.isForceShown('NgIf')).toBe(true);
    });

    it('false when the matching "show" rule is disabled', () => {
      const svc = makeService();
      const rule = svc.addRule({ type: 'Prefix', value: 'Ng', action: 'show' });
      svc.toggleRule(rule!.id);
      expect(svc.isForceShown('NgIf')).toBe(false);
    });

    it('false for a matching "hide" rule (hide never force-shows)', () => {
      const svc = makeService();
      svc.addRule({ type: 'Exact', value: 'B', action: 'hide' });
      expect(svc.isForceShown('B')).toBe(false);
    });

    it('false for an unrelated token', () => {
      const svc = makeService();
      expect(svc.isForceShown('Whatever')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  describe('type overrides', () => {
    it('getTypeOverride returns null when unset', () => {
      const svc = makeService();
      expect(svc.getTypeOverride('T')).toBeNull();
    });

    it('set, overwrite, then clear via null', () => {
      const svc = makeService();

      svc.overrideTokenType('T', 'Service');
      expect(svc.getTypeOverride('T')).toBe('Service');
      expect(svc.overridesList()).toEqual([{ token: 'T', type: 'Service' }]);

      svc.overrideTokenType('T', 'Pipe'); // overwrite
      expect(svc.getTypeOverride('T')).toBe('Pipe');
      expect(svc.overridesList().length).toBe(1);

      svc.overrideTokenType('T', null); // clear
      expect(svc.getTypeOverride('T')).toBeNull();
      expect(svc.overridesList()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('matchCount', () => {
    it('counts matches across a names[] list', () => {
      const svc = makeService();
      const names = ['NgIf', 'NgFor', 'Router', 'NgClass'];
      expect(svc.matchCount({ type: 'Prefix', value: 'Ng' }, names)).toBe(3);
      expect(svc.matchCount({ type: 'Exact', value: 'Router' }, names)).toBe(1);
    });

    it('empty value => 0 (short-circuits)', () => {
      const svc = makeService();
      expect(svc.matchCount({ type: 'Prefix', value: '' }, ['NgIf', 'NgFor'])).toBe(0);
    });

    it('empty names => 0', () => {
      const svc = makeService();
      expect(svc.matchCount({ type: 'Prefix', value: 'Ng' }, [])).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('isValidRule', () => {
    let svc: GenFilterService;
    beforeEach(() => (svc = makeService()));

    it('empty / whitespace value => false', () => {
      expect(svc.isValidRule({ type: 'Exact', value: '' })).toBe(false);
      expect(svc.isValidRule({ type: 'Exact', value: '   ' })).toBe(false);
    });

    it('a bad regex => false', () => {
      expect(svc.isValidRule({ type: 'Regex', value: '[' })).toBe(false);
    });

    it('a valid regex => true', () => {
      expect(svc.isValidRule({ type: 'Regex', value: 'a+' })).toBe(true);
    });

    it('non-regex types do NOT validate the pattern ("[" is fine for Exact)', () => {
      expect(svc.isValidRule({ type: 'Exact', value: '[' }))
        .withContext('only Regex compiles the value')
        .toBe(true);
      expect(svc.isValidRule({ type: 'Prefix', value: 'Ng' })).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  describe('addRule', () => {
    it('returns the created rule with enabled:true and a generated id', () => {
      const svc = makeService();
      const rule = svc.addRule({ type: 'Exact', value: 'Foo' });
      expect(rule).toBeTruthy();
      expect(rule!.enabled).toBe(true);
      expect(typeof rule!.id).toBe('string');
      expect(svc.customRules()).toContain(rule as FilterRule);
    });

    it('trims the value', () => {
      const svc = makeService();
      const rule = svc.addRule({ type: 'Exact', value: '  Foo  ' });
      expect(rule!.value).toBe('Foo');
    });

    it('action defaults to "hide"', () => {
      const svc = makeService();
      expect(svc.addRule({ type: 'Exact', value: 'Foo' })!.action).toBe('hide');
    });

    it('trims a note; a whitespace-only note becomes undefined', () => {
      const svc = makeService();
      expect(svc.addRule({ type: 'Exact', value: 'A', note: '  hi  ' })!.note).toBe('hi');
      expect(svc.addRule({ type: 'Exact', value: 'B', note: '   ' })!.note).toBeUndefined();
    });

    it('DEDUP: identical type+value+action returns null and does NOT add', () => {
      const svc = makeService();
      const first = svc.addRule({ type: 'Exact', value: 'Foo', action: 'hide' });
      const dup = svc.addRule({ type: 'Exact', value: 'Foo', action: 'hide' });
      expect(first).toBeTruthy();
      expect(dup).withContext('duplicate rejected').toBeNull();
      expect(svc.customRules().length).toBe(1);
    });

    it('same type+value but DIFFERENT action is NOT a duplicate', () => {
      const svc = makeService();
      svc.addRule({ type: 'Exact', value: 'Foo', action: 'hide' });
      const show = svc.addRule({ type: 'Exact', value: 'Foo', action: 'show' });
      expect(show).toBeTruthy();
      expect(svc.customRules().length).toBe(2);
    });

    it('an invalid rule (empty / bad regex) returns null and adds nothing', () => {
      const svc = makeService();
      expect(svc.addRule({ type: 'Exact', value: '   ' })).toBeNull();
      expect(svc.addRule({ type: 'Regex', value: '[' })).toBeNull();
      expect(svc.customRules().length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('updateRule / toggleRule / removeRule', () => {
    it('updateRule patches the matching rule only', () => {
      const svc = makeService();
      const a = svc.addRule({ type: 'Exact', value: 'A' })!;
      const b = svc.addRule({ type: 'Exact', value: 'B' })!;
      svc.updateRule(a.id, { value: 'A2', enabled: false, action: 'show' });

      const updated = svc.customRules().find((r) => r.id === a.id)!;
      expect(updated.value).toBe('A2');
      expect(updated.enabled).toBe(false);
      expect(updated.action).toBe('show');
      // b is untouched
      expect(svc.customRules().find((r) => r.id === b.id)!.value).toBe('B');
    });

    it('toggleRule flips enabled', () => {
      const svc = makeService();
      const a = svc.addRule({ type: 'Exact', value: 'A' })!;
      expect(a.enabled).toBe(true);
      svc.toggleRule(a.id);
      expect(svc.customRules()[0].enabled).toBe(false);
      svc.toggleRule(a.id);
      expect(svc.customRules()[0].enabled).toBe(true);
    });

    it('removeRule removes by id; an unknown id is a no-op', () => {
      const svc = makeService();
      const a = svc.addRule({ type: 'Exact', value: 'A' })!;
      svc.addRule({ type: 'Exact', value: 'B' });
      svc.removeRule('does-not-exist');
      expect(svc.customRules().length).toBe(2);
      svc.removeRule(a.id);
      expect(svc.customRules().map((r) => r.value)).toEqual(['B']);
    });
  });

  // ---------------------------------------------------------------------------
  describe('moveRule bounds', () => {
    function threeRules(svc: GenFilterService): FilterRule[] {
      return [
        svc.addRule({ type: 'Exact', value: 'A' })!,
        svc.addRule({ type: 'Exact', value: 'B' })!,
        svc.addRule({ type: 'Exact', value: 'C' })!,
      ];
    }

    it('moving the first rule up (-1) is a no-op', () => {
      const svc = makeService();
      const [a] = threeRules(svc);
      svc.moveRule(a.id, -1);
      expect(svc.customRules().map((r) => r.value)).toEqual(['A', 'B', 'C']);
    });

    it('moving the last rule down (+1) is a no-op', () => {
      const svc = makeService();
      const [, , c] = threeRules(svc);
      svc.moveRule(c.id, 1);
      expect(svc.customRules().map((r) => r.value)).toEqual(['A', 'B', 'C']);
    });

    it('a valid swap reorders the two rules', () => {
      const svc = makeService();
      const [a] = threeRules(svc);
      svc.moveRule(a.id, 1); // A <-> B
      expect(svc.customRules().map((r) => r.value)).toEqual(['B', 'A', 'C']);
    });

    it('moving an unknown id is a no-op', () => {
      const svc = makeService();
      threeRules(svc);
      svc.moveRule('nope', 1);
      expect(svc.customRules().map((r) => r.value)).toEqual(['A', 'B', 'C']);
    });
  });

  // ---------------------------------------------------------------------------
  describe('manual state', () => {
    it('toggleManualState(name,true) => hidden set, removed from shown', () => {
      const svc = makeService();
      svc.toggleManualState('X', false); // start pinned visible
      svc.toggleManualState('X', true); // now force-hide
      expect(svc.manualHiddenList()).toContain('X');
      expect(svc.manualShownList()).not.toContain('X');
    });

    it('toggleManualState(name,false) => shown set, removed from hidden', () => {
      const svc = makeService();
      svc.toggleManualState('X', true);
      svc.toggleManualState('X', false);
      expect(svc.manualShownList()).toContain('X');
      expect(svc.manualHiddenList()).not.toContain('X');
    });

    it('the two sets stay mutually exclusive across independent tokens', () => {
      const svc = makeService();
      svc.toggleManualState('H', true);
      svc.toggleManualState('S', false);
      expect(svc.manualHiddenList()).toEqual(['H']);
      expect(svc.manualShownList()).toEqual(['S']);
    });

    it('clearManualState removes a token from BOTH sets', () => {
      const svc = makeService();
      svc.toggleManualState('X', true);
      svc.clearManualState('X');
      expect(svc.manualHiddenList()).not.toContain('X');
      expect(svc.manualShownList()).not.toContain('X');
    });
  });

  // ---------------------------------------------------------------------------
  describe('categories', () => {
    it('default categoryHidden is derived from INTERNAL_CATEGORIES[].defaultHidden', () => {
      const svc = makeService();
      for (const cat of INTERNAL_CATEGORIES) {
        expect(svc.categoryHidden()[cat.id]).withContext(cat.id).toBe(cat.defaultHidden);
      }
    });

    it('exposes the raw category descriptors', () => {
      const svc = makeService();
      expect(svc.categories).toBe(INTERNAL_CATEGORIES);
    });

    it('setCategoryHidden sets an explicit value', () => {
      const svc = makeService();
      svc.setCategoryHidden('rxjs', false);
      expect(svc.categoryHidden()['rxjs']).toBe(false);
      svc.setCategoryHidden('rxjs', true);
      expect(svc.categoryHidden()['rxjs']).toBe(true);
    });

    it('toggleCategory flips a category', () => {
      const svc = makeService();
      const before = svc.categoryHidden()['rxjs'];
      svc.toggleCategory('rxjs');
      expect(svc.categoryHidden()['rxjs']).toBe(!before);
    });
  });

  // ---------------------------------------------------------------------------
  describe('name normalization vs exact rules', () => {
    it('with a category hidden, BOTH "NgIf" and "_NgIf" resolve to Category-hidden', () => {
      const svc = makeService(); // common-directives hidden by default
      const bare = svc.checkFilterStatus('NgIf');
      const mangled = svc.checkFilterStatus('_NgIf');
      expect(bare.reason).toBe('Category');
      expect(bare.categoryId).toBe('common-directives');
      expect(mangled.reason)
        .withContext('leading underscore is normalised away for category lookup')
        .toBe('Category');
      expect(mangled.categoryId).toBe('common-directives');
    });

    it('an Exact rule "NgIf" matches only "NgIf", never "_NgIf"', () => {
      const svc = makeService();
      // Disable the category so the ONLY thing that could hide "_NgIf" is the rule.
      svc.setCategoryHidden('common-directives', false);
      svc.addRule({ type: 'Exact', value: 'NgIf', action: 'hide' });

      expect(svc.testRule('NgIf', { type: 'Exact', value: 'NgIf' })).toBe(true);
      expect(svc.testRule('_NgIf', { type: 'Exact', value: 'NgIf' }))
        .withContext('Exact does not normalise the candidate name')
        .toBe(false);

      expect(svc.checkFilterStatus('NgIf').reason).toBe('Rule');
      const mangled = svc.checkFilterStatus('_NgIf');
      expect(mangled.hidden).withContext('rule misses, category off => visible').toBe(false);
      expect(mangled.reason).toBe('Visible');
    });
  });

  // ---------------------------------------------------------------------------
  describe('import / export / reset', () => {
    it('exportConfig round-trips through importConfig', () => {
      const svc = makeService();
      svc.addRule({ type: 'Exact', value: 'Foo', action: 'hide' });
      svc.toggleManualState('Bar', true);
      svc.toggleManualState('Baz', false);
      svc.overrideTokenType('Qux', 'Service');
      svc.setCategoryHidden('rxjs', false);

      const exported = svc.exportConfig();

      svc.resetToDefaults();
      expect(svc.customRules().length).withContext('reset first').toBe(0);

      const res = svc.importConfig(exported);
      expect(res.ok).toBe(true);
      expect(svc.customRules().map((r) => r.value)).toEqual(['Foo']);
      expect(svc.manualHiddenList()).toEqual(['Bar']);
      expect(svc.manualShownList()).toEqual(['Baz']);
      expect(svc.getTypeOverride('Qux')).toBe('Service');
      expect(svc.categoryHidden()['rxjs']).toBe(false);
    });

    it('exportConfig emits the pinned version and no volatile fields', () => {
      const svc = makeService();
      const data = JSON.parse(svc.exportConfig());
      expect(data.version).toBe(STORAGE_VERSION);
      expect('appName' in data).withContext('appName is excluded from export').toBe(false);
      expect('lastUpdated' in data).toBe(false);
    });

    it('importConfig with malformed JSON => { ok:false, error }', () => {
      const svc = makeService();
      const res = svc.importConfig('{ not valid json');
      expect(res.ok).toBe(false);
      expect(typeof res.error).toBe('string');
    });

    it('importConfig of a non-object JSON ("5") => { ok:false }', () => {
      const svc = makeService();
      const res = svc.importConfig('5');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('Not a valid config object.');
    });

    it('importConfig of JSON null => { ok:false }', () => {
      const svc = makeService();
      expect(svc.importConfig('null').ok).toBe(false);
    });

    it('normalizeRules drops junk entries and coerces type/action', () => {
      const svc = makeService();
      const cfg = {
        customRules: [
          5, // dropped: not an object
          null, // dropped: null
          'str', // dropped: not an object
          { type: 'Exact', value: '' }, // dropped: empty value
          { type: 'Mystery', value: 'Alpha' }, // type -> Exact, action -> hide
          { type: 'Regex', value: 'Beta', action: 'show' }, // action -> show
          { type: 'Prefix', value: 'Gamma', action: 'weird' }, // action -> hide
          { value: 'Delta' }, // no type -> Exact
          { type: 'Suffix', value: 'Eps', enabled: false }, // disabled preserved
        ],
      };
      expect(svc.importConfig(JSON.stringify(cfg)).ok).toBe(true);

      const rules = svc.customRules();
      expect(rules.length).withContext('4 junk entries dropped').toBe(5);
      expect(rules.every((r) => r.value !== '')).toBe(true);

      const byVal = (v: string) => rules.find((r) => r.value === v)!;
      expect(byVal('Alpha').type).withContext('unknown type -> Exact').toBe('Exact');
      expect(byVal('Alpha').action).withContext('missing action -> hide').toBe('hide');
      expect(byVal('Beta').action).toBe('show');
      expect(byVal('Gamma').action).withContext('unknown action -> hide').toBe('hide');
      expect(byVal('Delta').type).toBe('Exact');
      expect(byVal('Eps').enabled).withContext('enabled:false preserved').toBe(false);
    });

    it('importConfig merges categoryHidden over defaults (partial map)', () => {
      const svc = makeService();
      expect(svc.importConfig(JSON.stringify({ categoryHidden: { rxjs: false } })).ok).toBe(true);
      expect(svc.categoryHidden()['rxjs']).withContext('overridden').toBe(false);
      expect(svc.categoryHidden()['common-directives'])
        .withContext('untouched keys keep their default')
        .toBe(true);
    });

    it('resetToDefaults clears rules / manual / overrides and restores category defaults', () => {
      const svc = makeService();
      svc.addRule({ type: 'Exact', value: 'Foo' });
      svc.toggleManualState('Bar', true);
      svc.overrideTokenType('Qux', 'Service');
      svc.setCategoryHidden('rxjs', false);

      svc.resetToDefaults();

      expect(svc.customRules()).toEqual([]);
      expect(svc.manualHiddenList()).toEqual([]);
      expect(svc.manualShownList()).toEqual([]);
      expect(svc.overridesList()).toEqual([]);
      expect(svc.categoryHidden()['rxjs']).withContext('back to default').toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  describe('isInternal caching + effect-driven cache clear', () => {
    it('returns checkFilterStatus().hidden and memoizes the result', () => {
      const svc = makeService();
      TestBed.tick(); // flush the constructor effect (establishes a clean baseline)

      expect(svc.isInternal('NgIf')).withContext('category-hidden by default').toBe(true);
      expect(svc.isInternal('MyOwnService')).toBe(false);

      const spy = spyOn(svc, 'checkFilterStatus').and.callThrough();
      svc.isInternal('NgIf'); // served from cache
      expect(spy).withContext('memoized — no recompute').not.toHaveBeenCalled();
    });

    it('the constructor effect CLEARS the cache on config change (stale until TestBed.tick)', () => {
      const svc = makeService();
      TestBed.tick(); // baseline

      expect(svc.isInternal('NgIf')).toBe(true); // populate cache

      svc.setCategoryHidden('common-directives', false); // config changed
      expect(svc.isInternal('NgIf'))
        .withContext('cache is stale until the effect flushes')
        .toBe(true);

      TestBed.tick(); // effect runs -> cache.clear()
      expect(svc.isInternal('NgIf'))
        .withContext('after tick the cache reflects the new config')
        .toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  describe('storage persistence (browser)', () => {
    it('loads an existing valid config from localStorage on construction', () => {
      const seed = JSON.stringify({
        version: STORAGE_VERSION,
        appName: 'Seeded App',
        lastUpdated: 12345,
        customRules: [{ id: 'seed-1', type: 'Exact', value: 'Seeded', enabled: true, action: 'hide' }],
        categoryHidden: { rxjs: false },
        manualHidden: ['HiddenTok'],
        manualShown: ['ShownTok'],
        typeOverrides: { OverTok: 'Service' },
      });
      const svc = makeService({ seed });

      expect(svc.customRules().map((r) => r.value)).toEqual(['Seeded']);
      expect(svc.manualHiddenList()).toEqual(['HiddenTok']);
      expect(svc.manualShownList()).toEqual(['ShownTok']);
      expect(svc.getTypeOverride('OverTok')).toBe('Service');
      expect(svc.categoryHidden()['rxjs']).toBe(false);
      expect(svc.categoryHidden()['common-directives'])
        .withContext('unspecified categories keep defaults')
        .toBe(true);
    });

    it('corrupt storage falls back to defaults (and warns, without throwing)', () => {
      const warn = spyOn(console, 'warn');
      let svc!: GenFilterService;
      expect(() => (svc = makeService({ seed: '{ this is not json' }))).not.toThrow();
      expect(svc.customRules()).toEqual([]);
      expect(svc.categoryHidden()['common-directives']).toBe(true);
      expect(warn).toHaveBeenCalled();
    });

    it('saveToStorage (via the effect) persists the current config on tick', () => {
      const svc = makeService();
      svc.addRule({ type: 'Exact', value: 'Persisted', action: 'hide' });
      TestBed.tick(); // effect -> saveToStorage

      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).toBeTruthy();
      const data = JSON.parse(raw!);
      expect(data.version).toBe(STORAGE_VERSION);
      expect(data.customRules.length).toBe(1);
      expect(data.customRules[0].value).toBe('Persisted');
    });
  });

  // ---------------------------------------------------------------------------
  describe('SSR (PLATFORM_ID = "server")', () => {
    it('loadFromStorage ignores disk and resets to defaults', () => {
      const disk = JSON.stringify({
        version: STORAGE_VERSION,
        customRules: [{ id: 'd', type: 'Exact', value: 'FromDisk', enabled: true, action: 'hide' }],
      });
      const svc = makeService({ platform: 'server', seed: disk });
      expect(svc.customRules())
        .withContext('server path does not read localStorage')
        .toEqual([]);
    });

    it('saveToStorage is a no-op on the server (does not throw, leaves disk untouched)', () => {
      const sentinel = JSON.stringify({ version: STORAGE_VERSION, customRules: [] });
      localStorage.setItem(STORAGE_KEY, sentinel);

      const svc = makeService({ platform: 'server' });
      svc.addRule({ type: 'Exact', value: 'Nope' });

      expect(() => TestBed.tick()).not.toThrow();
      expect(localStorage.getItem(STORAGE_KEY))
        .withContext('server save is skipped, sentinel survives')
        .toBe(sentinel);
    });
  });

  // ---------------------------------------------------------------------------
  describe('configChanged token', () => {
    it('is memoized while nothing changes and bumps to a fresh object on any change', () => {
      const svc = makeService();
      const a = svc.configChanged();
      expect(svc.configChanged()).withContext('stable while unchanged').toBe(a);

      svc.addRule({ type: 'Exact', value: 'Foo' });
      expect(svc.configChanged()).withContext('new token after a config change').not.toBe(a);
    });
  });
});
