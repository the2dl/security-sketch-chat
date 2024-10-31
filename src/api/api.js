import io from 'socket.io-client';
import axios from 'axios';

let socket = null;

// Add this near the top of the file, after the imports
const API_KEY = process.env.REACT_APP_API_KEY;

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
    socket = io('http://localhost:3000', {
      withCredentials: true,
      auth: { apiKey: API_KEY },
      transports: ['websocket']
    });

    // Add debug logging for socket events
    socket.on('connect', () => {
      console.log('Socket connected');
    });

    socket.on('bot_message', (message) => {
      console.log('Socket received bot message:', message);
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }
  return socket;
};

const joinRoom = (roomId, username, secretKey, userId = null, isOwner = false) => {
  console.log('Joining room:', { roomId, username });
  if (!socket) {
    socket = initSocket();
  }
  
  return new Promise((resolve, reject) => {
    socket.once('error', (error) => {
      console.error('Join room error:', error);
      reject(error);
    });

    socket.once('room_joined', (data) => {
      console.log('Room joined successfully:', data);
      if (data.userId) {
        localStorage.setItem(`userId_${roomId}`, data.userId);
      }
      if (data.recoveryKey) {
        localStorage.setItem(`recoveryKey_${roomId}`, data.recoveryKey);
      }
      resolve(data);
    });

    socket.emit('join_room', { 
      roomId, 
      username, 
      secretKey,
      userId,
      isOwner
    });
  });
};

const leaveRoom = (roomId, userId) => {
  if (!socket) return;
  socket.emit('leave_room', { roomId, userId });
};

const sendMessage = ({ roomId, username, content }) => {
  return new Promise((resolve, reject) => {
    if (!socket) {
      socket = initSocket();
    }
    const userId = localStorage.getItem(`userId_${roomId}`);
    if (!userId) {
      reject(new Error('User ID not found'));
      return;
    }

    socket.emit('send_message', { roomId, username, content, userId });
    
    // Add error handler
    socket.once('error', (error) => {
      console.error('Send message error:', error);
      reject(error);
    });
  });
};

// Add these socket event handlers
const onRoomJoined = (callback) => {
  if (!socket) return;
  socket.on('room_joined', callback);
};

const onNewMessage = (callback) => {
  if (!socket) {
    socket = initSocket();
  }
  socket.off('new_message'); // Remove any existing listeners
  socket.on('new_message', (messageData) => {
    console.log('New message received:', messageData);
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
    const response = await fetchWithAuth(`${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/api/rooms/${roomId}/users`);
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
  socket.off('room_joined');
  socket.off('new_message');
  socket.off('user_joined');
  socket.off('user_left');
  socket.off('update_active_users');
  socket.off('bot_message');
  socket.off('error');
};

const disconnect = () => {
  if (!socket) return;
  socket.disconnect();
  socket = null;
};

// Create new room
export const api = {
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
    const response = await fetchWithAuth('http://localhost:3000/api/rooms', {
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
    const response = await fetchWithAuth(`${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/api/rooms`);

    if (!response.ok) {
      throw new Error('Failed to fetch active rooms');
    }

    return await response.json();
  },

  // Add getRoomDetails function
  getRoomDetails: async (roomId) => {
    const response = await fetchWithAuth(`http://localhost:3000/api/rooms/${roomId}`);
    
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
    const response = await fetchWithAuth(`http://localhost:3000/api/rooms/${roomId}/status`, {
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
    const response = await fetchWithAuth('http://localhost:3000/api/sketch/create', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      throw new Error('Failed to create sketch');
    }

    return response.json();
  },

  importTimeline: async (sketchId, filePath) => {
    const response = await fetchWithAuth('http://localhost:3000/api/sketch/import', {
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
    const timesketchHost = process.env.REACT_APP_TIMESKETCH_HOST || 'http://localhost:5001';
    return `${timesketchHost}/sketch/${sketchId}/explore`;
  },

  // Add recoverSession function
  recoverSession: async (roomId, recoveryKey) => {
    const response = await fetchWithAuth(`${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/api/rooms/${roomId}/recover`, {
      method: 'POST',
      body: JSON.stringify({ recoveryKey }),
    });

    if (!response.ok) {
      throw new Error('Invalid recovery key');
    }

    return response.json();
  },

  uploadFile: async (formData, onProgress) => {
    const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/api/files/upload`, {
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

    return response.json();
  },

  getUploadedFiles: async (roomId) => {
    try {
      const response = await fetchWithAuth(`${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/api/files/${roomId}`);

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
  downloadFile: async (fileId) => {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/api/files/download/${fileId}`,
        {
          headers: {
            'x-api-key': API_KEY
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to download file');
      }

      // Get the blob from the response
      const blob = await response.blob();
      return blob;
    } catch (error) {
      console.error('Error downloading file:', error);
      throw error;
    }
  },

  deleteFile: async (fileId) => {
    try {
      const response = await fetchWithAuth(
        `${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/api/files/${fileId}`,
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
      const response = await fetchWithAuth(`${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/api/chat/bot`, {
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
      const response = await fetchWithAuth(`${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/api/files/${roomId}/refresh`);

      if (!response.ok) {
        throw new Error('Failed to refresh uploaded files');
      }

      return await response.json();
    } catch (error) {
      console.error('Error refreshing uploaded files:', error);
      throw error;
    }
  },
};
