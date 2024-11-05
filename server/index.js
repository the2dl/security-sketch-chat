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
const { GoogleGenerativeAI } = require('@google/generative-ai');

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

// Add this check
if (!io) {
  console.error('Failed to initialize Socket.IO server');
  process.exit(1);
}

console.log('Socket.IO server initialized successfully');

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

// Initialize Gemini
const genai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genai.getGenerativeModel({ model: 'gemini-1.5-pro-002' });

// Add the bot chat endpoint
app.post('/api/chat/bot', validateApiKey, async (req, res) => {
  const { message, roomId, username } = req.body;

  try {
    const generationConfig = {
      temperature: 0.1,
      topP: 1,
      topK: 1,
      maxOutputTokens: 2048,
    };

    const safetySettings = [
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_NONE",
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
    ];

    const userQuestion = message.replace(/@sketchy/i, '').trim();
    
    // Combine the system prompt and user question into a single context
    const prompt = `You are sketchy, an AI assistant focused exclusively on information security, digital forensics, and IT security topics. 

STRICT RULES:
- Only respond to questions about information security, cybersecurity, digital forensics, incident response, malware analysis, network security, Windows/Linux security events and logs, and related IT security topics
- For any questions outside these domains (like weather, general coding, personal advice, etc.), respond with: "I can only assist with information security and digital forensics related topics. Please ask me about security investigations, threat hunting, incident response, or similar security topics."
- Keep responses focused on security best practices and factual information
- Do not provide detailed exploit code or attack instructions
- When discussing security tools or techniques, emphasize defensive and analytical uses
- If unsure about a topic's security relevance, err on the side of not responding

Current context: You are assisting in a security investigation chat room.

User question: ${userQuestion}`;

    const chat = [
      { role: "user", parts: [{ text: prompt }] }
    ];

    const result = await model.generateContent({
      contents: chat,
      generationConfig,
      safetySettings,
    });

    const response = result.response;
    const timestamp = new Date().toISOString();
    
    // Create both messages with unique IDs
    const userMessage = {
      content: message,
      username: username,
      timestamp: timestamp,
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    const botMessage = {
      content: response.text().trim(),
      username: 'sketchy',
      timestamp: timestamp,
      isBot: true,
      id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    // Emit both messages through socket
    io.in(roomId).emit('new_message', userMessage);
    io.in(roomId).emit('bot_message', botMessage);

    res.json({ success: true });

  } catch (error) {
    console.error('Bot chat error:', error);
    res.status(500).json({ 
      error: 'Failed to generate bot response',
      details: error.message 
    });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New socket connection:', socket.id);
  
  // Send the admin key only if it exists and hasn't been shown
  pool.query('SELECT admin_key, shown FROM platform_settings LIMIT 1')
    .then(result => {
      if (result.rows[0]?.admin_key && !result.rows[0]?.shown) {
        console.log('Sending admin key to new connection');
        socket.emit('initial_admin_key', { adminKey: result.rows[0].admin_key });
      }
    })
    .catch(err => console.error('Error fetching admin key for new socket:', err));

  console.log('User connected:', socket.id);

  // Add new handler for explicit room joining
  socket.on('join_socket_room', ({ roomId }) => {
    console.log(`Socket ${socket.id} joining room ${roomId}`);
    socket.join(roomId);
    
    // Log all sockets in this room
    const room = io.sockets.adapter.rooms.get(roomId);
    console.log(`Current sockets in room ${roomId}:`, Array.from(room || []));
  });

  // Update the keep_alive handler to use last_ping
  socket.on('keep_alive', async ({ roomId, userId }) => {
    try {
      await pool.query(
        `UPDATE room_participants 
         SET active = true, 
             last_ping = CURRENT_TIMESTAMP
         WHERE room_id = $1 AND user_id = $2`,
        [roomId, userId]
      );
    } catch (error) {
      console.error('Error updating user activity:', error);
    }
  });

  socket.on('join_room', async ({ roomId, username, userId, secretKey, isOwner, team }) => {
    try {
      console.log('Join room request with team:', team);
      
      // Get team details if team ID is provided
      let teamDetails = null;
      if (team) {
        const teamResult = await pool.query(
          'SELECT id, name, description FROM teams WHERE id = $1',
          [team]
        );
        if (teamResult.rows[0]) {
          teamDetails = {
            id: teamResult.rows[0].id,
            name: teamResult.rows[0].name,
            description: teamResult.rows[0].description
          };
        }
      }
      
      // Explicitly join the socket room
      socket.join(roomId);
      socket.userData = { roomId, userId, username };
      console.log(`Socket ${socket.id} joined room ${roomId}`);

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
          `INSERT INTO room_participants (room_id, user_id, joined_at, active, recovery_key, team_id)
           VALUES ($1, $2, CURRENT_TIMESTAMP, true, $3, $4)
           ON CONFLICT (room_id, user_id) 
           DO UPDATE SET active = true, joined_at = CURRENT_TIMESTAMP, recovery_key = $3, team_id = $4`,
          [roomId, userId, recoveryKey, team]
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
          `INSERT INTO room_participants (room_id, user_id, joined_at, active, recovery_key, team_id)
           VALUES ($1, $2, CURRENT_TIMESTAMP, true, $3, $4)`,
          [roomId, newUserId, recoveryKey, team]
        );
        
        userId = newUserId;
      }

      // Get messages and active users
      const messagesResult = await pool.query(
        `SELECT m.*, u.username, m.message_type, t.id as team_id, t.name as team_name 
         FROM messages m 
         JOIN users u ON m.user_id = u.id 
         LEFT JOIN room_participants rp ON rp.user_id = u.id AND rp.room_id = m.room_id
         LEFT JOIN teams t ON rp.team_id = t.id
         WHERE m.room_id = $1 
         ORDER BY m.created_at ASC`,
        [roomId]
      );

      const activeUsersResult = await pool.query(
        `SELECT DISTINCT ON (u.id) 
           u.id, 
           u.username,
           t.id as team_id,
           t.name as team_name,
           t.description as team_description
         FROM users u 
         JOIN room_participants rp ON u.id = rp.user_id 
         LEFT JOIN teams t ON rp.team_id = t.id
         WHERE rp.room_id = $1 AND rp.active = true
         ORDER BY u.id, rp.joined_at DESC`,
        [roomId]
      );

      console.log('Emitting room_joined with recovery key:', recoveryKey);

      // Determine if user is room owner or co-owner
      const isRoomOwner = isOwner || 
        (userId === room.owner_id) || 
        (room.co_owners && room.co_owners.includes(userId));
      
      console.log('User owner status:', { 
        userId, 
        roomOwnerId: room.owner_id, 
        isRoomOwner,
        coOwners: room.co_owners 
      });

      // Get team name if team ID is provided
      let teamName = 'sketch';
      if (team) {
        const teamResult = await pool.query(
          'SELECT name FROM teams WHERE id = $1',
          [team]
        );
        if (teamResult.rows[0]) {
          teamName = teamResult.rows[0].name;
        }
      }

      // Create join message with team name
      const joinMessage = {
        content: `${username}@${teamName} joined the investigation`,
        username: 'system',
        timestamp: new Date().toISOString(),
        isSystem: true,
        type: 'user-join',
        id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      };

      // Format messages with team information
      const allMessages = messagesResult.rows.map(msg => ({
        id: msg.id,
        content: msg.content,
        username: msg.username,
        timestamp: msg.created_at,
        messageType: msg.message_type,
        llm_required: msg.llm_required,
        team: msg.team_id ? {
          id: msg.team_id,
          name: msg.team_name
        } : null
      }));

      // Add join message with team information
      allMessages.push({
        content: `${username}@${teamDetails?.name || 'sketch'} joined the investigation`,
        username: 'system',
        timestamp: new Date().toISOString(),
        isSystem: true,
        type: 'user-join',
        id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        team: teamDetails
      });

      // Emit room_joined event with all necessary data INCLUDING the join message
      socket.emit('room_joined', {
        messages: allMessages,
        activeUsers: activeUsersResult.rows.map(user => ({
          id: user.id,
          username: user.username,
          team: user.team_id ? {
            id: user.team_id,
            name: user.team_name,
            description: user.team_description
          } : null
        })),
        userId: userId,
        username: username,
        roomName: room.name,
        recoveryKey: recoveryKey,
        isRoomOwner: isRoomOwner,
        team: teamDetails,
        coOwners: room.co_owners || [],
        room: {
          owner_id: room.owner_id
        }
      });

      // Broadcast user joined to all OTHER clients in the room
      socket.to(roomId).emit('new_message', joinMessage);
      socket.to(roomId).emit('user_joined', {
        userId: userId,
        username: username,
        team: teamDetails
      });

    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // Update the disconnect handler to be more tolerant
  socket.on('disconnect', async () => {
    try {
      if (socket.pingInterval) {
        clearInterval(socket.pingInterval);
      }

      const userData = socket.userData;
      if (userData) {
        const { roomId, userId } = userData;

        // Increase disconnect grace period to 2 minutes
        setTimeout(async () => {
          try {
            // Check if user has reconnected or pinged recently
            const activeCheck = await pool.query(
              `SELECT active, 
                      EXTRACT(EPOCH FROM (NOW() - last_ping)) as seconds_since_ping
               FROM room_participants 
               WHERE room_id = $1 AND user_id = $2`,
              [roomId, userId]
            );

            // Only mark as inactive if they haven't pinged in the last 2 minutes
            if (activeCheck.rows[0]?.active && 
                activeCheck.rows[0]?.seconds_since_ping > 120) {
              
              await pool.query(
                `UPDATE room_participants 
                 SET active = false 
                 WHERE room_id = $1 AND user_id = $2`,
                [roomId, userId]
              );

              // Get updated active users with longer activity window
              const activeUsersResult = await pool.query(
                `SELECT DISTINCT ON (u.id) 
                  u.id, 
                  u.username,
                  t.id as team_id,
                  t.name as team_name,
                  t.description as team_description
                 FROM room_participants rp
                 JOIN users u ON rp.user_id = u.id
                 LEFT JOIN teams t ON rp.team_id = t.id
                 WHERE rp.room_id = $1 
                 AND (rp.active = true OR rp.last_ping > NOW() - INTERVAL '2 minutes')
                 ORDER BY u.id, rp.last_ping DESC`,
                [roomId]
              );

              io.in(roomId).emit('update_active_users', {
                activeUsers: activeUsersResult.rows.map(user => ({
                  ...user,
                  team: user.team_id ? {
                    id: user.team_id,
                    name: user.team_name,
                    description: user.team_description
                  } : null
                }))
              });
            }
          } catch (error) {
            console.error('Error in disconnect timeout:', error);
          }
        }, 120000); // 2 minute grace period
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
  socket.on('send_message', async ({ roomId, username, content, userId, llm_required, messageType }) => {
    try {
      console.log('Received message:', { roomId, username, content, messageType, llm_required });
      
      // Log room membership before broadcasting
      const room = io.sockets.adapter.rooms.get(roomId);
      console.log(`Broadcasting to room ${roomId}. Current members:`, Array.from(room || []));

      // Regular message handling
      const result = await pool.query(
        `INSERT INTO messages (room_id, user_id, content, created_at, llm_required, message_type)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5)
         RETURNING id, created_at`,
        [roomId, userId, content, llm_required, messageType]
      );

      const messageData = {
        id: result.rows[0].id,
        content,
        username,
        timestamp: result.rows[0].created_at,
        messageType,
        llm_required  // Add this explicitly
      };

      // Emit to all sockets in the room
      io.to(roomId).emit('new_message', messageData);
      console.log(`Message broadcast to room ${roomId}:`, messageData);

    } catch (error) {
      console.error('Error handling message:', error);
      socket.emit('error', { message: 'Failed to process message' });
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
      `SELECT DISTINCT ON (u.username) 
        u.id, 
        u.username,
        t.id as team_id,
        t.name as team_name
       FROM room_participants rp
       JOIN users u ON rp.user_id = u.id
       LEFT JOIN teams t ON rp.team_id = t.id
       WHERE rp.room_id = $1 AND rp.active = true
       ORDER BY u.username, rp.joined_at DESC`,
      [req.params.roomId]
    );

    // Format the response to match the socket format
    const formattedUsers = activeUsersResult.rows.map(user => ({
      ...user,
      team: user.team_id ? { id: user.team_id, name: user.team_name } : null
    }));

    res.json(formattedUsers);
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
    const { roomId, sketchId, username, team } = req.body;
    const file = req.file;

    // Save file metadata to database with uploader info
    const result = await pool.query(
      `INSERT INTO uploaded_files (
        room_id, 
        sketch_id,
        filename,
        original_filename,
        file_path,
        file_size,
        file_type,
        uploader_username,
        uploader_team
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        roomId,
        sketchId,
        file.filename,
        file.originalname,
        file.path,
        file.size,
        path.extname(file.originalname).substring(1),
        username,
        team
      ]
    );

    // Emit file upload message to all users in the room
    const uploadMessage = {
      content: `${username}@${team || 'sketch'} uploaded ${file.originalname} - refresh evidence to see it`,
      username: 'system',
      timestamp: new Date().toISOString(),
      isSystem: true,
      type: 'file-upload',
      id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    io.to(roomId).emit('new_message', uploadMessage);

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
      `SELECT id, original_filename, file_size, file_type, created_at,
              uploader_username, uploader_team
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

// Add this new endpoint after your other file-related endpoints
app.delete('/api/files/:fileId', validateApiKey, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // First get the file info
    const fileResult = await client.query(
      'SELECT filename, file_path FROM uploaded_files WHERE id = $1',
      [req.params.fileId]
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = fileResult.rows[0].file_path;

    // Delete the file from the filesystem
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error('Error deleting file from filesystem:', error);
      // Continue with database deletion even if file is missing
    }

    // Delete the database record
    await client.query(
      'DELETE FROM uploaded_files WHERE id = $1',
      [req.params.fileId]
    );

    await client.query('COMMIT');
    
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  } finally {
    client.release();
  }
});

// Add this with the other file-related endpoints
app.get('/api/files/:roomId/refresh', validateApiKey, async (req, res) => {
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
    console.error('Error refreshing files:', error);
    res.status(500).json({ error: 'Failed to refresh files' });
  }
});

// Generate initial admin key if none exists
const initializeAdminKey = async () => {
  try {
    const result = await pool.query('SELECT admin_key FROM platform_settings LIMIT 1');
    if (result.rows.length === 0) {
      const adminKey = crypto.randomBytes(32).toString('hex');
      await pool.query(
        'INSERT INTO platform_settings (admin_key) VALUES ($1)',
        [adminKey]
      );
      console.log('Initial admin key generated:', adminKey);
      
      // Broadcast to all connected sockets
      const sockets = await io.fetchSockets();
      console.log(`Broadcasting admin key to ${sockets.length} connected sockets`);
      io.emit('initial_admin_key', { adminKey });
      
      return adminKey;
    }
    return result.rows[0].admin_key;
  } catch (error) {
    console.error('Error initializing admin key:', error);
    throw error;
  }
};

// Call this when server starts
initializeAdminKey().then(key => {
  console.log('Admin key verified/created');
}).catch(console.error);

// Verify admin key
app.post('/api/admin/verify', async (req, res) => {
  try {
    const { key } = req.body;
    const result = await pool.query(
      'SELECT admin_key FROM platform_settings WHERE admin_key = $1',
      [key]
    );
    res.json({ valid: result.rows.length > 0 });
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify admin key' });
  }
});

// CRUD endpoints for teams
app.get('/api/teams', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM teams ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

app.post('/api/teams', async (req, res) => {
  try {
    const { name, description } = req.body;
    const result = await pool.query(
      'INSERT INTO teams (name, description) VALUES ($1, $2) RETURNING *',
      [name, description]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

app.delete('/api/teams/:id', async (req, res) => {
  try {
    // First check if team is in use
    const usageCheck = await pool.query(
      'SELECT COUNT(*) FROM users WHERE team_id = $1',
      [req.params.id]
    );

    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete team that has associated users' 
      });
    }

    await pool.query(
      'DELETE FROM teams WHERE id = $1',
      [req.params.id]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

// System prompt endpoints
app.get('/api/system-prompt', async (req, res) => {
  try {
    const result = await pool.query('SELECT system_prompt FROM platform_settings LIMIT 1');
    res.json({ prompt: result.rows[0]?.system_prompt || '' });
  } catch (error) {
    console.error('Error fetching system prompt:', error);
    res.status(500).json({ error: 'Failed to fetch system prompt' });
  }
});

app.put('/api/system-prompt', async (req, res) => {
  try {
    const { prompt } = req.body;
    await pool.query(
      'UPDATE platform_settings SET system_prompt = $1, updated_at = CURRENT_TIMESTAMP',
      [prompt]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating system prompt:', error);
    res.status(500).json({ error: 'Failed to update system prompt' });
  }
});

// Add this endpoint before the server.listen() call
app.get('/api/teams/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, 
        (SELECT COUNT(*) FROM room_participants WHERE team_id = t.id) as member_count
       FROM teams t 
       WHERE t.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Get team members
    const membersResult = await pool.query(
      `SELECT DISTINCT u.id, u.username
       FROM users u
       JOIN room_participants rp ON u.id = rp.user_id
       WHERE rp.team_id = $1`,
      [req.params.id]
    );

    const team = {
      ...result.rows[0],
      members: membersResult.rows
    };

    res.json(team);
  } catch (error) {
    console.error('Error fetching team details:', error);
    res.status(500).json({ error: 'Failed to fetch team details' });
  }
});

// Add this new endpoint near your other API routes
app.post('/api/users', async (req, res) => {
  const { id, username } = req.body;
  
  if (!id || !username) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Create or update user
    await pool.query(
      `INSERT INTO users (id, username) 
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE 
       SET username = EXCLUDED.username
       RETURNING id, username`,
      [id, username]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error creating/updating user:', error);
    res.status(500).json({ error: 'Failed to create/update user' });
  }
});

app.post('/api/admin/acknowledge-key', async (req, res) => {
  try {
    await pool.query(
      'UPDATE platform_settings SET shown = true WHERE shown = false'
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating admin key shown status:', error);
    res.status(500).json({ error: 'Failed to update admin key status' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await testDatabaseConnection();
  await setupDatabase();
  
  // Initialize admin key after server is listening
  try {
    const adminKey = await initializeAdminKey();
    console.log('Admin key initialization completed');
  } catch (error) {
    console.error('Failed to initialize admin key:', error);
  }
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

// Add this to your database initialization or as a separate setup script
async function setupDatabase() {
  try {
    const client = await pool.connect();
    
    // Add team_id column if it doesn't exist
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'room_participants' 
          AND column_name = 'team_id'
        ) THEN 
          ALTER TABLE room_participants 
          ADD COLUMN team_id INTEGER REFERENCES teams(id);
        END IF;
      END $$;
    `);

    // Add shown column if it doesn't exist
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'platform_settings' 
          AND column_name = 'shown'
        ) THEN 
          ALTER TABLE platform_settings 
          ADD COLUMN shown BOOLEAN DEFAULT FALSE;
        END IF;
      END $$;
    `);

    // Add prompt columns if they don't exist
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'platform_settings' 
          AND column_name = 'evidence_processor_prompt'
        ) THEN 
          ALTER TABLE platform_settings 
          ADD COLUMN evidence_processor_prompt TEXT;
        END IF;

        IF NOT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'platform_settings' 
          AND column_name = 'sketch_operator_prompt'
        ) THEN 
          ALTER TABLE platform_settings 
          ADD COLUMN sketch_operator_prompt TEXT;
        END IF;
      END $$;
    `);

    console.log('Database schema updated successfully');
    await client.release();
  } catch (err) {
    console.error('Error updating database schema:', err);
    process.exit(1);
  }
}

// Add these new endpoints after your existing room endpoints
app.post('/api/rooms/:roomId/co-owners', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.body;
    
    // Get current co-owners
    const roomResult = await pool.query(
      'SELECT co_owners FROM rooms WHERE id = $1',
      [roomId]
    );

    let coOwners = roomResult.rows[0].co_owners || [];
    
    // Add new co-owner if not already present
    if (!coOwners.includes(userId)) {
      coOwners.push(userId);
    }

    // Update database
    await pool.query(
      'UPDATE rooms SET co_owners = $1 WHERE id = $2',
      [coOwners, roomId]
    );

    // Broadcast to ALL clients in the room using socket.io
    io.to(roomId).emit('co_owner_updated', {
      userId,
      isCoOwner: true,
      coOwners
    });

    res.json({ success: true, coOwners });
  } catch (error) {
    console.error('Error adding co-owner:', error);
    res.status(500).json({ error: 'Failed to add co-owner' });
  }
});

app.delete('/api/rooms/:roomId/co-owners/:userId', async (req, res) => {
  try {
    const { roomId, userId } = req.params;
    
    // Update co-owners in database
    const roomResult = await pool.query(
      'SELECT co_owners FROM rooms WHERE id = $1',
      [roomId]
    );

    let coOwners = roomResult.rows[0].co_owners || [];
    coOwners = coOwners.filter(id => id !== userId);

    await pool.query(
      'UPDATE rooms SET co_owners = $1 WHERE id = $2',
      [coOwners, roomId]
    );

    // Broadcast to ALL clients in the room using socket.io
    io.to(roomId).emit('co_owner_updated', {
      userId,
      isCoOwner: false,
      coOwners
    });

    res.json({ success: true, coOwners });
  } catch (error) {
    console.error('Error removing co-owner:', error);
    res.status(500).json({ error: 'Failed to remove co-owner' });
  }
});

// Get all prompts
app.get('/api/prompts', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT evidence_processor_prompt, sketch_operator_prompt FROM platform_settings LIMIT 1'
    );
    res.json({
      evidence_processor_prompt: result.rows[0]?.evidence_processor_prompt || '',
      sketch_operator_prompt: result.rows[0]?.sketch_operator_prompt || ''
    });
  } catch (error) {
    console.error('Error fetching prompts:', error);
    res.status(500).json({ error: 'Failed to fetch prompts' });
  }
});

// Update prompts
app.put('/api/prompts', async (req, res) => {
  try {
    const { evidence_processor_prompt, sketch_operator_prompt } = req.body;
    await pool.query(
      `UPDATE platform_settings 
       SET evidence_processor_prompt = $1,
           sketch_operator_prompt = $2,
           updated_at = CURRENT_TIMESTAMP`,
      [evidence_processor_prompt, sketch_operator_prompt]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating prompts:', error);
    res.status(500).json({ error: 'Failed to update prompts' });
  }
});

