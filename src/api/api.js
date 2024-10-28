import io from 'socket.io-client';

let socket = null;

// Initialize socket connection
const initSocket = () => {
  socket = io('http://localhost:3000', {
    withCredentials: true,
    transports: ['websocket']
  });
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
    const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/api/rooms/${roomId}/users`);
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
    try {
      const response = await fetch('http://localhost:3000/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, userId, username }), // Make sure username is included
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
    } catch (error) {
      console.error('Error creating room:', error);
      throw error;
    }
  },

  getActiveRooms: async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/api/rooms`);
      if (!response.ok) {
        throw new Error('Failed to fetch active rooms');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching active rooms:', error);
      return [];
    }
  },

  // Add getRoomDetails function
  getRoomDetails: async (roomId) => {
    try {
      const response = await fetch(`http://localhost:3000/api/rooms/${roomId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch room details');
      }
      
      const roomData = await response.json();
      
      // Add sketch_id from localStorage if not present in response
      if (!roomData.sketch_id) {
        roomData.sketch_id = localStorage.getItem(`sketchId_${roomId}`);
      }
      
      return roomData;
    } catch (error) {
      console.error('Error fetching room details:', error);
      throw error;
    }
  },

  // Add closeRoom function if not already present
  closeRoom: async (roomId) => {
    try {
      const userId = localStorage.getItem('userId');
      const response = await fetch(`http://localhost:3000/api/rooms/${roomId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          active: false,
          userId
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to close room');
      }

      // Clean up localStorage
      localStorage.removeItem(`sketchId_${roomId}`);
      
      return response.json();
    } catch (error) {
      console.error('Error closing room:', error);
      throw error;
    }
  },

  // Add new Timesketch functions
  createSketch: async (name) => {
    try {
      const response = await fetch('http://localhost:3000/api/sketch/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        throw new Error('Failed to create sketch');
      }

      return response.json();
    } catch (error) {
      console.error('Error creating sketch:', error);
      throw error;
    }
  },

  importTimeline: async (sketchId, filePath) => {
    try {
      const response = await fetch('http://localhost:3000/api/sketch/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          sketch_id: sketchId, 
          file_path: filePath 
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to import timeline');
      }

      return response.json();
    } catch (error) {
      console.error('Error importing timeline:', error);
      throw error;
    }
  },

  // Add helper function to get sketch URL
  getSketchUrl: (sketchId) => {
    const timesketchHost = process.env.REACT_APP_TIMESKETCH_HOST || 'http://localhost:5001';
    return `${timesketchHost}/sketch/${sketchId}/explore`;
  },

  // Add recoverSession function
  recoverSession: async (roomId, recoveryKey) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/api/rooms/${roomId}/recover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recoveryKey }),
      });

      if (!response.ok) {
        throw new Error('Invalid recovery key');
      }

      return response.json();
    } catch (error) {
      console.error('Error recovering session:', error);
      throw error;
    }
  },
};
