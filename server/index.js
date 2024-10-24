const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

// Add this debugging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Update CORS configuration
app.use(cors({
  origin: "http://localhost:3001", // Your React app URL
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3001",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  }
});

// Database connection
const pool = new Pool({
  user: 'sketch_user',
  host: 'localhost',
  database: 'security_sketch',
  password: 'f0audfh8389r3z',
  port: 5432,
  // Add these options for better connection handling
  connectionTimeoutMillis: 5000,
  query_timeout: 10000
});

app.use(express.json());

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Add keep_alive handler
  socket.on('keep_alive', async ({ roomId, userId }) => {
    try {
      await pool.query(
        `UPDATE room_participants 
         SET active = true, 
             joined_at = CURRENT_TIMESTAMP
         WHERE room_id = $1 AND user_id = $2`,
        [roomId, userId]
      );
    } catch (error) {
      console.error('Error updating user activity:', error);
    }
  });

  socket.on('join_room', async ({ roomId, username, secretKey }) => {
    try {
      // First verify the room and secret key
      const roomResult = await pool.query(
        'SELECT * FROM rooms WHERE id = $1 AND secret_key = $2',
        [roomId, secretKey]
      );

      if (roomResult.rows.length === 0) {
        socket.emit('error', { message: 'Invalid room or secret key' });
        return;
      }

      // Get room name from result
      const roomName = roomResult.rows[0].name;

      // Check if this username is already registered in this room
      const existingUserResult = await pool.query(
        `SELECT u.id, u.username 
         FROM users u
         JOIN room_participants rp ON u.id = rp.user_id
         WHERE rp.room_id = $1 AND LOWER(u.username) = LOWER($2)
         LIMIT 1`,
        [roomId, username]
      );

      let userId;
      
      if (existingUserResult.rows.length > 0) {
        // Username exists in this room
        userId = existingUserResult.rows[0].id;
        
        // Update their last joined timestamp
        await pool.query(
          `UPDATE room_participants 
           SET joined_at = CURRENT_TIMESTAMP, 
               active = true
           WHERE room_id = $1 AND user_id = $2`,
          [roomId, userId]
        );
      } else {
        // Create new user with UUID
        userId = uuidv4(); // Make sure to import uuidv4
        const userResult = await pool.query(
          'INSERT INTO users (id, username) VALUES ($1, $2) RETURNING id',
          [userId, username]
        );
        userId = userResult.rows[0].id;
        
        // Add to room participants
        await pool.query(
          `INSERT INTO room_participants (room_id, user_id, joined_at, active) 
           VALUES ($1, $2, CURRENT_TIMESTAMP, true)`,
          [roomId, userId]
        );
      }

      // Join socket room
      socket.join(roomId);
      
      // Get room messages - Add LIMIT and ORDER to ensure messages are unique
      const messagesResult = await pool.query(
        `SELECT DISTINCT ON (m.id)
          m.id,
          m.content,
          m.created_at as timestamp,
          u.username,
          m.room_id as "roomId"
         FROM messages m
         JOIN users u ON m.user_id = u.id
         WHERE m.room_id = $1
         ORDER BY m.id, m.created_at DESC
         LIMIT 100`,
        [roomId]
      );

      // Get active users in room - Modified query to ensure accuracy
      const activeUsersResult = await pool.query(
        `SELECT DISTINCT ON (u.username) u.id, u.username
         FROM room_participants rp
         JOIN users u ON rp.user_id = u.id
         WHERE rp.room_id = $1 AND rp.active = true
         ORDER BY u.username, rp.joined_at DESC`,
        [roomId]
      );

      // Store user info in socket for later use
      socket.userData = { userId, username, roomId };

      // Start keepalive immediately after joining
      await pool.query(
        `UPDATE room_participants 
         SET active = true, 
             joined_at = CURRENT_TIMESTAMP
         WHERE room_id = $1 AND user_id = $2`,
        [roomId, userId]
      );

      // Broadcast to ALL clients in the room (including sender) that user list should be updated
      io.in(roomId).emit('update_active_users', {
        activeUsers: activeUsersResult.rows
      });

      // Emit joined event with room data to the joining user
      socket.emit('room_joined', {
        messages: messagesResult.rows,
        activeUsers: activeUsersResult.rows,
        userId,
        roomName
      });

      // Notify others of new user
      socket.to(roomId).emit('user_joined', {
        id: userId,
        username
      });

      // Modify the ping interval to be more frequent and add error handling
      const pingInterval = setInterval(async () => {
        try {
          const result = await pool.query(
            `UPDATE room_participants 
             SET active = true, 
                 joined_at = CURRENT_TIMESTAMP
             WHERE room_id = $1 AND user_id = $2
             RETURNING active`, // Add RETURNING to verify update
            [roomId, userId]
          );
          
          if (!result.rows.length) {
            console.log('User activity update failed - reconnecting user');
            // Try to reactivate the user
            await pool.query(
              `INSERT INTO room_participants (room_id, user_id, active, joined_at)
               VALUES ($1, $2, true, CURRENT_TIMESTAMP)
               ON CONFLICT (room_id, user_id) 
               DO UPDATE SET active = true, joined_at = CURRENT_TIMESTAMP`,
              [roomId, userId]
            );
          }
        } catch (error) {
          console.error('Error in keep-alive:', error);
        }
      }, 10000); // Reduce to 10 seconds

      // Store the interval in socket for cleanup
      socket.pingInterval = pingInterval;

    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  socket.on('disconnect', async () => {
    try {
      if (socket.pingInterval) {
        clearInterval(socket.pingInterval);
      }

      const userData = socket.userData;
      if (userData) {
        const { roomId, userId, username } = userData;

        // Increase disconnect delay and add more robust checking
        setTimeout(async () => {
          try {
            // Check if user has reconnected
            const activeCheck = await pool.query(
              `SELECT active, 
                      EXTRACT(EPOCH FROM (NOW() - joined_at)) as seconds_since_join
               FROM room_participants 
               WHERE room_id = $1 AND user_id = $2`,
              [roomId, userId]
            );

            // Only mark as inactive if they haven't reconnected and their last join
            // was more than 5 seconds ago
            if (activeCheck.rows[0]?.active && 
                activeCheck.rows[0]?.seconds_since_join > 5) {
              
              await pool.query(
                `UPDATE room_participants 
                 SET active = false 
                 WHERE room_id = $1 AND user_id = $2`,
                [roomId, userId]
              );

              // Get updated active users list
              const activeUsersResult = await pool.query(
                `SELECT DISTINCT ON (u.id) u.id, u.username
                 FROM room_participants rp
                 JOIN users u ON rp.user_id = u.id
                 WHERE rp.room_id = $1 
                 AND rp.active = true
                 AND rp.joined_at > NOW() - INTERVAL '30 seconds'
                 ORDER BY u.id, rp.joined_at DESC`,
                [roomId]
              );

              io.in(roomId).emit('update_active_users', {
                activeUsers: activeUsersResult.rows
              });
            }
          } catch (error) {
            console.error('Error in disconnect timeout:', error);
          }
        }, 10000); // Increase to 10 seconds
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });

  socket.on('send_message', async ({ roomId, username, content, userId }) => {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      // Save message to database
      const result = await pool.query(
        'INSERT INTO messages (room_id, user_id, content) VALUES ($1, $2, $3) RETURNING id, content, created_at as timestamp',
        [roomId, userId, content]
      );

      const messageData = {
        id: result.rows[0].id,
        content,
        username,
        timestamp: result.rows[0].timestamp,
        roomId
      };

      console.log('Broadcasting new message:', messageData);
      
      // Make sure the socket is in the room
      if (!socket.rooms.has(roomId)) {
        socket.join(roomId);
      }
      
      // Broadcast to ALL clients in the room, including sender
      io.in(roomId).emit('new_message', messageData);
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
});

// API Routes
app.post('/api/rooms', async (req, res) => {
  const { name, userId } = req.body;
  
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'Room name is required' });
  }

  const roomId = uuidv4();
  const secretKey = generateSecureKey();

  try {
    // First ensure the user exists with UUID
    const userResult = await pool.query(
      'INSERT INTO users (id, username) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING id',
      [userId, `user_${userId.slice(0, 8)}`]
    );

    // Then create the room with owner_id
    const result = await pool.query(
      'INSERT INTO rooms (id, name, secret_key, owner_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [roomId, name.trim(), secretKey, userId]
    );

    res.json({
      id: result.rows[0].id,
      name: result.rows[0].name,
      secret_key: secretKey,
      created_at: result.rows[0].created_at,
      owner_id: result.rows[0].owner_id
    });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

app.get('/api/rooms/:roomId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, COUNT(rp.user_id) as participant_count 
       FROM rooms r 
       LEFT JOIN room_participants rp ON r.id = rp.room_id 
       WHERE r.id = $1 
       GROUP BY r.id`,
      [req.params.roomId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching room:', error);
    res.status(500).json({ error: 'Failed to fetch room' });
  }
});

app.get('/api/rooms', async (req, res) => {
  try {
    console.log('Fetching rooms...');
    
    const result = await pool.query(`
      SELECT 
        r.id,
        r.name,
        r.created_at,
        r.active,
        COUNT(rp.user_id)::int as participant_count 
      FROM rooms r 
      LEFT JOIN room_participants rp ON r.id = rp.room_id 
      GROUP BY r.id 
      ORDER BY r.created_at DESC
    `);
    
    console.log('Rooms query result:', result.rows);
    
    // Always return an array, even if empty
    res.json(result.rows || []);
    
  } catch (error) {
    console.error('Database error when fetching rooms:', error);
    
    // Check if it's a connection error
    if (error.code === 'ECONNREFUSED') {
      return res.status(500).json({ 
        error: 'Database connection failed',
        details: 'Could not connect to the database'
      });
    }
    
    // For other database errors
    res.status(500).json({ 
      error: 'Failed to fetch rooms',
      details: error.message
    });
  }
});

// Add a test endpoint to verify database connection
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ 
      status: 'unhealthy', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

// Add a new endpoint to get active users
app.get('/api/rooms/:roomId/users', async (req, res) => {
  try {
    const activeUsersResult = await pool.query(
      `SELECT DISTINCT ON (u.username) u.id, u.username
       FROM room_participants rp
       JOIN users u ON rp.user_id = u.id
       WHERE rp.room_id = $1 AND rp.active = true
       ORDER BY u.username, rp.joined_at DESC`,
      [req.params.roomId]
    );
    res.json(activeUsersResult.rows);
  } catch (error) {
    console.error('Error fetching active users:', error);
    res.status(500).json({ error: 'Failed to fetch active users' });
  }
});

// Update room status endpoint
app.put('/api/rooms/:roomId/status', async (req, res) => {
  try {
    const { active, userId } = req.body;  // Add userId to verify ownership
    
    if (typeof active !== 'boolean') {
      return res.status(400).json({ error: 'Active status must be a boolean' });
    }

    // First check if user is room owner
    const ownerCheck = await pool.query(
      'SELECT owner_id FROM rooms WHERE id = $1',
      [req.params.roomId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (ownerCheck.rows[0].owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to modify this room' });
    }

    const result = await pool.query(
      'UPDATE rooms SET active = $1 WHERE id = $2 RETURNING *',
      [active, req.params.roomId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating room status:', error);
    res.status(500).json({ error: 'Failed to update room status' });
  }
});

// Add this endpoint to handle room closure
app.put('/api/rooms/:roomId/status', async (req, res) => {
  try {
    const { userId } = req.body;
    
    // First check if user is room owner
    const ownerCheck = await pool.query(
      'SELECT owner_id FROM rooms WHERE id = $1',
      [req.params.roomId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (ownerCheck.rows[0].owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to modify this room' });
    }

    // If owner, proceed with update
    const result = await pool.query(
      'UPDATE rooms SET active = false WHERE id = $1 RETURNING *',
      [req.params.roomId]
    );

    // Notify all connected clients that the room is closed
    io.to(req.params.roomId).emit('room_closed');

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating room status:', error);
    res.status(500).json({ error: 'Failed to update room status' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await testDatabaseConnection();
});

// Add pool error handler
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

// Test database connection on startup
async function testDatabaseConnection() {
  try {
    const client = await pool.connect();
    console.log('Successfully connected to PostgreSQL');
    await client.release();
  } catch (err) {
    console.error('Failed to connect to PostgreSQL:', err);
    process.exit(1); // Exit if we can't connect to the database
  }
}

// Add this helper function
function generateSecureKey(length = 12) {
  try {
    return crypto.randomBytes(length).toString('hex');
  } catch (error) {
    console.error('Error generating secure key:', error);
    // Fallback to a simpler method if crypto fails
    return Math.random().toString(36).slice(2) + 
           Math.random().toString(36).slice(2);
  }
}

