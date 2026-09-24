/**
 * LexoRank-inspired float positioning for ordered lists.
 * Avoids expensive renumbering by inserting between two floats.
 * When gap < MIN_GAP, a full rebalance is triggered.
 */

const MIN_GAP = 0.001;
const DEFAULT_GAP = 1000;

/**
 * Calculate position for a new item inserted between prev and next.
 * Pass null for prev/next when inserting at start/end.
 */
const calculatePosition = (prevPosition, nextPosition) => {
  if (prevPosition === null && nextPosition === null) return DEFAULT_GAP;
  if (prevPosition === null) return nextPosition - DEFAULT_GAP;
  if (nextPosition === null) return prevPosition + DEFAULT_GAP;
  return (prevPosition + nextPosition) / 2;
};

/**
 * Check if positions need rebalancing (gap too small).
 */
const needsRebalance = (positions) => {
  if (positions.length < 2) return false;
  const sorted = [...positions].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] < MIN_GAP) return true;
  }
  return false;
};

/**
 * Return evenly spaced positions for a full rebalance.
 */
const rebalancePositions = (count) => {
  return Array.from({ length: count }, (_, i) => (i + 1) * DEFAULT_GAP);
};

module.exports = { calculatePosition, needsRebalance, rebalancePositions, DEFAULT_GAP };
