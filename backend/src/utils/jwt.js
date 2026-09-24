const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

const generateAccessToken = (userId) => {
  return jwt.sign({ sub: userId, type: 'access' }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
};

const generateRefreshToken = () => {
  // Refresh token is a random 64-byte hex string — not a JWT
  // We store a hash of it in the DB, send the raw token to client
  const token = crypto.randomBytes(64).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return { token, hash, expiresAt };
};

const hashRefreshToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

const generateUnsubscribeToken = (userId) => {
  return jwt.sign({ sub: userId, type: 'unsubscribe' }, process.env.UNSUBSCRIBE_SECRET, {
    expiresIn: '30d',
  });
};

const verifyUnsubscribeToken = (token) => {
  return jwt.verify(token, process.env.UNSUBSCRIBE_SECRET);
};

const generateInvitationToken = ({ boardId, email, role, inviterName, boardName }) => {
  return jwt.sign(
    { boardId, email, role, inviterName, boardName, type: 'board_invite' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const verifyInvitationToken = (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (decoded.type !== 'board_invite') throw new Error('Invalid token type');
  return decoded;
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  verifyAccessToken,
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  generateInvitationToken,
  verifyInvitationToken,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
};
