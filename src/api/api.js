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

const joinRoom = (roomId, username, secretKey) => {
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
      // Store userId in localStorage when received from server
      if (data.userId) {
        localStorage.setItem(`userId_${roomId}`, data.userId);
      }
      resolve(data);
    });

    socket.emit('join_room', { roomId, username, secretKey });
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
const createRoom = async (sketchName) => {
  try {
    const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: sketchName }), // Change sketchName to name here
    });

    if (!response.ok) {
      throw new Error('Failed to create room');
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating room:', error);
    throw error;
  }
};

// Add this new function
const getActiveRooms = async () => {
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
};

// Update the api export to include getActiveRooms
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
  createRoom,
  getActiveRooms
};
