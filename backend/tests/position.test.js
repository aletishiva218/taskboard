const {
  calculatePosition,
  needsRebalance,
  rebalancePositions,
  DEFAULT_GAP,
} = require('../src/utils/position');

describe('Position utilities', () => {
  test('calculatePosition returns DEFAULT_GAP when no neighbors', () => {
    expect(calculatePosition(null, null)).toBe(DEFAULT_GAP);
  });

  test('calculatePosition inserts before first item', () => {
    const pos = calculatePosition(null, 1000);
    expect(pos).toBe(0); // 1000 - 1000
  });

  test('calculatePosition inserts after last item', () => {
    const pos = calculatePosition(1000, null);
    expect(pos).toBe(2000); // 1000 + 1000
  });

  test('calculatePosition returns midpoint between two items', () => {
    const pos = calculatePosition(1000, 3000);
    expect(pos).toBe(2000);
  });

  test('calculatePosition returns fractional midpoint', () => {
    const pos = calculatePosition(1000, 1001);
    expect(pos).toBe(1000.5);
  });

  test('needsRebalance returns false for empty array', () => {
    expect(needsRebalance([])).toBe(false);
  });

  test('needsRebalance returns false for single item', () => {
    expect(needsRebalance([1000])).toBe(false);
  });

  test('needsRebalance returns false when gaps are large', () => {
    expect(needsRebalance([1000, 2000, 3000])).toBe(false);
  });

  test('needsRebalance returns true when gap is too small', () => {
    expect(needsRebalance([1000, 1000.0001, 2000])).toBe(true);
  });

  test('rebalancePositions returns evenly spaced array', () => {
    const positions = rebalancePositions(3);
    expect(positions).toEqual([1000, 2000, 3000]);
  });

  test('rebalancePositions handles single item', () => {
    const positions = rebalancePositions(1);
    expect(positions).toEqual([1000]);
  });
});
