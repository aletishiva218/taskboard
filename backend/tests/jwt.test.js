process.env.JWT_SECRET = 'test_jwt_secret_at_least_32_chars_long';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_at_least_32_chars_long';
process.env.UNSUBSCRIBE_SECRET = 'test_unsub_secret_at_least_32_chars_long';

const {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  verifyAccessToken,
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
} = require('../src/utils/jwt');

describe('JWT utilities', () => {
  const userId = '123e4567-e89b-12d3-a456-426614174000';

  test('generateAccessToken returns a string', () => {
    const token = generateAccessToken(userId);
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // JWT has 3 parts
  });

  test('verifyAccessToken decodes correct userId', () => {
    const token = generateAccessToken(userId);
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe(userId);
    expect(payload.type).toBe('access');
  });

  test('verifyAccessToken throws on invalid token', () => {
    expect(() => verifyAccessToken('bad.token.here')).toThrow();
  });

  test('generateRefreshToken returns token, hash, expiresAt', () => {
    const { token, hash, expiresAt } = generateRefreshToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBe(128); // 64 bytes hex
    expect(typeof hash).toBe('string');
    expect(expiresAt instanceof Date).toBe(true);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test('hashRefreshToken is deterministic', () => {
    const { token } = generateRefreshToken();
    const hash1 = hashRefreshToken(token);
    const hash2 = hashRefreshToken(token);
    expect(hash1).toBe(hash2);
  });

  test('different refresh tokens produce different hashes', () => {
    const { token: t1 } = generateRefreshToken();
    const { token: t2 } = generateRefreshToken();
    expect(hashRefreshToken(t1)).not.toBe(hashRefreshToken(t2));
  });

  test('generateUnsubscribeToken produces verifiable JWT', () => {
    const token = generateUnsubscribeToken(userId);
    const payload = verifyUnsubscribeToken(token);
    expect(payload.sub).toBe(userId);
    expect(payload.type).toBe('unsubscribe');
  });

  test('verifyUnsubscribeToken throws on wrong secret', () => {
    const token = generateAccessToken(userId); // signed with JWT_SECRET not UNSUBSCRIBE_SECRET
    expect(() => verifyUnsubscribeToken(token)).toThrow();
  });
});
