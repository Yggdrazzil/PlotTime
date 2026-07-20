import { describe, expect, it } from 'vitest';
import { notificationMediaType } from './notify.js';

describe('notificationMediaType', () => {
  it.each(['show', 'movie', 'game'] as const)('conserve le type routable %s', (type) => {
    expect(notificationMediaType(type)).toBe(type);
  });

  it('ignore un type inconnu', () => {
    expect(notificationMediaType('book')).toBeUndefined();
  });

  it('ignore une valeur absente', () => {
    expect(notificationMediaType(undefined)).toBeUndefined();
    expect(notificationMediaType(null)).toBeUndefined();
  });
});
