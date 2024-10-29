const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const server = http.createServer(app);

// Add this debugging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Ensure API_KEY is properly loaded from environment
const API_KEY = process.env.API_KEY;

// Consolidate CORS configuration into a single instance
const corsOptions = {
  origin: "http://localhost:3001",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"]
};

app.use(cors(corsOptions));

// Add middleware to check API key
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
};

// Add validateApiKey middleware to all API routes
app.use('/api', validateApiKey);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3001",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"]
  }
});

// Add authentication middleware for Socket.IO
io.use((socket, next) => {
  const apiKey = socket.handshake.auth.apiKey;
  
  if (!apiKey || apiKey !== API_KEY) {
    return next(new Error('Invalid API key'));
  }
  
  next();
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

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.csv' || ext === '.tsv' || ext === '.txt') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV, TSV, and TXT files are allowed'));
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

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

  socket.on('join_room', async ({ roomId, username, userId, secretKey, isOwner }) => {
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

      const room = roomResult.rows[0];
      
      let recoveryKey;
      
      if (userId) {
        // For recovered sessions or owners
        const participantResult = await pool.query(
          'SELECT recovery_key FROM room_participants WHERE room_id = $1 AND user_id = $2',
          [roomId, userId]
        );
        recoveryKey = participantResult.rows[0]?.recovery_key;
        
        if (!recoveryKey) {
          // Generate new recovery key if none exists
          recoveryKey = crypto.randomBytes(16).toString('hex');
        }
        
        // Update participant with recovery key
        await pool.query(
          `INSERT INTO room_participants (room_id, user_id, joined_at, active, recovery_key)
           VALUES ($1, $2, CURRENT_TIMESTAMP, true, $3)
           ON CONFLICT (room_id, user_id) 
           DO UPDATE SET active = true, joined_at = CURRENT_TIMESTAMP, recovery_key = $3`,
          [roomId, userId, recoveryKey]
        );
        
      } else {
        // For new users
        recoveryKey = crypto.randomBytes(16).toString('hex');
        const newUserId = uuidv4();
        
        // Create new user and participant records
        await pool.query(
          'INSERT INTO users (id, username) VALUES ($1, $2)',
          [newUserId, username]
        );
        
        await pool.query(
          `INSERT INTO room_participants (room_id, user_id, joined_at, active, recovery_key)
           VALUES ($1, $2, CURRENT_TIMESTAMP, true, $3)`,
          [roomId, newUserId, recoveryKey]
        );
        
        userId = newUserId;
      }

      // Get messages and active users
      const messagesResult = await pool.query(
        `SELECT m.*, u.username 
         FROM messages m 
         JOIN users u ON m.user_id = u.id 
         WHERE m.room_id = $1 
         ORDER BY m.created_at ASC`,
        [roomId]
      );

      const activeUsersResult = await pool.query(
        `SELECT u.id, u.username 
         FROM users u 
         JOIN room_participants rp ON u.id = rp.user_id 
         WHERE rp.room_id = $1 AND rp.active = true`,
        [roomId]
      );

      console.log('Emitting room_joined with recovery key:', recoveryKey);

      // Determine if user is room owner
      const isRoomOwner = isOwner || (userId === room.owner_id);
      console.log('User owner status:', { userId, roomOwnerId: room.owner_id, isRoomOwner });

      socket.emit('room_joined', {
        messages: messagesResult.rows,
        activeUsers: activeUsersResult.rows,
        userId: userId,
        username: username,
        roomName: room.name,
        recoveryKey: recoveryKey,
        isOwner: isRoomOwner  // Include owner status in response
      });

      // Notify others
      socket.to(roomId).emit('user_joined', {
        userId: userId,
        username: username
      });
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
  const { name, userId, username } = req.body;
  
  // Add debug logging
  console.log('Creating room with:', { name, userId, username });
  
  // Validate required fields
  if (!name || !userId || !username) {
    console.error('Missing required fields:', { name, userId, username });
    return res.status(400).json({ 
      error: 'Missing required fields',
      details: {
        name: !name,
        userId: !userId,
        username: !username
      }
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    
    // Log user creation attempt
    console.log('Creating/updating user:', { userId, username });

    // Create or update user with provided username
    const userResult = await client.query(
      `INSERT INTO users (id, username) 
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE 
       SET username = EXCLUDED.username
       RETURNING id, username`,
      [userId, username]
    );

    console.log('User created/updated:', userResult.rows[0]);

    // Create room with the user as owner
    const roomId = uuidv4();
    const secretKey = generateSecureKey();
    const roomResult = await client.query(
      `INSERT INTO rooms (id, name, secret_key, owner_id, sketch_id) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [roomId, name, secretKey, userId, null] // Use the same userId
    );

    // Add user as room participant with the same userId
    await client.query(
      `INSERT INTO room_participants (room_id, user_id, joined_at, active) 
       VALUES ($1, $2, CURRENT_TIMESTAMP, true)`,
      [roomId, userId]
    );

    // Create Timesketch sketch after room is created
    console.log('Creating Timesketch sketch...');
    const sketchResponse = await fetch('http://localhost:5001/api/sketch/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    if (!sketchResponse.ok) {
      throw new Error('Failed to create Timesketch sketch');
    }

    const sketchData = await sketchResponse.json();
    console.log('Sketch creation successful:', sketchData);

    // Update room with sketch_id
    await client.query(
      'UPDATE rooms SET sketch_id = $1 WHERE id = $2',
      [sketchData.sketch_id, roomId]
    );

    // Get updated room data
    const updatedRoomResult = await client.query(
      'SELECT * FROM rooms WHERE id = $1',
      [roomId]
    );

    await client.query('COMMIT');

    console.log('Room created successfully:', updatedRoomResult.rows[0]);
    res.json(updatedRoomResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  } finally {
    client.release();
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

// Add these new endpoints for Timesketch integration
app.post('/api/sketch/create', async (req, res) => {
  try {
    const response = await fetch('http://localhost:5001/api/sketch/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Flask API error:', errorText);
      throw new Error(`Flask API returned ${response.status}`);
    }

    const sketchData = await response.json();
    console.log('Sketch created successfully:', sketchData);
    
    res.json(sketchData);
  } catch (error) {
    console.error('Error creating sketch:', error);
    res.status(500).json({ 
      error: 'Failed to create sketch',
      details: error.message 
    });
  }
});

app.post('/api/sketch/import', async (req, res) => {
  try {
    const response = await fetch('http://localhost:5001/api/sketch/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      throw new Error(`Flask API returned ${response.status}`);
    }

    const importData = await response.json();
    res.json(importData);
  } catch (error) {
    console.error('Error importing timeline:', error);
    res.status(500).json({ error: 'Failed to import timeline' });
  }
});

// Add new endpoint for recovery
app.post('/api/rooms/:roomId/recover', async (req, res) => {
  const { recoveryKey } = req.body;
  
  try {
    console.log('Attempting recovery with:', {
      roomId: req.params.roomId,
      recoveryKey
    });

    // First, let's check what recovery keys exist for this room
    const checkKeys = await pool.query(
      `SELECT rp.user_id, rp.recovery_key, r.owner_id
       FROM room_participants rp
       JOIN rooms r ON r.id = rp.room_id
       WHERE rp.room_id = $1`,
      [req.params.roomId]
    );
    
    console.log('Available recovery keys:', checkKeys.rows);

    const result = await pool.query(
      `SELECT 
        CASE 
          WHEN r.owner_id = rp.user_id THEN r.owner_id
          ELSE rp.user_id 
        END as user_id,
        rp.recovery_key,
        u.username,
        r.owner_id,
        r.name as room_name
       FROM room_participants rp
       JOIN users u ON rp.user_id = u.id
       JOIN rooms r ON rp.room_id = r.id
       WHERE rp.room_id = $1 AND rp.recovery_key = $2`,
      [req.params.roomId, recoveryKey]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid recovery key' });
    }

    const userData = result.rows[0];
    
    // Add debug logging
    console.log('Recovery data:', {
      userId: userData.user_id,
      ownerId: userData.owner_id,
      isOwner: userData.user_id === userData.owner_id
    });
    
    res.json({
      userId: userData.user_id,
      username: userData.username,
      isOwner: userData.user_id === userData.owner_id,
      roomName: userData.room_name
    });
  } catch (error) {
    console.error('Error recovering session:', error);
    res.status(500).json({ error: 'Failed to recover session' });
  }
});

// Add new endpoints for file handling
app.post('/api/files/upload', validateApiKey, upload.single('file'), async (req, res) => {
  try {
    const { roomId, sketchId } = req.body;
    const file = req.file;

    // Save file metadata to database
    const result = await pool.query(
      `INSERT INTO uploaded_files (
        room_id, 
        sketch_id,
        filename,
        original_filename,
        file_path,
        file_size,
        file_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        roomId,
        sketchId,
        file.filename,
        file.originalname,
        file.path,
        file.size,
        path.extname(file.originalname).substring(1)
      ]
    );

    res.json({
      fileId: result.rows[0].id,
      filename: file.originalname
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

app.get('/api/files/:roomId', validateApiKey, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, original_filename, file_size, file_type, created_at
       FROM uploaded_files
       WHERE room_id = $1
       ORDER BY created_at DESC`,
      [req.params.roomId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Add endpoint to download file
app.get('/api/files/download/:fileId', validateApiKey, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Get file info from database
    const result = await pool.query(
      `SELECT filename, file_path, original_filename 
       FROM uploaded_files 
       WHERE id = $1`,
      [fileId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];
    res.download(file.file_path, file.original_filename);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
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

