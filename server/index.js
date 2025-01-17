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
const whois = require('whois-json');
const { OpenAI } = require('openai');

const app = express();
const server = http.createServer(app);

// Add this debugging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Ensure API_KEY is properly loaded from environment
const API_KEY = process.env.API_KEY;

// Update CORS configuration to allow any origin
const corsOptions = {
  origin: true, // This allows any origin
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"]
};

app.use(cors(corsOptions));

// Update Socket.IO CORS configuration as well
const io = new Server(server, {
  cors: {
    origin: true, // This allows any origin
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"]
  }
});

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
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
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
    if (ext === '.csv' || ext === '.tsv' || ext === '.txt' || ext === '.json') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV, TSV, TXT, and JSON files are allowed'));
    }
  },
  limits: {
    fileSize: 500 * 1024 // 500KB limit
  }
});

// Add this helper function to get AI provider configuration
const getAIProvider = async (pool) => {
  try {
    const result = await pool.query(`
      SELECT ai_provider, integration_keys, ai_model_settings, ai_provider_keys
      FROM platform_settings
      LIMIT 1
    `);

    if (!result.rows[0]) {
      throw new Error('No AI provider configuration found');
    }

    const { ai_provider, integration_keys, ai_model_settings, ai_provider_keys } = result.rows[0];

    if (ai_provider === 'azure') {
      const azure = ai_provider_keys?.azure || {};
      const client = new OpenAI({
        apiKey: azure.api_key,
        baseURL: `${azure.endpoint}/openai/deployments/${azure.deployment}`,
        defaultQuery: { 'api-version': azure.api_version },
        defaultHeaders: { 'api-key': azure.api_key }
      });
      return { provider: 'azure', client, settings: ai_model_settings };
    } else {
      // Default to Gemini
      const geminiKey = ai_provider_keys?.gemini;
      if (!geminiKey) {
        throw new Error('Gemini API key not configured');
      }
      const genai = new GoogleGenerativeAI(geminiKey);
      const model = genai.getGenerativeModel({ model: ai_model_settings?.model_name || 'gemini-1.5-pro-002' });
      return { provider: 'gemini', client: model, settings: ai_model_settings };
    }
  } catch (error) {
    console.error('Error getting AI provider:', error);
    throw error;
  }
};

// Update the bot chat endpoint
app.post('/api/chat/bot', validateApiKey, async (req, res) => {
  const { message, roomId, username } = req.body;

  try {
    const { provider, client, settings } = await getAIProvider(pool);

    // Common configuration for both providers
    const generationConfig = {
      temperature: 0.1,
      topP: 1,
      maxOutputTokens: 2048,
    };

    const userQuestion = message.replace(/@sketchy/i, '').trim();
    
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

    let response;
    if (provider === 'azure') {
      response = await client.chat.completions.create({
        model: settings?.model_name || 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: generationConfig.temperature,
        max_tokens: generationConfig.maxOutputTokens,
        top_p: generationConfig.topP
      });
      response = response.choices[0].message.content.trim();
    } else {
      // Gemini-specific configuration
      const safetySettings = [
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_NONE",
        },
      ];

      const chat = [{ role: "user", parts: [{ text: prompt }] }];
      const result = await client.generateContent({
        contents: chat,
        generationConfig,
        safetySettings,
      });
      response = result.response.text().trim();
    }

    const timestamp = new Date().toISOString();
    
    const userMessage = {
      content: message,
      username: username,
      timestamp: timestamp,
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    const botMessage = {
      content: response,
      username: 'sketchy',
      timestamp: timestamp,
      isBot: true,
      id: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

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

// Update the getActiveUsersForRoom function
const getActiveUsersForRoom = async (roomId, pool) => {
  const result = await pool.query(`
    SELECT DISTINCT ON (u.id) 
      u.id, 
      u.username,
      rp.active,
      EXTRACT(EPOCH FROM (NOW() - rp.last_ping)) as seconds_since_ping,
      t.id as team_id,
      t.name as team_name,
      t.description as team_description
    FROM room_participants rp
    JOIN users u ON rp.user_id = u.id
    LEFT JOIN teams t ON rp.team_id = t.id
    WHERE rp.room_id = $1 
    AND (
      rp.active = true 
      OR rp.last_ping > NOW() - INTERVAL '24 hours'
    )
    ORDER BY u.id, rp.last_ping DESC
  `, [roomId]);

  return result.rows.map(user => ({
    ...user,
    status: calculateUserStatus(user.active, user.seconds_since_ping),
    team: user.team_id ? {
      id: user.team_id,
      name: user.team_name,
      description: user.team_description
    } : null
  }));
};

// Add this helper function to standardize status calculation
const calculateUserStatus = (isActive, secondsSincePing, explicitStatus = null) => {
  // First check if user has explicitly set their status
  if (explicitStatus) return explicitStatus;
  
  // Then check time-based status
  if (!isActive) return 'inactive';
  return secondsSincePing > (15 * 60) ? 'away' : 'active';
};

// Add this at the top level to store the initial admin key
let initialAdminKey = null;

// Modify the initializeAdminKey function
const initializeAdminKey = async () => {
  try {
    const result = await pool.query('SELECT admin_key, shown FROM platform_settings LIMIT 1');
    if (result.rows.length === 0 || !result.rows[0].admin_key) {
      const adminKey = crypto.randomBytes(32).toString('hex');
      
      await pool.query(
        `INSERT INTO platform_settings (admin_key) 
         VALUES ($1)
         ON CONFLICT (id) 
         DO UPDATE SET admin_key = $1, shown = false`,
        [adminKey]
      );
      
      console.log('Initial admin key generated:', adminKey);
      initialAdminKey = adminKey;
      
      // Emit to any connected sockets immediately
      io.emit('initial_admin_key', { adminKey });
      
      return adminKey;
    }
    
    // If key exists but hasn't been shown, store it and emit
    if (!result.rows[0].shown) {
      initialAdminKey = result.rows[0].admin_key;
      io.emit('initial_admin_key', { adminKey: result.rows[0].admin_key });
    }
    
    return result.rows[0].admin_key;
  } catch (error) {
    console.error('Error initializing admin key:', error);
    throw error;
  }
};

// Modify the socket connection handler
io.on('connection', (socket) => {
  console.log('New socket connection:', socket.id);
  
  // Check for unshown admin key immediately on connection
  if (initialAdminKey) {
    pool.query('SELECT shown FROM platform_settings WHERE admin_key = $1', [initialAdminKey])
      .then(result => {
        if (result.rows[0] && !result.rows[0].shown) {
          console.log('Sending initial admin key to new connection');
          socket.emit('initial_admin_key', { adminKey: initialAdminKey });
        }
      })
      .catch(err => console.error('Error checking admin key status:', err));
  }
  
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

  // Update the keep_alive handler to be more efficient
  socket.on('keep_alive', async ({ roomId, userId }) => {
    try {
      // Use a single query to update and get status
      const result = await pool.query(`
        WITH updated AS (
          UPDATE room_participants 
          SET last_ping = NOW(), active = true 
          WHERE room_id = $1 AND user_id = $2
          RETURNING user_id
        )
        SELECT u.id, u.username, true as active, 0 as seconds_since_ping,
               t.id as team_id, t.name as team_name, t.description as team_description
        FROM updated
        JOIN users u ON updated.user_id = u.id
        LEFT JOIN teams t ON t.id = (
          SELECT team_id FROM room_participants 
          WHERE room_id = $1 AND user_id = $2
        )
      `, [roomId, userId]);

      if (result.rows[0]) {
        // Emit immediate status update for this user only
        const userData = {
          ...result.rows[0],
          status: 'active',
          team: result.rows[0].team_id ? {
            id: result.rows[0].team_id,
            name: result.rows[0].team_name,
            description: result.rows[0].team_description
          } : null
        };
        
        io.in(roomId).emit('user_status_update', userData);
      }
    } catch (error) {
      console.error('Error in keep_alive:', error);
    }
  });

  socket.on('join_room', async ({ roomId, username, secretKey, userId, isOwner, team }) => {
    try {
      console.log('Join room request with team:', team);
      
      // Explicitly join the socket room
      socket.join(roomId);
      socket.userData = { roomId, userId, username };
      console.log(`Socket ${socket.id} joined room ${roomId}`);

      // Verify room and secret key
      const roomResult = await pool.query(
        'SELECT * FROM rooms WHERE id = $1 AND secret_key = $2',
        [roomId, secretKey]
      );

      if (roomResult.rows.length === 0) {
        socket.emit('error', { message: 'Invalid room or secret key' });
        return;
      }

      const room = roomResult.rows[0];

      // Immediately set user as active when joining
      await pool.query(`
        INSERT INTO room_participants (room_id, user_id, active, last_ping, team_id)
        VALUES ($1, $2, true, NOW(), $3)
        ON CONFLICT (room_id, user_id) 
        DO UPDATE SET active = true, last_ping = NOW(), team_id = $3
      `, [roomId, userId, team]);

      // Get active users
      const activeUsers = await getActiveUsersForRoom(roomId, pool);

      // Fetch recent messages
      const messagesResult = await pool.query(`
        SELECT m.*, u.username
        FROM messages m
        LEFT JOIN users u ON m.user_id = u.id
        WHERE m.room_id = $1
        ORDER BY m.created_at ASC
        LIMIT 100
      `, [roomId]);

      const messages = messagesResult.rows.map(msg => ({
        id: msg.id,
        content: msg.content,
        username: msg.username,
        timestamp: msg.created_at,
        messageType: msg.message_type,
        llm_required: msg.llm_required
      }));

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

      // Get team name if team ID is provided
      let teamName = '';
      if (team) {
        const teamResult = await pool.query(
          'SELECT name FROM teams WHERE id = $1',
          [team]
        );
        teamName = teamResult.rows[0]?.name || '';
      }

      // Create join message with team name
      const joinMessage = {
        content: `${username}${teamName ? `@${teamName}` : ''} joined the investigation`,
        username: 'system',
        timestamp: new Date().toISOString(),
        isSystem: true,
        type: 'user-join',
        id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      };

      // Add join message to messages array
      const allMessages = [...messagesResult.rows, joinMessage];

      // Emit room_joined event with all necessary data INCLUDING the join message
      socket.emit('room_joined', {
        messages: allMessages,  // Note: this includes the join message
        activeUsers: activeUsers,
        userId: userId,
        username: username,
        roomName: room.name,
        isRoomOwner: isOwner,
        coOwners: room.co_owners || [],
        room: {
          owner_id: room.owner_id
        },
        recoveryKey: recoveryKey
      });

      // Broadcast user joined to all OTHER clients in the room
      socket.to(roomId).emit('new_message', joinMessage);
      socket.to(roomId).emit('user_joined', {
        userId: userId,
        username: username
      });

    } catch (error) {
      console.error('Error in join_room:', error);
      socket.emit('error', 'Failed to join room');
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

        // Increase disconnect grace period to 15 minutes
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

            // Only mark as inactive if they haven't pinged in the last 15 minutes
            if (activeCheck.rows[0]?.active && 
                activeCheck.rows[0]?.seconds_since_ping > (15 * 60)) {  // 15 minutes in seconds
              
              await pool.query(
                `UPDATE room_participants 
                 SET active = false 
                 WHERE room_id = $1 AND user_id = $2`,
                [roomId, userId]
              );

              // Get updated active users
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
                 AND (rp.active = true OR rp.last_ping > NOW() - INTERVAL '15 minutes')
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
        }, 15 * 60 * 1000); // 15 minute grace period
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

  // Add handler for the new user_status_update event
  socket.on('user_status_update', (userData) => {
    // Update the specific user's status in activeUsers
    setActiveUsers(prevUsers => {
      return prevUsers.map(user => 
        user.id === userData.id ? { ...user, ...userData } : user
      );
    });
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
    const TIMESKETCH_API_URL = process.env.TIMESKETCH_API_URL || 'http://timesketch-api:5001';
    const sketchResponse = await fetch(`${TIMESKETCH_API_URL}/api/sketch/create`, {
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

// Update the users endpoint
app.get('/api/rooms/:roomId/users', async (req, res) => {
  try {
    const users = await getActiveUsersForRoom(req.params.roomId, pool);
    res.json(users);
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
app.post('/api/rooms/:roomId/recover', validateApiKey, async (req, res) => {
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
      `SELECT filename, file_path, original_filename, file_type 
       FROM uploaded_files 
       WHERE id = $1`,
      [fileId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];
    
    // Set proper content type header based on file type
    const contentType = file.file_type === 'csv' ? 'text/csv' :
                       file.file_type === 'tsv' ? 'text/tab-separated-values' :
                       file.file_type === 'json' ? 'application/json' :
                       'text/plain';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.original_filename}"`);
    
    // Send the file
    res.sendFile(file.file_path, { root: '/' }, (err) => {
      if (err) {
        console.error('Error sending file:', err);
        res.status(500).json({ error: 'Failed to download file' });
      }
    });
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
  
  // Run all initialization tasks
  try {
    await testDatabaseConnection();
    await setupDatabase();
    await initializeAdminKey();
    console.log('Server initialization completed successfully');
  } catch (error) {
    console.error('Server initialization failed:', error);
    process.exit(1);
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

// Update the checkInactiveUsers function to only handle active/inactive states
const checkInactiveUsers = async () => {
  try {
    const result = await pool.query(`
      WITH updated AS (
        UPDATE room_participants 
        SET active = false 
        WHERE active = true 
        AND last_ping < NOW() - INTERVAL '15 minutes'
        RETURNING room_id, user_id
      )
      SELECT DISTINCT u.id, u.username, rp.room_id, rp.active,
             EXTRACT(EPOCH FROM (NOW() - rp.last_ping)) as seconds_since_ping,
             t.id as team_id, t.name as team_name,
             t.description as team_description
      FROM room_participants rp
      JOIN users u ON rp.user_id = u.id
      LEFT JOIN teams t ON rp.team_id = t.id
      WHERE rp.room_id IN (SELECT DISTINCT room_id FROM updated)
    `);

    // Simplify status to just active/inactive
    const roomGroups = result.rows.reduce((acc, row) => {
      if (!acc[row.room_id]) acc[row.room_id] = [];
      acc[row.room_id].push({
        ...row,
        status: row.active ? 'active' : 'inactive',
        team: row.team_id ? {
          id: row.team_id,
          name: row.team_name,
          description: row.team_description
        } : null
      });
      return acc;
    }, {});

    Object.entries(roomGroups).forEach(([roomId, users]) => {
      io.to(roomId).emit('update_active_users', { activeUsers: users });
    });
  } catch (error) {
    console.error('Error checking inactive users:', error);
  }
};

// Remove the status update endpoint
// Remove this endpoint:
// app.put('/api/rooms/:roomId/users/:userId/status', validateApiKey, async (req, res) => { ... });

// Increase the interval to reduce unnecessary checks
setInterval(checkInactiveUsers, 30000); // Every 30 seconds

// Add these new endpoints near your other API routes
app.post('/api/access/initialize', validateApiKey, async (req, res) => {
  try {
    const { accessWord } = req.body;
    
    // Check if access word already exists
    const result = await pool.query('SELECT access_word FROM platform_settings LIMIT 1');
    if (result.rows[0]?.access_word) {
      return res.status(400).json({ error: 'Access word already set' });
    }

    // Set the access word
    await pool.query(
      `UPDATE platform_settings 
       SET access_word = $1, 
           access_word_set_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [accessWord]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error setting access word:', error);
    res.status(500).json({ error: 'Failed to set access word' });
  }
});

app.post('/api/access/verify', validateApiKey, async (req, res) => {
  try {
    const { accessWord } = req.body;
    
    const result = await pool.query('SELECT access_word FROM platform_settings LIMIT 1');
    if (!result.rows[0]?.access_word) {
      return res.status(404).json({ error: 'Access word not set' });
    }

    const isValid = result.rows[0].access_word === accessWord;
    res.json({ valid: isValid });
  } catch (error) {
    console.error('Error verifying access word:', error);
    res.status(500).json({ error: 'Failed to verify access word' });
  }
});

app.get('/api/access/status', validateApiKey, async (req, res) => {
  try {
    const result = await pool.query('SELECT access_word IS NOT NULL as is_initialized FROM platform_settings LIMIT 1');
    res.json({ initialized: result.rows[0]?.is_initialized || false });
  } catch (error) {
    console.error('Error checking access status:', error);
    res.status(500).json({ error: 'Failed to check access status' });
  }
});

// Add this new endpoint with your other API routes
app.get('/api/whois/:domain', validateApiKey, async (req, res) => {
  try {
    const { domain } = req.params;
    
    // Basic domain validation
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return res.status(400).json({ error: 'Invalid domain format' });
    }

    const whoisData = await whois(domain);
    
    // Log the full WHOIS data
    console.log('Full WHOIS data from server:', JSON.stringify(whoisData, null, 2));

    if (!whoisData) {
      return res.status(404).json({ error: 'No WHOIS data found for domain' });
    }

    // Extract relevant security fields
    const relevantData = {
      domainName: whoisData.domainName || domain,
      registrar: whoisData.registrar,
      nameServers: whoisData.nameServers || whoisData.nameServer || [], // Handle different property names
      creationDate: whoisData.creationDate,
      updatedDate: whoisData.updatedDate,
      registryExpiryDate: whoisData.registryExpiryDate,
      dnssec: whoisData.dnssec,
      registrantOrganization: whoisData.registrantOrganization,
      registrantCountry: whoisData.registrantCountry,
      adminEmail: whoisData.adminEmail,
      techEmail: whoisData.techEmail,
      registryDomainId: whoisData.registryDomainId
    };

    // Ensure nameServers is always an array
    if (typeof relevantData.nameServers === 'string') {
      relevantData.nameServers = [relevantData.nameServers];
    }

    res.json(relevantData);
  } catch (error) {
    console.error('WHOIS lookup error:', error);
    res.status(500).json({ error: 'Failed to perform WHOIS lookup', details: error.message });
  }
});

// Update the VT endpoint
app.get('/api/vt/:indicator', validateApiKey, async (req, res) => {
  try {
    const { indicator } = req.params;
    
    // Get VT key from database instead of env
    const settingsResult = await pool.query('SELECT integration_keys FROM platform_settings WHERE id = 1');
    const vtApiKey = settingsResult.rows[0]?.integration_keys?.virustotal;
    
    if (!vtApiKey) {
      return res.status(500).json({ error: 'VirusTotal API key not configured' });
    }

    // Determine indicator type and use appropriate endpoint
    let apiUrl;
    if (/^[a-f0-9]{32}$/i.test(indicator)) {
      // MD5 hash
      apiUrl = `https://www.virustotal.com/api/v3/files/${indicator}`;
    } else if (/^[a-f0-9]{64}$/i.test(indicator)) {
      // SHA256 hash
      apiUrl = `https://www.virustotal.com/api/v3/files/${indicator}`;
    } else if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(indicator)) {
      // IP address
      apiUrl = `https://www.virustotal.com/api/v3/ip_addresses/${indicator}`;
    } else {
      // Domain
      apiUrl = `https://www.virustotal.com/api/v3/domains/${indicator}`;
    }

    // Make the API request
    const mainResponse = await fetch(apiUrl, {
      headers: {
        'x-apikey': vtApiKey
      }
    });

    if (!mainResponse.ok) {
      throw new Error(`VirusTotal API error: ${mainResponse.statusText}`);
    }

    const mainData = await mainResponse.json();
    
    // Only fetch resolutions for domains
    if (!indicator.match(/^(?:\d{1,3}\.){3}\d{1,3}$/) && !indicator.match(/^[a-f0-9]{32,64}$/i)) {
      const resolutionsResponse = await fetch(`https://www.virustotal.com/api/v3/domains/${indicator}/resolutions`, {
        headers: {
          'x-apikey': vtApiKey
        }
      });

      if (resolutionsResponse.ok) {
        const resolutionsData = await resolutionsResponse.json();
        mainData.data.attributes.resolutions = resolutionsData.data;
      }
    }

    res.json(mainData.data.attributes);
  } catch (error) {
    console.error('VirusTotal lookup error:', error);
    res.status(500).json({ error: 'Failed to perform VirusTotal lookup', details: error.message });
  }
});

// Update the IPInfo endpoint
app.get('/api/ipinfo/:ip', validateApiKey, async (req, res) => {
  try {
    const { ip } = req.params;
    
    // Get IPInfo token from database instead of env
    const settingsResult = await pool.query('SELECT integration_keys FROM platform_settings WHERE id = 1');
    const ipinfoToken = settingsResult.rows[0]?.integration_keys?.ipinfo;
    
    if (!ipinfoToken) {
      return res.status(500).json({ error: 'IPInfo token not configured' });
    }

    const response = await fetch(`https://ipinfo.io/${ip}/json`, {
      headers: {
        'Authorization': `Bearer ${ipinfoToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`IPInfo API error: ${response.statusText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('IP lookup error:', error);
    res.status(500).json({ error: 'Failed to perform IP lookup', details: error.message });
  }
});

// Add new endpoints for integration keys
app.get('/api/integration-keys', validateApiKey, async (req, res) => {
  try {
    const result = await pool.query('SELECT integration_keys FROM platform_settings WHERE id = 1');
    res.json(result.rows[0]?.integration_keys || {});
  } catch (error) {
    console.error('Error fetching integration keys:', error);
    res.status(500).json({ error: 'Failed to fetch integration keys' });
  }
});

app.put('/api/integration-keys', validateApiKey, async (req, res) => {
  try {
    const { keys } = req.body;
    await pool.query('UPDATE platform_settings SET integration_keys = $1 WHERE id = 1', [keys]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating integration keys:', error);
    res.status(500).json({ error: 'Failed to update integration keys' });
  }
});

// Add AI settings endpoints
app.get('/api/ai-settings', validateApiKey, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        ai_provider,
        ai_model_settings,
        ai_provider_keys
      FROM platform_settings 
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      // Return default values if no settings exist
      return res.json({
        ai_provider: 'gemini',
        ai_model_settings: {},
        ai_provider_keys: {
          gemini: '',
          azure: {
            api_key: '',
            endpoint: '',
            deployment: '',
            api_version: ''
          }
        }
      });
    }
    
    // Ensure we're returning the raw database values
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching AI settings:', error);
    res.status(500).json({ error: 'Failed to fetch AI settings' });
  } finally {
    client.release();
  }
});

app.put('/api/ai-settings', validateApiKey, async (req, res) => {
  const client = await pool.connect();
  try {
    const { provider, modelSettings, providerKeys } = req.body;
    
    await client.query('BEGIN');
    
    // Get current settings
    const currentSettings = await client.query(`
      SELECT ai_provider, ai_provider_keys
      FROM platform_settings
      WHERE id = 1
    `);
    
    // Prepare new provider keys object
    let newProviderKeys = {
      [provider]: providerKeys[provider] || {}
    };
    
    // Set appropriate model settings based on provider
    const newModelSettings = provider === 'azure' ? 
      {} : // Azure doesn't need model settings
      modelSettings; // Keep Gemini model settings if using Gemini
    
    // Update the settings with clean provider keys and appropriate model settings
    await client.query(`
      UPDATE platform_settings 
      SET 
        ai_provider = $1,
        ai_model_settings = $2,
        ai_provider_keys = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `, [provider, newModelSettings, newProviderKeys]);
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true,
      message: `Successfully switched to ${provider} provider`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating AI settings:', error);
    res.status(500).json({ error: 'Failed to update AI settings' });
  } finally {
    client.release();
  }
});

app.get('/api/base64/:encodedString', validateApiKey, async (req, res) => {
  try {
    const { encodedString } = req.params;
    
    // Decode base64 string
    const decodedString = Buffer.from(encodedString, 'base64').toString('utf-8');
    
    res.json({ 
      decoded: decodedString,
      original: encodedString 
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to decode base64 string',
      details: error.message 
    });
  }
});

