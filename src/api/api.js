import io from 'socket.io-client';
import axios from 'axios';

let socket = null;

// Add these constants at the top of the file
const API_KEY = process.env.REACT_APP_API_KEY;
const API_URL = process.env.REACT_APP_API_URL;
const SOCKET_URL = process.env.REACT_APP_API_URL;
const TIMESKETCH_HOST = process.env.REACT_APP_TIMESKETCH_HOST;

// Add the fetchWithAuth helper function
const fetchWithAuth = async (url, options = {}) => {
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...(options.headers || {})
    }
  });
};

// Initialize socket connection
const initSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      auth: { apiKey: API_KEY },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      timeout: 20000
    });

    socket.on('connect', () => {
      console.log('Socket connected with ID:', socket.id);
      
      // Re-join rooms after reconnection
      const currentRooms = Object.keys(socket.rooms || {});
      currentRooms.forEach(roomId => {
        if (roomId !== socket.id) {  // Skip the default room
          console.log('Rejoining room after connect:', roomId);
          socket.emit('join_socket_room', { roomId });
        }
      });
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    socket.on('reconnecting', (attemptNumber) => {
      console.log(`Socket attempting to reconnect: attempt ${attemptNumber}`);
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log(`Socket reconnected after ${attemptNumber} attempts`);
      
      // Re-join rooms after reconnection
      const currentRooms = Object.keys(socket.rooms || {});
      currentRooms.forEach(roomId => {
        if (roomId !== socket.id) {
          console.log('Rejoining room after reconnect:', roomId);
          socket.emit('join_socket_room', { roomId });
        }
      });
    });
  }
  return socket;
};

const joinRoom = (roomId, username, secretKey, userId = null, isOwner = false, team = null) => {
  console.log('Joining room:', { roomId, username, userId });
  if (!socket) {
    socket = initSocket();
  }
  
  return new Promise((resolve, reject) => {
    // First create/update the user
    fetch(`${API_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify({ 
        id: userId,
        username 
      })
    })
    .then(() => {
      // After user is created, proceed with room join
      socket.emit('join_socket_room', { roomId });
      
      socket.once('error', (error) => {
        console.error('Join room error:', error);
        reject(error);
      });

      socket.once('room_joined', (data) => {
        console.log('Room joined successfully:', data);
        if (data.userId) {
          localStorage.setItem(`userId_${roomId}`, data.userId);
        }
        resolve(data);
      });

      socket.emit('join_room', { 
        roomId, 
        username, 
        secretKey,
        userId,
        isOwner,
        team
      });
    })
    .catch(error => {
      console.error('Failed to create/update user:', error);
      reject(error);
    });
  });
};

const leaveRoom = (roomId, userId) => {
  if (!socket) return;
  socket.emit('leave_room', { roomId, userId });
};

const sendMessage = ({ roomId, username, content, llm_required, messageType }) => {
  return new Promise((resolve, reject) => {
    if (!socket) {
      socket = initSocket();
    }
    const userId = localStorage.getItem(`userId_${roomId}`);
    if (!userId) {
      reject(new Error('User ID not found'));
      return;
    }

    // Make sure we're in the room before sending
    if (!socket.rooms?.has(roomId)) {
      socket.emit('join_socket_room', { roomId });
    }

    // Create message object with consistent property names
    const messageData = {
      roomId,
      username,
      content,
      userId,
      llm_required: !!llm_required,
      messageType: messageType || 'chat'
    };

    // Emit the message
    socket.emit('send_message', messageData);
    
    socket.once('error', (error) => {
      console.error('Send message error:', error);
      reject(error);
    });
  });
};

// Add these socket event handlers
const onRoomJoined = (callback) => {
  if (!socket) return;
  socket.on('room_joined', (data) => {
    console.log('Room joined with data:', data);
    callback(data);
  });
};

const onNewMessage = (callback) => {
  if (!socket) {
    socket = initSocket();
  }
  
  // Remove existing listeners to prevent duplicates
  socket.off('new_message');
  
  // Add new listener with debug logging
  socket.on('new_message', (messageData) => {
    console.log('Socket received new message:', messageData);
    console.log('Current socket rooms:', socket.rooms);
    callback(messageData);
  });
};

const onUserJoined = (callback) => {
  if (!socket) return;
  socket.on('user_joined', callback);
};

const onUserLeft = (callback) => {
  if (!socket) return;
  socket.on('user_left', callback);
};

const onUpdateActiveUsers = (callback) => {
  if (!socket) return;
  socket.on('update_active_users', callback);
};

const onError = (callback) => {
  if (!socket) return;
  socket.on('error', callback);
};

const getActiveUsers = async (roomId) => {
  try {
    const response = await fetchWithAuth(`${API_URL}/api/rooms/${roomId}/users`);
    if (!response.ok) {
      throw new Error('Failed to fetch active users');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching active users:', error);
    return [];
  }
};

// Add cleanup function
const cleanup = () => {
  if (!socket) return;
  if (socket.keepAliveInterval) {
    clearInterval(socket.keepAliveInterval);
  }
  socket.off('room_joined');
  socket.off('new_message');
  socket.off('user_joined');
  socket.off('user_left');
  socket.off('update_active_users');
  socket.off('bot_message');
  socket.off('co_owner_updated');
  socket.off('error');
};

const disconnect = () => {
  if (!socket) return;
  socket.disconnect();
  socket = null;
};

// Create new room
const apiInstance = {
  initSocket,
  joinRoom,
  leaveRoom,
  sendMessage,
  onRoomJoined,
  onNewMessage,
  onUserJoined,
  onUserLeft,
  onUpdateActiveUsers,
  onError,
  getActiveUsers,
  cleanup,
  disconnect,

  createRoom: async (name, userId, username) => {
    const response = await fetchWithAuth(`${API_URL}/api/rooms`, {
      method: 'POST',
      body: JSON.stringify({ name, userId, username }),
    });

    if (!response.ok) {
      throw new Error('Failed to create room');
    }

    const roomData = await response.json();
    
    // Store the sketch_id in localStorage for future use
    if (roomData.sketch_id) {
      localStorage.setItem(`sketchId_${roomData.id}`, roomData.sketch_id);
    }

    return roomData;
  },

  getActiveRooms: async () => {
    const response = await fetchWithAuth(`${API_URL}/api/rooms`);

    if (!response.ok) {
      throw new Error('Failed to fetch active rooms');
    }

    return await response.json();
  },

  // Add getRoomDetails function
  getRoomDetails: async (roomId) => {
    const response = await fetchWithAuth(`${API_URL}/api/rooms/${roomId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch room details');
    }
    
    const roomData = await response.json();
    
    // Add sketch_id from localStorage if not present in response
    if (!roomData.sketch_id) {
      roomData.sketch_id = localStorage.getItem(`sketchId_${roomId}`);
    }
    
    return roomData;
  },

  // Add closeRoom function if not already present
  closeRoom: async (roomId) => {
    const userId = localStorage.getItem('userId');
    const response = await fetchWithAuth(`${API_URL}/api/rooms/${roomId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ active: false, userId }),
    });

    if (!response.ok) {
      throw new Error('Failed to close room');
    }

    // Clean up localStorage
    localStorage.removeItem(`sketchId_${roomId}`);
    
    return response.json();
  },

  // Add new Timesketch functions
  createSketch: async (name) => {
    const response = await fetchWithAuth(`${API_URL}/api/sketch/create`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      throw new Error('Failed to create sketch');
    }

    return response.json();
  },

  importTimeline: async (sketchId, filePath) => {
    const response = await fetchWithAuth(`${API_URL}/api/sketch/import`, {
      method: 'POST',
      body: JSON.stringify({ sketch_id: sketchId, file_path: filePath }),
    });

    if (!response.ok) {
      throw new Error('Failed to import timeline');
    }

    return response.json();
  },

  // Add helper function to get sketch URL
  getSketchUrl: (sketchId) => {
    return `${TIMESKETCH_HOST}/sketch/${sketchId}/explore`;
  },

  // Add recoverSession function
  recoverSession: async (roomId, recoveryKey) => {
    const response = await fetchWithAuth(`${API_URL}/api/rooms/${roomId}/recover`, {
      method: 'POST',
      body: JSON.stringify({ recoveryKey }),
    });

    if (!response.ok) {
      throw new Error('Invalid recovery key');
    }

    return response.json();
  },

  uploadFile: async (formData, onProgress) => {
    const response = await fetch(`${API_URL}/api/files/upload`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY
      },
      body: formData,
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percentCompleted);
      },
    });

    if (!response.ok) {
      throw new Error('Failed to upload file');
    }

    const data = await response.json();
    
    return data;
  },

  getUploadedFiles: async (roomId) => {
    try {
      const response = await fetchWithAuth(`${API_URL}/api/files/${roomId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch uploaded files');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching uploaded files:', error);
      throw error;
    }
  },

  // Update the downloadFile method
  downloadFile: async (fileId, filename) => {
    try {
      const response = await fetch(
        `${API_URL}/api/files/download/${fileId}`,
        {
          headers: {
            'x-api-key': API_KEY
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to download file');
      }

      // Get the filename from Content-Disposition header if available
      const contentDisposition = response.headers.get('Content-Disposition');
      let downloadFilename = filename; // Use provided filename as fallback
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          downloadFilename = filenameMatch[1];
        }
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFilename; // Use extracted or fallback filename
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      return true;
    } catch (error) {
      console.error('Error downloading file:', error);
      throw error;
    }
  },

  deleteFile: async (fileId) => {
    try {
      const response = await fetchWithAuth(
        `${API_URL}/api/files/${fileId}`,
        {
          method: 'DELETE'
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete file');
      }

      return await response.json();
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  },

  // Update the sendMessageToBot method
  sendMessageToBot: async (message, roomId, username) => {
    try {
      console.log('Sending bot message:', { message, roomId, username });
      const response = await fetchWithAuth(`${API_URL}/api/chat/bot`, {
        method: 'POST',
        body: JSON.stringify({ message, roomId, username })
      });

      if (!response.ok) {
        throw new Error('Failed to send message to bot');
      }

      const data = await response.json();
      console.log('Bot response:', data);
      return data;
    } catch (error) {
      console.error('Bot chat error:', error);
      throw error;
    }
  },

  refreshUploadedFiles: async (roomId) => {
    try {
      const response = await fetchWithAuth(`${API_URL}/api/files/${roomId}/refresh`);

      if (!response.ok) {
        throw new Error('Failed to refresh uploaded files');
      }

      return await response.json();
    } catch (error) {
      console.error('Error refreshing uploaded files:', error);
      throw error;
    }
  },

  // Add this with your other API methods
  deleteTeam: async (teamId) => {
    const response = await fetchWithAuth(`${API_URL}/api/teams/${teamId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete team');
    }
    
    return response.json();
  },

  // Add these new methods to the api object
  verifyAdminKey: async (key) => {
    const response = await fetchWithAuth(`${API_URL}/api/admin/verify`, {
      method: 'POST',
      body: JSON.stringify({ key })
    });
    
    if (!response.ok) {
      throw new Error('Invalid admin key');
    }
    
    return response.json();
  },

  getTeams: async () => {
    const response = await fetchWithAuth(`${API_URL}/api/teams`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch teams');
    }
    
    return response.json();
  },

  createTeam: async (teamData) => {
    const response = await fetchWithAuth(`${API_URL}/api/teams`, {
      method: 'POST',
      body: JSON.stringify(teamData)
    });
    
    if (!response.ok) {
      throw new Error('Failed to create team');
    }
    
    return response.json();
  },

  getSystemPrompt: async () => {
    const response = await fetchWithAuth(`${API_URL}/api/system-prompt`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch system prompt');
    }
    
    return response.json();
  },

  updateSystemPrompt: async (prompt) => {
    const response = await fetchWithAuth(`${API_URL}/api/system-prompt`, {
      method: 'PUT',
      body: JSON.stringify({ prompt })
    });
    
    if (!response.ok) {
      throw new Error('Failed to update system prompt');
    }
    
    return response.json();
  },

  // Add new method to get team details
  getTeamDetails: async (teamId) => {
    const response = await fetchWithAuth(`${API_URL}/api/teams/${teamId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch team details');
    }
    
    return response.json();
  },

  async acknowledgeAdminKey() {
    const response = await fetch(`${API_URL}/api/admin/acknowledge-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.REACT_APP_API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to acknowledge admin key');
    }
    
    return response.json();
  },

  // Add these new methods
  addCoOwner: async (roomId, userId) => {
    const response = await fetchWithAuth(`${API_URL}/api/rooms/${roomId}/co-owners`, {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
    
    if (!response.ok) {
      throw new Error('Failed to add co-owner');
    }
    
    return response.json();
  },

  removeCoOwner: async (roomId, userId) => {
    const response = await fetchWithAuth(`${API_URL}/api/rooms/${roomId}/co-owners/${userId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error('Failed to remove co-owner');
    }
    
    return response.json();
  },

  // Add this with the other socket event handlers
  onCoOwnerUpdated: (callback) => {
    if (!socket) {
      socket = initSocket();
    }
    
    // Remove existing listeners to prevent duplicates
    socket.off('co_owner_updated');
    
    // Add new listener with debug logging
    socket.on('co_owner_updated', (data) => {
      console.log('Socket received co_owner_updated:', data);
      callback(data);
    });
  },

  getPrompts: async () => {
    const response = await fetchWithAuth(`${API_URL}/api/prompts`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch prompts');
    }
    
    return response.json();
  },

  updatePrompts: async (prompts) => {
    const response = await fetchWithAuth(`${API_URL}/api/prompts`, {
      method: 'PUT',
      body: JSON.stringify(prompts)
    });
    
    if (!response.ok) {
      throw new Error('Failed to update prompts');
    }
    
    return response.json();
  },

  // Add this new method to your api object
  sendKeepAlive: ({ roomId, userId }) => {
    if (!socket) {
      socket = initSocket();
    }
    
    // Add error handling and retry logic
    const emitKeepAlive = () => {
      if (socket.connected) {
        socket.emit('keep_alive', { roomId, userId });
      } else {
        // If socket isn't connected, retry in 1 second
        setTimeout(emitKeepAlive, 1000);
      }
    };
    
    emitKeepAlive();
  },

  checkAccessStatus: async () => {
    const response = await fetchWithAuth(`${API_URL}/api/access/status`);
    if (!response.ok) {
      throw new Error('Failed to check access status');
    }
    return response.json();
  },

  initializeAccess: async (accessWord) => {
    const response = await fetchWithAuth(`${API_URL}/api/access/initialize`, {
      method: 'POST',
      body: JSON.stringify({ accessWord })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to initialize access');
    }
    return response.json();
  },

  verifyAccess: async (accessWord) => {
    const response = await fetchWithAuth(`${API_URL}/api/access/verify`, {
      method: 'POST',
      body: JSON.stringify({ accessWord })
    });
    if (!response.ok) {
      throw new Error('Failed to verify access');
    }
    return response.json();
  },

  performWhois: async (domain) => {
    const response = await fetchWithAuth(`${API_URL}/api/whois/${domain}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'WHOIS lookup failed');
    }
    
    return response.json();
  },

  performVTLookup: async (indicator) => {
    const response = await fetchWithAuth(`${API_URL}/api/vt/${encodeURIComponent(indicator)}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'VirusTotal lookup failed');
    }
    
    return response.json();
  },

  performIPLookup: async (ip) => {
    const response = await fetchWithAuth(`${API_URL}/api/ipinfo/${encodeURIComponent(ip)}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'IP lookup failed');
    }
    
    return response.json();
  },

  // Add these new methods for AI provider settings
  getAISettings: async () => {
    try {
      const response = await fetchWithAuth(`${API_URL}/api/ai-settings`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch AI settings');
      }
      
      const data = await response.json();
      console.log('Fetched AI settings:', data); // Debug log
      return data;
    } catch (error) {
      console.error('Error in getAISettings:', error);
      throw error;
    }
  },

  updateAISettings: async (settings) => {
    // Ensure we're only sending the relevant provider's keys and settings
    const { provider, modelSettings, providerKeys } = settings;
    
    // Clean up the provider keys to only include the selected provider
    const cleanProviderKeys = {
        [provider]: providerKeys[provider] || {}
    };
    
    // Set appropriate model settings based on provider
    const cleanModelSettings = provider === 'azure' ? 
        {} : // Azure doesn't need model settings
        modelSettings; // Keep Gemini model settings if using Gemini
    
    const response = await fetchWithAuth(`${API_URL}/api/ai-settings`, {
        method: 'PUT',
        body: JSON.stringify({
            provider,
            modelSettings: cleanModelSettings,
            providerKeys: cleanProviderKeys
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update AI settings');
    }
    
    return response.json();
  },

  // Add these new methods
  getIntegrationKeys: async () => {
    const response = await fetchWithAuth(`${API_URL}/api/integration-keys`);
    if (!response.ok) {
      throw new Error('Failed to fetch integration keys');
    }
    return response.json();
  },

  updateIntegrationKeys: async (keys) => {
    const response = await fetchWithAuth(`${API_URL}/api/integration-keys`, {
      method: 'PUT',
      body: JSON.stringify({ keys })
    });
    if (!response.ok) {
      throw new Error('Failed to update integration keys');
    }
    return response.json();
  },

  performBase64Decode: async (encodedString) => {
    const response = await fetchWithAuth(`${API_URL}/api/base64/${encodeURIComponent(encodedString)}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Base64 decoding failed');
    }
    
    return response.json();
  }
};

export { apiInstance as api };
