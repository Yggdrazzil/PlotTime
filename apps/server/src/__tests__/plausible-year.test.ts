import { describe, expect, it } from 'vitest';
import { plausibleYear } from '../modules/media/serialize.js';

describe('plausibleYear', () => {
  it('garde une année plausible', () => {
    expect(plausibleYear(2014)).toBe(2014);
    expect(plausibleYear(1888)).toBe(1888);
  });

  it('rejette les années aberrantes (bug « Film · 1 »)', () => {
    expect(plausibleYear(1)).toBe(null);
    expect(plausibleYear(0)).toBe(null);
    expect(plausibleYear(-5)).toBe(null);
    expect(plausibleYear(999)).toBe(null);
    expect(plausibleYear(9999)).toBe(null);
  });

  it('récupère l’année depuis la vraie date quand l’année stockée est aberrante', () => {
    expect(plausibleYear(1, new Date('2014-06-25'))).toBe(2014);
    expect(plausibleYear(null, null, new Date('2009-06-19'))).toBe(2009);
  });

  it('renvoie null quand rien n’est exploitable', () => {
    expect(plausibleYear(null)).toBe(null);
    expect(plausibleYear(undefined)).toBe(null);
    expect(plausibleYear(1, null, undefined)).toBe(null);
  });

  it('laisse passer les sorties futures annoncées (année ≤ now + 10)', () => {
    const soon = new Date().getFullYear() + 3;
    expect(plausibleYear(soon)).toBe(soon);
  });
});
