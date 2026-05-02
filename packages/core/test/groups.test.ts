import { describe, expect, it } from 'vitest';
import { DEFAULT_GROUP_NAME, RuleGroupRegistry } from '../src/groups';

describe('RuleGroupRegistry', () => {
  describe('ensure / defaults', () => {
    it('creates an implicit group default-on the first time it is referenced', () => {
      const r = new RuleGroupRegistry();
      const g = r.ensure('payments');
      expect(g.name).toBe('payments');
      expect(g.enabled).toBe(true);
      expect(g.explicit).toBe(false);
    });

    it('returns the same group object on subsequent ensure() calls', () => {
      const r = new RuleGroupRegistry();
      const a = r.ensure('payments');
      const b = r.ensure('payments');
      expect(a).toBe(b);
    });

    it('explicit ensure() overwrites enabled when supplied', () => {
      const r = new RuleGroupRegistry();
      r.ensure('payments'); // implicit default-on
      r.ensure('payments', { enabled: false, explicit: true });
      expect(r.isActive('payments')).toBe(false);
    });

    it('re-ensure updates enabled when supplied', () => {
      const r = new RuleGroupRegistry();
      r.ensure('payments', { enabled: false, explicit: true });
      r.ensure('payments', { enabled: true });
      expect(r.isActive('payments')).toBe(true);
    });

    it('explicit ensure() upgrades an implicit group to explicit', () => {
      const r = new RuleGroupRegistry();
      r.ensure('payments');
      r.ensure('payments', { explicit: true });
      expect(r.list().find((g) => g.name === 'payments')!.explicit).toBe(true);
    });
  });

  describe('isActive auto-create', () => {
    it('auto-registers an unknown name and returns true (default-on)', () => {
      const r = new RuleGroupRegistry();
      expect(r.isActive('unknown')).toBe(true);
      expect(r.has('unknown')).toBe(true);
    });

    it('isActive(undefined) maps to the default group and is true', () => {
      const r = new RuleGroupRegistry();
      expect(r.isActive(undefined)).toBe(true);
      expect(r.has(DEFAULT_GROUP_NAME)).toBe(true);
    });

    it('typo surfaces in list() because isActive() auto-registers', () => {
      const r = new RuleGroupRegistry();
      r.isActive('paymets'); // typo
      const names = r.list().map((g) => g.name).sort();
      expect(names).toEqual(['paymets']);
    });
  });

  describe('setEnabled + gated dedup', () => {
    it('flips enabled state and clears the gated dedup set', () => {
      const r = new RuleGroupRegistry();
      r.setEnabled('payments', false);
      expect(r.isActive('payments')).toBe(false);
      expect(r.shouldEmitGated('payments')).toBe(true);
      expect(r.shouldEmitGated('payments')).toBe(false);
      // toggle clears dedup
      r.setEnabled('payments', true);
      r.setEnabled('payments', false);
      expect(r.shouldEmitGated('payments')).toBe(true);
    });

    it('shouldEmitGated returns true exactly once between toggles', () => {
      const r = new RuleGroupRegistry();
      r.setEnabled('a', false);
      const flips = [
        r.shouldEmitGated('a'),
        r.shouldEmitGated('a'),
        r.shouldEmitGated('a'),
      ];
      expect(flips).toEqual([true, false, false]);
    });
  });

  describe('remove', () => {
    it("refuses to remove the 'default' group", () => {
      const r = new RuleGroupRegistry();
      r.ensure(DEFAULT_GROUP_NAME);
      expect(r.remove(DEFAULT_GROUP_NAME, new Set())).toBe(false);
      expect(r.has(DEFAULT_GROUP_NAME)).toBe(true);
    });

    it('throws when the group is still referenced by a rule', () => {
      const r = new RuleGroupRegistry();
      r.ensure('payments', { explicit: true });
      expect(() => r.remove('payments', new Set(['payments']))).toThrow(/still referenced/);
    });

    it('removes when not referenced', () => {
      const r = new RuleGroupRegistry();
      r.ensure('payments', { explicit: true });
      expect(r.remove('payments', new Set())).toBe(true);
      expect(r.has('payments')).toBe(false);
    });

    it('force-removes even when referenced and re-creates default-on on next isActive', () => {
      const r = new RuleGroupRegistry();
      r.ensure('payments', { enabled: false, explicit: true });
      r.remove('payments', new Set(['payments']), { force: true });
      expect(r.has('payments')).toBe(false);
      expect(r.isActive('payments')).toBe(true); // auto-create default-on
    });
  });

  describe('getSnapshot / list', () => {
    it('snapshot reports every known group with its current enabled state', () => {
      const r = new RuleGroupRegistry();
      r.ensure('a', { enabled: true, explicit: true });
      r.ensure('b', { enabled: false, explicit: true });
      expect(r.getSnapshot()).toEqual({ a: true, b: false });
    });

    it('list returns RuleGroup objects with explicit flag preserved', () => {
      const r = new RuleGroupRegistry();
      r.ensure('a', { explicit: true });
      r.isActive('b'); // implicit
      const byName = Object.fromEntries(r.list().map((g) => [g.name, g.explicit]));
      expect(byName).toEqual({ a: true, b: false });
    });
  });
});
