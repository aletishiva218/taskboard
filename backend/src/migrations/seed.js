require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const seed = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clean existing seed data
    await client.query("DELETE FROM users WHERE email IN ('alice@example.com', 'bob@example.com')");

    // Create 2 users
    const hash = await bcrypt.hash('password123', 10);

    const alice = await client.query(
      `INSERT INTO users (name, email, password_hash, email_notifications, notification_preferences)
       VALUES ($1, $2, $3, true, $4) RETURNING id`,
      [
        'Alice Johnson',
        'alice@example.com',
        hash,
        JSON.stringify({ board_invite: true, card_assigned: true, due_date: true, activity: true, role_changed: true }),
      ]
    );

    const bob = await client.query(
      `INSERT INTO users (name, email, password_hash, email_notifications, notification_preferences)
       VALUES ($1, $2, $3, true, $4) RETURNING id`,
      [
        'Bob Smith',
        'bob@example.com',
        hash,
        JSON.stringify({ board_invite: true, card_assigned: true, due_date: true, activity: true, role_changed: true }),
      ]
    );

    const aliceId = alice.rows[0].id;
    const bobId = bob.rows[0].id;

    // Create 1 board
    const board = await client.query(
      `INSERT INTO boards (name, owner_id) VALUES ($1, $2) RETURNING id`,
      ['Product Roadmap', aliceId]
    );
    const boardId = board.rows[0].id;

    // Add both as members
    await client.query(
      `INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'editor')`,
      [boardId, aliceId, bobId]
    );

    // Create 3 lists
    const list1 = await client.query(
      `INSERT INTO lists (board_id, name, position) VALUES ($1, 'Backlog', 1) RETURNING id`,
      [boardId]
    );
    const list2 = await client.query(
      `INSERT INTO lists (board_id, name, position) VALUES ($1, 'In Progress', 2) RETURNING id`,
      [boardId]
    );
    const list3 = await client.query(
      `INSERT INTO lists (board_id, name, position) VALUES ($1, 'Done', 3) RETURNING id`,
      [boardId]
    );

    const list1Id = list1.rows[0].id;
    const list2Id = list2.rows[0].id;
    const list3Id = list3.rows[0].id;

    // Create 5 cards
    const card1 = await client.query(
      `INSERT INTO cards (list_id, board_id, name, description, position)
       VALUES ($1, $2, 'Design system setup', 'Set up Tailwind + component library', 1) RETURNING id`,
      [list1Id, boardId]
    );
    const card2 = await client.query(
      `INSERT INTO cards (list_id, board_id, name, description, position, due_date)
       VALUES ($1, $2, 'Auth API', 'JWT + Google OAuth implementation', 2, NOW() + INTERVAL '2 days') RETURNING id`,
      [list1Id, boardId]
    );
    const card3 = await client.query(
      `INSERT INTO cards (list_id, board_id, name, description, position)
       VALUES ($1, $2, 'Board UI', 'Drag and drop board interface', 1) RETURNING id`,
      [list2Id, boardId]
    );
    const card4 = await client.query(
      `INSERT INTO cards (list_id, board_id, name, description, position)
       VALUES ($1, $2, 'Socket.io integration', 'Real-time collaboration layer', 2) RETURNING id`,
      [list2Id, boardId]
    );
    const card5 = await client.query(
      `INSERT INTO cards (list_id, board_id, name, description, position)
       VALUES ($1, $2, 'Docker setup', 'Containerize all services', 1) RETURNING id`,
      [list3Id, boardId]
    );

    // Assign cards to users
    await client.query(
      `INSERT INTO card_assignees (card_id, user_id) VALUES ($1, $2), ($3, $4)`,
      [card3.rows[0].id, aliceId, card4.rows[0].id, bobId]
    );

    // Add labels
    await client.query(
      `INSERT INTO card_labels (card_id, color, text) VALUES
       ($1, 'blue', 'Frontend'),
       ($2, 'green', 'Backend'),
       ($3, 'purple', 'Feature')`,
      [card3.rows[0].id, card2.rows[0].id, card4.rows[0].id]
    );

    // Add activity log entries
    await client.query(
      `INSERT INTO activity_logs (board_id, user_id, action, metadata) VALUES
       ($1, $2, 'board_created', '{"board_name": "Product Roadmap"}'),
       ($1, $2, 'card_created', '{"card_name": "Docker setup", "list_name": "Done"}')`,
      [boardId, aliceId]
    );

    await client.query('COMMIT');

    console.log('✓ Seed complete');
    console.log('  Users: alice@example.com, bob@example.com (password: password123)');
    console.log(`  Board ID: ${boardId}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

seed();
