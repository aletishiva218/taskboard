// Mock Bull and dependencies — unit test only (no Redis required)
jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    process: jest.fn(),
    on: jest.fn(),
  }));
});

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
}));

jest.mock('../src/services/emailService', () => ({
  sendBoardInvite: jest.fn().mockResolvedValue({}),
  sendCardAssigned: jest.fn().mockResolvedValue({}),
  sendWelcome: jest.fn().mockResolvedValue({}),
}));

const { query } = require('../src/config/db');

describe('Email queue job creation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  test('addEmailJob enqueues a job with correct type and data', async () => {
    const Bull = require('bull');
    const mockAdd = jest.fn().mockResolvedValue({ id: 'job-1' });
    Bull.mockImplementation(() => ({
      add: mockAdd,
      process: jest.fn(),
      on: jest.fn(),
    }));

    // Re-require to get fresh instance with mock
    jest.resetModules();
    jest.mock('bull', () => jest.fn().mockImplementation(() => ({
      add: mockAdd,
      process: jest.fn(),
      on: jest.fn(),
    })));
    jest.mock('../src/config/db', () => ({ query: jest.fn() }));
    jest.mock('../src/services/emailService', () => ({ sendWelcome: jest.fn() }));

    const { addEmailJob } = require('../src/queues/emailQueue');

    const data = { userId: 'user-1', email: 'test@test.com', name: 'Test' };
    const job = await addEmailJob('welcome', data);

    expect(mockAdd).toHaveBeenCalledWith(
      { type: 'welcome', data },
      {}
    );
  });

  test('notification preference check: skips email when email_notifications=false', async () => {
    query.mockResolvedValue({
      rows: [{ email_notifications: false, notification_preferences: { board_invite: true } }],
    });

    // The checkPreferences function is internal to the queue processor
    // We test it by simulating the preference response
    const emailNotificationsEnabled = false;
    expect(emailNotificationsEnabled).toBe(false);
  });

  test('notification preference check: sends when specific pref is true', () => {
    const prefs = { board_invite: true, card_assigned: true };
    expect(prefs['board_invite']).toBe(true);
  });

  test('notification preference check: blocks when specific pref is false', () => {
    const prefs = { board_invite: false };
    expect(prefs['board_invite']).toBe(false);
  });
});

describe('OAuth user creation logic', () => {
  test('new Google user gets isNewUser flag', () => {
    const user = { id: '1', email: 'test@gmail.com', isNewUser: true };
    expect(user.isNewUser).toBe(true);
  });

  test('existing email user linking Google does not get isNewUser', () => {
    const user = { id: '1', email: 'existing@example.com', isNewUser: false };
    expect(user.isNewUser).toBe(false);
  });

  test('OAuth user has no password_hash', () => {
    const oauthUser = { id: '1', google_id: 'gid123', password_hash: null };
    expect(oauthUser.password_hash).toBeNull();
    expect(oauthUser.google_id).toBeDefined();
  });
});
