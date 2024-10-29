import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api/api';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { FaEye, FaEyeSlash, FaExternalLinkAlt, FaCopy } from 'react-icons/fa';
import { HiOutlineLogout } from 'react-icons/hi';

function ChatRoom() {
  const { theme } = useTheme();
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [userId, setUserId] = useState(() => {
    // Try to get existing userId from localStorage
    return localStorage.getItem(`userId_${roomId}`) || null;
  });
  const [isJoined, setIsJoined] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [activeUsers, setActiveUsers] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  // Get secret key from location state if creating new room
  const [secretKey, setSecretKey] = useState(location.state?.secretKey || '');

  // Add this state near your other useState declarations
  const [showSecretKey, setShowSecretKey] = useState(false);

  // Near the top of your component where other state is defined
  const [isRoomOwner, setIsRoomOwner] = useState(false);

  const [roomName, setRoomName] = useState('Security Sketch');

  // Add this helper function in your component
  const formatMessageContent = (content, username) => {
    // Replace @mentions with styled spans
    const mentionRegex = /@(\w+)/g;
    const parts = content.split(mentionRegex);
    
    return parts.map((part, index) => {
      // Even indices are normal text, odd indices are usernames
      if (index % 2 === 0) {
        return part;
      }
      // Check if mentioned user exists in activeUsers
      const isActiveUser = activeUsers.some(user => user.username.toLowerCase() === part.toLowerCase());
      const isMentionedUser = part.toLowerCase() === username.toLowerCase();
      
      return (
        <span
          key={index}
          className={`inline-block ${
            isActiveUser 
              ? isMentionedUser
                ? 'bg-primary/20 text-primary-content px-1 rounded'
                : 'bg-base-content/10 px-1 rounded'
              : ''
          }`}
        >
          @{part}
        </span>
      );
    });
  };

  // Add to existing state declarations
  const [isRoomActive, setIsRoomActive] = useState(true);

  // Add these state declarations near your other useState calls
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [closeError, setCloseError] = useState(null);

  // Update the closeRoom function
  const handleCloseRoom = () => {
    setShowConfirmModal(true);
  };

  const confirmCloseRoom = async () => {
    try {
      await api.closeRoom(roomId);
      setIsRoomActive(false);
      setShowConfirmModal(false);
      navigate('/');
    } catch (error) {
      console.error('Error closing room:', error);
      setCloseError('Failed to close room');
    }
  };

  useEffect(() => {
    const setupSocketListeners = () => {
      const socket = api.initSocket();
      api.cleanup();

      // Update the room joined handler
      api.onRoomJoined(({ 
        messages: roomMessages, 
        activeUsers: roomUsers, 
        userId: newUserId, 
        roomName: newRoomName, 
        username: newUsername,
        recoveryKey: newRecoveryKey 
      }) => {
        console.log('Room joined, setting initial state:', { 
          roomMessages, 
          roomUsers, 
          newUserId, 
          newRoomName, 
          newUsername,
          newRecoveryKey 
        });
        setMessages(roomMessages || []);
        setActiveUsers(roomUsers || []);
        setIsJoined(true);
        
        if (newUserId) {
          setUserId(newUserId);
          localStorage.setItem(`userId_${roomId}`, newUserId);
        }
        
        if (newRoomName) setRoomName(newRoomName);
        
        // Ensure username is set from server response if available
        if (newUsername) setUsername(newUsername);
        
        if (newRecoveryKey) {
          setRecoveryKey(newRecoveryKey);
          setShowRecoveryKeyModal(true);
        }
      });

      return socket;
    };

    const socket = setupSocketListeners();
    
    // Define keepAlivePing here, at the useEffect level
    const keepAlivePing = setInterval(() => {
      if (isJoined && roomId && userId) {
        socket.emit('keep_alive', { roomId, userId });
      }
    }, 5000);

    api.onUpdateActiveUsers(({ activeUsers: updatedUsers }) => {
      setActiveUsers(updatedUsers);
    });

    api.onUserJoined((user, updatedActiveUsers) => {
      if (updatedActiveUsers) {
        setActiveUsers(updatedActiveUsers);
      } else {
        setActiveUsers(prevUsers => {
          if (prevUsers.some(u => u.username === user.username)) {
            return prevUsers;
          }
          return [...prevUsers, user];
        });
      }
      // Add system message for user join
      setMessages(prev => [...prev, {
        content: `${user.username} joined the chat`,
        username: 'system',
        timestamp: new Date().toISOString(),
        isSystem: true
      }]);
    });

    api.onUserLeft(({ userId, username }) => {
      setActiveUsers(prevUsers => 
        prevUsers.filter(u => u.username !== username)
      );
      // Add system message for user leave
      setMessages(prev => [...prev, {
        content: `${username} left the chat`,
        username: 'system',
        timestamp: new Date().toISOString(),
        isSystem: true
      }]);
    });

    // Update the message handler
    api.onNewMessage((message) => {
      console.log('New message received in ChatRoom:', message);
      setMessages(prevMessages => {
        // Only add server messages that aren't already in the list
        const messageExists = prevMessages.some(m => 
          m.id === message.id || 
          (m.content === message.content && 
           m.username === message.username && 
           !m.id) // Check for optimistically added messages
        );
        
        if (messageExists) {
          // Update the optimistic message with the server data
          return prevMessages.map(m => 
            (m.content === message.content && m.username === message.username && !m.id)
              ? message 
              : m
          );
        }
        return [...prevMessages, message];
      });
    });

    api.onError(({ message }) => {
      setError(message);
    });

    // Modify the refresh interval
    const refreshInterval = setInterval(async () => {
      try {
        if (roomId && isJoined && userId) {
          const activeUsers = await api.getActiveUsers(roomId);
          setActiveUsers(prevUsers => {
            // Only update if the list has actually changed
            const currentIds = prevUsers.map(u => u.id).sort().join(',');
            const newIds = activeUsers.map(u => u.id).sort().join(',');
            return currentIds !== newIds ? activeUsers : prevUsers;
          });
        }
      } catch (error) {
        console.error('Error refreshing active users:', error);
      }
    }, 15000);

    return () => {
      console.log('Cleaning up socket listeners');
      if (userId) {
        api.leaveRoom(roomId, userId);
      }
      api.cleanup();
      api.disconnect();
      clearInterval(refreshInterval);
      clearInterval(keepAlivePing);
    };
  }, [roomId, userId, isJoined]);

  useEffect(() => {
    // ... existing code ...
    
    // Add check for room ownership
    const checkRoomOwnership = async () => {
      try {
        const roomDetails = await api.getRoomDetails(roomId);
        const currentUserId = localStorage.getItem('userId');
        
        if (roomDetails && currentUserId) {
          setIsRoomOwner(roomDetails.owner_id === currentUserId);
        }
      } catch (error) {
        console.error('Error checking room ownership:', error);
        // Handle error gracefully - maybe set some error state
        setIsRoomOwner(false);
      }
    };

    if (roomId) {
      checkRoomOwnership();
    }
  }, [roomId]);

  const joinChat = async (e) => {
    e.preventDefault();
    console.log('Joining chat with state:', location.state);
    
    try {
      setError(null);
      
      // If recovering a session, use the recovered data
      if (location.state?.isRecovery) {
        console.log('Recovering session with:', location.state);
        setUserId(location.state.userId);
        setUsername(location.state.username);
        setIsRoomOwner(location.state.isOwner);
        await api.joinRoom(
          roomId,
          location.state.username,
          secretKey,
          location.state.userId,
          location.state.isOwner
        );
      } else if (location.state?.isNewRoom) {
        console.log('Joining as owner with:', location.state);
        setUsername(location.state.username);
        setIsRoomOwner(true);
        await api.joinRoom(
          roomId,
          location.state.username,
          secretKey,
          location.state.userId,
          true
        );
      } else {
        console.log('Regular join with username:', username);
        if (!username.trim()) {
          throw new Error('Username is required');
        }
        await api.joinRoom(roomId, username, secretKey);
      }
      
      setIsJoined(true);
      
    } catch (err) {
      setError(err.message || 'Failed to join room');
      console.error(err);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;
    if (!username) {
      console.error('Username is missing');
      setError('Username is missing. Please try rejoining the chat.');
      return;
    }

    try {
      console.log('Sending message:', { roomId, username, content: trimmedMessage });
      
      // Create the message data object with ISO string timestamp
      const messageData = {
        content: trimmedMessage,
        username: username,
        timestamp: new Date().toISOString(),
        roomId
      };

      // Optimistically add message to UI
      setMessages(prev => [...prev, messageData]);
      
      // Clear input immediately
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }

      // Send to server
      await api.sendMessage({
        roomId,
        username: username,
        content: trimmedMessage
      });
      
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message');
      // Optionally remove the optimistically added message if it failed
      setMessages(prev => prev.filter(msg => msg.content !== trimmedMessage));
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Add handler for emoji selection
  const onEmojiSelect = (emoji) => {
    setMessage(prev => prev + emoji.native);
    setShowEmojiPicker(false);
  };

  // Add autocomplete for @mentions
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const textareaRef = useRef(null);

  // Add this function to handle @ mentions
  const handleInput = (e) => {
    const textarea = e.target;
    const text = textarea.value;
    const cursorPosition = textarea.selectionStart;
    
    // Find the word being typed
    const wordBeforeCursor = text.slice(0, cursorPosition).split(/\s/).pop();
    
    if (wordBeforeCursor.startsWith('@')) {
      const filter = wordBeforeCursor.slice(1).toLowerCase();
      console.log('Showing mentions with filter:', filter); // Debug log
      console.log('Active users:', activeUsers); // Debug log
      setMentionFilter(filter);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
    
    setMessage(text);
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  };

  // Add this function to handle mention selection
  const handleMentionClick = (username) => {
    const textarea = textareaRef.current;
    const text = textarea.value;
    const cursorPosition = textarea.selectionStart;
    
    // Find the start of the @mention
    const mentionStart = text.slice(0, cursorPosition).lastIndexOf('@');
    
    // Replace the partial @mention with the full username
    const newText = text.slice(0, mentionStart) + '@' + username + ' ' + text.slice(cursorPosition);
    
    setMessage(newText);
    setShowMentions(false);
    textarea.focus();
  };

  // Add new state for showing the secret key modal
  const [showSecretKeyModal, setShowSecretKeyModal] = useState(false);

  // Add new state near other useState declarations
  const [sketchId, setSketchId] = useState(null);

  // Modify the existing useEffect that checks room ownership to also fetch sketch_id
  useEffect(() => {
    const checkRoomDetails = async () => {
      try {
        const roomDetails = await api.getRoomDetails(roomId);
        const currentUserId = localStorage.getItem('userId');
        
        if (roomDetails) {
          if (currentUserId) {
            setIsRoomOwner(roomDetails.owner_id === currentUserId);
          }
          // Add this line to set the sketch ID
          setSketchId(roomDetails.sketch_id);
        }
      } catch (error) {
        console.error('Error checking room details:', error);
        setIsRoomOwner(false);
      }
    };

    if (roomId) {
      checkRoomDetails();
    }
  }, [roomId]);

  // Add this useEffect to fetch active users when component mounts
  useEffect(() => {
    const fetchInitialActiveUsers = async () => {
      try {
        if (roomId) {
          const users = await api.getActiveUsers(roomId);
          setActiveUsers(users);
        }
      } catch (error) {
        console.error('Error fetching initial active users:', error);
      }
    };

    fetchInitialActiveUsers();
  }, [roomId]);

  const [showRecoveryKeyModal, setShowRecoveryKeyModal] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [showRecoveryKey, setShowRecoveryKey] = useState(false);

  useEffect(() => {
    const setupSocketListeners = () => {
      const socket = api.initSocket();
      api.cleanup();

      // Add debug logging for room_joined event
      api.onRoomJoined((data) => {
        console.log('Room joined event received:', data);
        
        setMessages(data.messages || []);
        setActiveUsers(data.activeUsers || []);
        setIsJoined(true);
        
        if (data.userId) {
          console.log('Setting userId:', data.userId);
          setUserId(data.userId);
          localStorage.setItem(`userId_${roomId}`, data.userId);
        }
        
        if (data.roomName) {
          console.log('Setting room name:', data.roomName);
          setRoomName(data.roomName);
        }
        
        // Debug recovery key handling
        console.log('Recovery key in room_joined:', data.recoveryKey);
        if (data.recoveryKey) {
          console.log('Attempting to show recovery key modal');
          setRecoveryKey(data.recoveryKey);
          setShowRecoveryKeyModal(true);
        }
      });

      return socket;
    };

    const socket = setupSocketListeners();
    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  // Add debug logging for modal state
  useEffect(() => {
    console.log('Recovery key modal state:', {
      showModal: showRecoveryKeyModal,
      recoveryKey: recoveryKey
    });
  }, [showRecoveryKeyModal, recoveryKey]);

  // Add new state for copy buttons
  const [showSecretKeyCopy, setShowSecretKeyCopy] = useState(false);
  const [showRecoveryKeyCopy, setShowRecoveryKeyCopy] = useState(false);

  // Helper function for copying and showing toast
  const copyToClipboard = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      const toast = document.createElement('div');
      toast.className = 'alert alert-success fixed bottom-4 right-4 w-auto z-50';
      toast.innerHTML = `
        <span>${type} copied to clipboard!</span>
      `;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.remove();
      }, 3000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Update the secret input fields to use a single icon that toggles
  const SecretInput = ({ value, onChange, placeholder, readOnly }) => {
    const [showSecret, setShowSecret] = useState(false);
    
    return (
      <div className="relative">
        <input
          type={showSecret ? "text" : "password"}
          className={`input input-bordered w-full pr-12 rounded-xl ${
            !readOnly ? "focus:ring-2 focus:ring-primary" : ""
          } transition-all duration-300`}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          readOnly={readOnly}
        />
        <button
          type="button"
          onClick={() => {
            if (showSecret) {
              copyToClipboard(value, 'Secret key');
              setShowSecret(false);
            } else {
              setShowSecret(true);
            }
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content transition-colors"
        >
          {showSecret ? <FaCopy className="w-5 h-5" /> : <FaEye className="w-5 h-5" />}
        </button>
      </div>
    );
  };

  // Add these new state declarations near your other useState calls
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState([]);

  // Add these new helper functions
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Add this new effect to fetch uploaded files when component mounts or when room is joined
  useEffect(() => {
    const fetchUploadedFiles = async () => {
      try {
        if (roomId) {
          const files = await api.getUploadedFiles(roomId);
          setUploadedFiles(files);
        }
      } catch (error) {
        console.error('Error fetching uploaded files:', error);
      }
    };

    if (isJoined) {
      fetchUploadedFiles();
    }
  }, [roomId, isJoined]);

  // Update the handleFileUpload function to properly format the response
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['.csv', '.tsv', '.txt'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validTypes.includes(fileExtension)) {
      setError('Invalid file type. Please upload CSV, TSV, or TXT files only.');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('roomId', roomId);
      formData.append('sketchId', sketchId);

      const response = await api.uploadFile(formData, (progress) => {
        setUploadProgress(progress);
      });

      // Add the new file to the list with proper date formatting
      setUploadedFiles(prev => [...prev, {
        id: response.fileId,
        name: file.name,
        size: file.size,
        created_at: new Date().toISOString(), // Use current time as fallback
        processing_error: response.processing_error,
        processed: response.processed,
        processed_at: response.processed_at
      }]);

      setUploadProgress(0);
    } catch (error) {
      console.error('Upload failed:', error);
      setError('Failed to upload file');
      setUploadProgress(0);
    }
  };

  if (!isJoined) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] p-4">
        <div className="card w-[32rem] bg-base-200 shadow-xl rounded-2xl hover:shadow-2xl transition-all duration-300">
          <div className="card-body">
            <h2 className="card-title text-2xl font-bold mb-4">Join Chat</h2>
            
            {error && (
              <div className="alert alert-error mb-4">
                <span>{error}</span>
              </div>
            )}
            
            {/* Current Users Section */}
            <div className="bg-base-100/50 backdrop-blur-sm border border-base-300 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
                <h3 className="font-semibold text-sm uppercase tracking-wide text-base-content/70">
                  Active Users
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeUsers.map(user => (
                  <div 
                    key={user.id} 
                    className="badge badge-primary bg-primary/10 border-primary/20 text-primary-content gap-2 p-3 rounded-lg"
                  >
                    <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
                    {user.username}
                  </div>
                ))}
                {activeUsers.length === 0 && (
                  <p className="text-sm text-base-content/50 italic">
                    No users currently in the chat
                  </p>
                )}
              </div>
            </div>

            <form onSubmit={joinChat} className="space-y-4">
              {/* Only show username input if not recovering and not the owner */}
              {!location.state?.isRecovery && !location.state?.isNewRoom && (
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Your Name</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Enter your name"
                    className="input input-bordered w-full rounded-xl focus:ring-2 focus:ring-primary transition-all duration-300"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              )}

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Secret Key</span>
                </label>
                <SecretInput
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="Enter secret key"
                />
              </div>

              <div className="card-actions justify-end mt-6">
                <button 
                  className="btn btn-primary rounded-xl hover:scale-105 transition-all duration-300"
                  disabled={(!username.trim() && !location.state?.isRecovery && !location.state?.isNewRoom) || !secretKey.trim()}
                >
                  Join
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-4 p-4 max-w-[1920px] mx-auto h-[calc(100vh-12rem)]">
      {/* Active Users Sidebar */}
      <div className="col-span-1 card bg-base-200 shadow-xl rounded-2xl max-h-[calc(100vh-12rem)] overflow-hidden">
        <div className="card-body overflow-y-auto">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
            <h3 className="font-semibold text-sm uppercase tracking-wide text-base-content/70">
              Active Users ({activeUsers.length})
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeUsers.map(user => (
              <div 
                key={user.username}
                className="badge badge-primary bg-primary/10 border-primary/20 text-primary-content gap-2 p-3 rounded-lg"
              >
                <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
                {user.username}
              </div>
            ))}
          </div>

          {/* File Upload Section */}
          <div className="border-t border-base-300 pt-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 bg-info rounded-full"></div>
              <h3 className="font-semibold text-sm uppercase tracking-wide text-base-content/70">
                Evidence Files
              </h3>
            </div>
            
            <div className="space-y-4">
              <label className="flex flex-col gap-2">
                <div className="btn btn-sm btn-primary rounded-xl w-full normal-case">
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  Upload File
                </div>
                <span className="text-xs text-base-content/70 text-center">
                  Supports CSV, TSV, and TXT files
                </span>
              </label>

              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="w-full bg-base-300 rounded-full h-1.5">
                  <div 
                    className="bg-primary h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              )}

              {uploadedFiles.length > 0 && (
                <div className="space-y-2 mt-4">
                  <div className="text-xs text-base-content/70 uppercase tracking-wide mb-2">
                    Uploaded Files
                  </div>
                  {uploadedFiles.map((file) => (
                    <div 
                      key={file.id}
                      className="flex flex-col gap-1 p-2 bg-base-300/50 rounded-lg text-sm"
                    >
                      <span className="truncate font-medium">{file.original_filename}</span>
                      <div className="flex items-center justify-between text-xs text-base-content/70">
                        <span>{formatFileSize(file.file_size)}</span>
                        <span>{new Date(file.created_at).toLocaleString()}</span>
                      </div>
                      {file.processing_error && (
                        <span className="text-xs text-error mt-1">
                          {file.processing_error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="col-span-3 card bg-base-200 shadow-xl rounded-2xl max-h-[calc(100vh-12rem)] overflow-hidden relative">
        <div className="card-body flex flex-col h-full">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h2 className="card-title text-2xl font-bold">
                {roomName}
              </h2>
              <div className="badge badge-ghost gap-2">
                <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
                {username}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {sketchId && (
                <a
                  href={`${process.env.REACT_APP_TIMESKETCH_HOST}/sketch/${sketchId}/explore`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm px-4 hover:bg-primary/10 text-primary hover:text-primary rounded-xl border-none transition-all duration-300"
                >
                  <FaExternalLinkAlt className="w-3.5 h-3.5 mr-2" />
                  Open in Timesketch
                </a>
              )}
              {isRoomOwner && (
                <>
                  <button 
                    onClick={() => setShowSecretKeyModal(true)}
                    className="btn btn-ghost btn-sm px-4 hover:bg-primary/10 text-primary hover:text-primary rounded-xl border-none transition-all duration-300"
                  >
                    View Secret Key
                  </button>
                  <button 
                    onClick={handleCloseRoom}
                    className="btn btn-ghost btn-sm px-4 hover:bg-red-500/10 text-red-500 hover:text-red-600 rounded-xl border-none transition-all duration-300"
                  >
                    <HiOutlineLogout className="w-5 h-5 mr-1.5" />
                    Close Investigation
                  </button>
                </>
              )}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto mt-4 space-y-4 pr-2 min-h-0">
            {messages.map((msg, index) => (
              <div
                key={msg.id || `temp-${index}`}
                className={`flex flex-col ${
                  msg.isSystem 
                    ? 'items-center' 
                    : msg.username === username 
                      ? 'items-end' 
                      : 'items-start'
                }`}
              >
                {msg.username !== username && !msg.isSystem && (
                  <div className="opacity-70 text-xs flex items-center gap-2 mb-1 px-1">
                    <span className="font-medium">{msg.username}</span>
                    <span className="text-base-content/50">
                      {msg.timestamp && !isNaN(new Date(msg.timestamp).getTime())
                        ? new Date(msg.timestamp).toLocaleTimeString()
                        : new Date().toLocaleTimeString()
                      }
                    </span>
                  </div>
                )}
                <div className={`rounded-lg break-words ${
                  msg.isSystem 
                    ? 'text-xs text-base-content/50 bg-base-300/30 px-3 py-1'
                    : `max-w-[75%] px-4 py-2 ${
                      msg.username === username 
                        ? theme === 'black'
                          ? 'bg-indigo-600 text-white shadow-[0_4px_6px_-1px_rgba(0,0,0,0.3)]' 
                          : 'bg-blue-600 text-white shadow-md'
                        : theme === 'black'
                          ? 'bg-zinc-700 text-white shadow-[0_4px_6px_-1px_rgba(0,0,0,0.3)]'
                          : 'bg-gray-200 text-gray-800 shadow-md'
                    }`
                }`}>
                  {formatMessageContent(msg.content, username)}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={sendMessage} className="mt-4">
            <div className="flex gap-2 items-start relative">
              <span className="font-mono text-base-content/70 pt-2.5 text-sm whitespace-nowrap">
                {username.toLowerCase()}@sketch  ~/{roomName.toLowerCase()}>
              </span>
              <div className="flex-1 flex items-start gap-2">
                <div className="relative flex-1 z-40">
                  <textarea
                    ref={textareaRef}
                    rows="1"
                    placeholder="Type your message..."
                    className="w-full bg-transparent font-mono text-sm focus:outline-none resize-none overflow-hidden pt-2.5"
                    value={message}
                    onChange={handleInput}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage(e);
                      } else if (e.key === 'Escape') {
                        setShowMentions(false);
                      }
                    }}
                  />
                  
                  {/* Mentions popup with higher z-index */}
                  {showMentions && (
                    <div className="fixed transform -translate-y-full left-auto mb-2 w-48 bg-base-200 rounded-lg shadow-xl border border-base-300 z-50">
                      {activeUsers
                        .filter(user => 
                          user.username.toLowerCase().includes(mentionFilter) &&
                          user.username.toLowerCase() !== username.toLowerCase()
                        )
                        .map(user => (
                          <button
                            key={user.username}
                            onClick={() => handleMentionClick(user.username)}
                            className="w-full px-4 py-2 text-left hover:bg-base-300 first:rounded-t-lg last:rounded-b-lg"
                          >
                            {user.username}
                          </button>
                        ))}
                    </div>
                  )}
                  
                  {/* Emoji picker with matching z-index */}
                  {showEmojiPicker && (
                    <div className="absolute bottom-full right-0 mb-2 z-50">
                      <Picker 
                        data={data} 
                        onEmojiSelect={onEmojiSelect}
                        theme={theme === 'black' ? 'dark' : 'light'}
                      />
                    </div>
                  )}
                </div>
                <button 
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="font-mono text-sm text-base-content/50 hover:text-base-content pt-2.5"
                >
                  😊
                </button>
                <button 
                  type="submit"
                  className="font-mono text-sm text-base-content/50 hover:text-base-content pt-2.5"
                >
                  [send]
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Add the confirmation modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="modal-box bg-base-200 p-6 rounded-2xl shadow-lg max-w-sm mx-4">
            <h3 className="font-bold text-lg mb-4">Close Investigation?</h3>
            <p className="text-base-content/70 mb-6">
              Are you sure you want to close this investigation? This action cannot be undone.
            </p>
            {closeError && (
              <div className="alert alert-error mb-4">
                <span>{closeError}</span>
              </div>
            )}
            <div className="modal-action flex gap-3">
              <button 
                className="btn btn-ghost rounded-xl"
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-ghost hover:bg-red-500/10 text-red-500 hover:text-red-600 rounded-xl"
                onClick={confirmCloseRoom}
              >
                Close Investigation
              </button>
            </div>
          </div>
        </div>
      )}

      {showSecretKeyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="modal-box bg-base-200 p-6 rounded-2xl shadow-lg max-w-sm mx-4">
            <h3 className="font-bold text-lg mb-4">Room Secret Key</h3>
            <div className="form-control">
              <SecretInput
                value={secretKey}
                readOnly={true}
              />
            </div>
            <div className="modal-action mt-6">
              <button 
                className="btn btn-ghost rounded-xl"
                onClick={() => setShowSecretKeyModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update modal condition and add debug info */}
      {showRecoveryKeyModal && recoveryKey && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="modal-box bg-base-200 p-6 rounded-2xl shadow-lg max-w-sm mx-4">
            <h3 className="font-bold text-lg mb-4">Your Recovery Key</h3>
            <p className="text-base-content/70 mb-4">
              Please save this recovery key. You'll need it to recover your session if you get disconnected:
            </p>
            <div className="form-control">
              <SecretInput
                value={recoveryKey}
                readOnly={true}
              />
            </div>
            <div className="modal-action mt-6">
              <button 
                className="btn btn-primary rounded-xl"
                onClick={() => {
                  console.log('Closing recovery key modal');
                  setShowRecoveryKeyModal(false);
                }}
              >
                I've Saved It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatRoom;
