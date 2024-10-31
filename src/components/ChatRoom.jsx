import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api/api';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { FaExternalLinkAlt, FaCopy, FaFileUpload } from 'react-icons/fa';
import { HiOutlineLogout, HiUserAdd } from 'react-icons/hi';
import ConfirmCloseModal from './modals/ConfirmCloseModal';
import SecretKeyModal from './modals/SecretKeyModal';
import RecoveryKeyModal from './modals/RecoveryKeyModal';
import SecretInput from './SecretInput';
import ActiveUsersSidebar from './ActiveUsersSidebar';
import BotMessage from './BotMessage';
import { FaRobot } from 'react-icons/fa';

function ChatRoom() {
  const { theme } = useTheme();
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState(() => {
    return localStorage.getItem(`username_${roomId}`) || '';
  });
  const [userId, setUserId] = useState(() => {
    return localStorage.getItem(`userId_${roomId}`) || null;
  });
  const [isJoined, setIsJoined] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [activeUsers, setActiveUsers] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  const [secretKey, setSecretKey] = useState(() => {
    return localStorage.getItem(`secretKey_${roomId}`) || location.state?.secretKey || '';
  });

  const [isRoomOwner, setIsRoomOwner] = useState(() => {
    return localStorage.getItem(`isRoomOwner_${roomId}`) === 'true';
  });

  const [roomName, setRoomName] = useState('Security Sketch');

  const formatMessageContent = (content, username) => {
    const mentionRegex = /@(\w+)/g;
    const parts = content.split(mentionRegex);
    
    return parts.map((part, index) => {
      if (index % 2 === 0) {
        return part;
      }
      const isBot = part.toLowerCase() === 'sketchy';
      const isActiveUser = activeUsers.some(user => user.username.toLowerCase() === part.toLowerCase());
      const isMentionedUser = part.toLowerCase() === username.toLowerCase();
      
      let className = 'inline-block px-2 py-0.5 rounded-md font-medium ';
      if (theme === 'corporate') {
        // Light theme colors with increased contrast
        if (isBot) {
          className += 'bg-primary/25 text-primary-focus';
        } else if (isActiveUser) {
          className += isMentionedUser
            ? 'bg-primary/30 text-primary-focus'
            : 'bg-neutral/25 text-neutral';
        }
      } else {
        // Dark (dracula) theme colors
        if (isBot) {
          className += 'bg-purple-500/20 text-purple-300';
        } else if (isActiveUser) {
          className += isMentionedUser
            ? 'bg-teal-500/20 text-teal-300'
            : 'bg-slate-300/10 text-slate-300';
        }
      }
      
      return (
        <span
          key={index}
          className={className}
        >
          @{part}
        </span>
      );
    });
  };

  const [isRoomActive, setIsRoomActive] = useState(true);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [closeError, setCloseError] = useState(null);

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

      api.onRoomJoined(({ 
        messages: roomMessages, 
        activeUsers: roomUsers, 
        userId: newUserId, 
        roomName: newRoomName, 
        username: newUsername,
        recoveryKey: newRecoveryKey 
      }) => {
        console.log('Room joined, active users:', roomUsers);
        
        setMessages(roomMessages || []);
        // Deduplicate users by username
        const uniqueUsers = roomUsers ? 
          Array.from(new Map(roomUsers.map(user => [user.username, user])).values()) 
          : [];
        setActiveUsers(uniqueUsers);
        setIsJoined(true);
        
        if (newUserId) {
          setUserId(newUserId);
          localStorage.setItem(`userId_${roomId}`, newUserId);
        }
        
        if (newRoomName) setRoomName(newRoomName);
        if (newUsername) setUsername(newUsername);
        
        if (newRecoveryKey && !localStorage.getItem(`hasShownRecoveryKey_${roomId}`)) {
          setRecoveryKey(newRecoveryKey);
          setShowRecoveryKeyModal(true);
          localStorage.setItem(`hasShownRecoveryKey_${roomId}`, 'true');
        }
      });

      api.onUserJoined((user, updatedActiveUsers) => {
        console.log('User joined, updated users:', updatedActiveUsers);
        if (updatedActiveUsers) {
          // Deduplicate by username
          const uniqueUsers = Array.from(
            new Map(updatedActiveUsers.map(user => [user.username, user])).values()
          );
          setActiveUsers(uniqueUsers);
        }
      });

      api.onUpdateActiveUsers(({ activeUsers: updatedUsers }) => {
        console.log('Active users updated:', updatedUsers);
        // Deduplicate by username
        const uniqueUsers = Array.from(
          new Map(updatedUsers.map(user => [user.username, user])).values()
        );
        setActiveUsers(uniqueUsers);
      });

      api.onUserLeft(({ userId, username }) => {
        console.log('User left:', username);
        setActiveUsers(prevUsers => 
          prevUsers.filter(u => u.username !== username)
        );
        setMessages(prev => [...prev, {
          content: `${username} left the chat`,
          username: 'system',
          timestamp: new Date().toISOString(),
          isSystem: true
        }]);
      });

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

      // Update bot message handler
      socket.on('bot_message', (botMessage) => {
        console.log('Received bot message in ChatRoom:', botMessage);
        setMessages(prevMessages => {
          // First remove typing indicator
          const messagesWithoutTyping = prevMessages.filter(m => !m.isTyping);
          // Then add new bot message
          return [...messagesWithoutTyping, botMessage];
        });
      });

      // Add this back
      const keepAlivePing = setInterval(() => {
        if (isJoined && roomId && userId) {
          socket.emit('keep_alive', { roomId, userId });
        }
      }, 5000);

      // Add this back
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
    };

    const socket = setupSocketListeners();
    
    // Make sure to properly handle the cleanup
    return () => {
      console.log('Cleaning up socket listeners');
      const unloadType = sessionStorage.getItem('unloadType');
      if (unloadType !== 'refresh' && userId) {
        api.leaveRoom(roomId, userId);
      }
      api.cleanup();
      api.disconnect();
    };
  }, [roomId, userId, isJoined]);

  useEffect(() => {
    const checkRoomOwnership = async () => {
      try {
        const roomDetails = await api.getRoomDetails(roomId);
        const currentUserId = localStorage.getItem('userId');
        
        if (roomDetails && currentUserId) {
          setIsRoomOwner(roomDetails.owner_id === currentUserId);
        }
      } catch (error) {
        console.error('Error checking room ownership:', error);
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
      
      if (location.state?.isRecovery) {
        console.log('Recovering session with:', location.state);
        setUserId(location.state.userId);
        setUsername(location.state.username);
        setIsRoomOwner(location.state.isOwner);
        
        localStorage.setItem(`userId_${roomId}`, location.state.userId);
        localStorage.setItem(`username_${roomId}`, location.state.username);
        localStorage.setItem(`secretKey_${roomId}`, secretKey);
        localStorage.setItem(`isRoomOwner_${roomId}`, location.state.isOwner);
        
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
        
        localStorage.setItem(`username_${roomId}`, location.state.username);
        localStorage.setItem(`secretKey_${roomId}`, secretKey);
        localStorage.setItem(`isRoomOwner_${roomId}`, 'true');
        
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
        
        localStorage.setItem(`username_${roomId}`, username);
        localStorage.setItem(`secretKey_${roomId}`, secretKey);
        
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
    
    // Clear the message immediately to improve UX
    setMessage('');
    
    try {
      if (trimmedMessage.toLowerCase().includes('@sketchy')) {
        // Add typing indicator with unique ID
        const typingMessage = {
          content: 'sketchy is typing...',
          username: 'sketchy',
          isTyping: true,
          timestamp: new Date().toISOString(),
          id: `typing-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };
        setMessages(prev => [...prev, typingMessage]);
        
        // Send to bot and wait for response
        await api.sendMessageToBot(trimmedMessage, roomId, username);
        
        // Remove typing indicator
        setMessages(prev => prev.filter(m => !m.isTyping));
      } else {
        // Regular message handling
        await api.sendMessage({
          roomId,
          username,
          content: trimmedMessage,
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message');
      // Remove typing indicator on error
      setMessages(prev => prev.filter(m => !m.isTyping));
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const onEmojiSelect = (emoji) => {
    setMessage(prev => prev + emoji.native);
    setShowEmojiPicker(false);
  };

  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const textareaRef = useRef(null);

  const handleInput = (e) => {
    const textarea = e.target;
    const text = textarea.value;
    const cursorPosition = textarea.selectionStart;
    
    const wordBeforeCursor = text.slice(0, cursorPosition).split(/\s/).pop();
    
    if (wordBeforeCursor.startsWith('@')) {
      const filter = wordBeforeCursor.slice(1).toLowerCase();
      const showBot = 'sketchy'.includes(filter);
      
      setMentionFilter(filter);
      setShowMentions(showBot || activeUsers.some(user => 
        user.username.toLowerCase().includes(filter)
      ));
    } else {
      setShowMentions(false);
    }
    
    setMessage(text);
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  };

  const handleMentionClick = (username) => {
    const textarea = textareaRef.current;
    const text = textarea.value;
    const cursorPosition = textarea.selectionStart;
    
    const mentionStart = text.slice(0, cursorPosition).lastIndexOf('@');
    
    const newText = text.slice(0, mentionStart) + '@' + username + ' ' + text.slice(cursorPosition);
    
    setMessage(newText);
    setShowMentions(false);
    textarea.focus();
  };

  const [showSecretKeyModal, setShowSecretKeyModal] = useState(false);

  const [sketchId, setSketchId] = useState(null);

  useEffect(() => {
    const checkRoomDetails = async () => {
      try {
        const roomDetails = await api.getRoomDetails(roomId);
        const currentUserId = localStorage.getItem('userId');
        
        if (roomDetails) {
          if (currentUserId) {
            setIsRoomOwner(roomDetails.owner_id === currentUserId);
          }
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

  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState([]);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

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

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

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

      const newFile = {
        id: response.fileId,
        original_filename: file.name,
        file_size: file.size,
        created_at: new Date().toISOString(),
        processing_error: response.processing_error,
        processed: response.processed,
        processed_at: response.processed_at
      };

      setUploadedFiles(prev => [...prev, newFile]);
      
      setMessages(prev => [...prev, {
        content: `${username} uploaded ${file.name}`,
        username: 'system',
        timestamp: new Date().toISOString(),
        isSystem: true,
        type: 'file-upload'
      }]);

      setUploadProgress(0);
    } catch (error) {
      console.error('Upload failed:', error);
      setError('Failed to upload file');
      setUploadProgress(0);
    }
  };

  const handleFileDownload = async (fileId, filename) => {
    try {
      const response = await api.downloadFile(fileId);
      
      const blob = new Blob([response.data]);
      
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      setError('Failed to download file');
    }
  };

  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const FILES_PER_PAGE = 10;
  const MAX_FILES_BEFORE_SCROLL = 5;

  const sortFiles = (files) => {
    return [...files].sort((a, b) => {
      if (sortBy === 'date') {
        const dateA = new Date(a.created_at);
        const dateB = new Date(b.created_at);
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      } else {
        const nameA = a.original_filename.toLowerCase();
        const nameB = b.original_filename.toLowerCase();
        return sortOrder === 'desc' ? 
          nameB.localeCompare(nameA) : 
          nameA.localeCompare(nameB);
      }
    });
  };

  const getDisplayedFiles = () => {
    const filteredFiles = uploadedFiles.filter(file =>
      file.original_filename.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const sortedFiles = sortFiles(filteredFiles);
    const totalPages = Math.ceil(sortedFiles.length / FILES_PER_PAGE);
    
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
    
    const start = (currentPage - 1) * FILES_PER_PAGE;
    const paginatedFiles = sortedFiles.slice(start, start + FILES_PER_PAGE);
    
    return {
      files: paginatedFiles,
      totalPages,
      totalFiles: filteredFiles.length
    };
  };

  const handleFileDelete = async (fileId) => {
    try {
      await api.deleteFile(fileId);
      setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
      
      setMessages(prev => [...prev, {
        content: `${username} removed a file`,
        username: 'system',
        timestamp: new Date().toISOString(),
        isSystem: true,
        type: 'file-delete'
      }]);
    } catch (error) {
      console.error('Error deleting file:', error);
      setError('Failed to delete file');
    }
  };

  useEffect(() => {
    return () => {
      const unloadType = sessionStorage.getItem('unloadType');
      if (unloadType === 'leave') {
        localStorage.removeItem(`username_${roomId}`);
        localStorage.removeItem(`userId_${roomId}`);
        localStorage.removeItem(`secretKey_${roomId}`);
        localStorage.removeItem(`isRoomOwner_${roomId}`);
        localStorage.removeItem(`hasShownRecoveryKey_${roomId}`);
      }
    };
  }, [roomId]);

  useEffect(() => {
    const storedUsername = localStorage.getItem(`username_${roomId}`);
    const storedSecretKey = localStorage.getItem(`secretKey_${roomId}`);
    
    if (storedUsername && storedSecretKey && !isJoined) {
      const autoJoin = async () => {
        try {
          await api.joinRoom(roomId, storedUsername, storedSecretKey);
          setIsJoined(true);
        } catch (error) {
          console.error('Auto-join failed:', error);
          localStorage.removeItem(`username_${roomId}`);
          localStorage.removeItem(`userId_${roomId}`);
          localStorage.removeItem(`secretKey_${roomId}`);
          localStorage.removeItem(`isRoomOwner_${roomId}`);
        }
      };
      
      autoJoin();
    }
  }, [roomId, isJoined]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      sessionStorage.setItem('unloadType', 'refresh');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      sessionStorage.setItem('unloadType', 'leave');
    };
  }, []);

  const handleRefreshFiles = async () => {
    try {
      const files = await api.refreshUploadedFiles(roomId);
      setUploadedFiles(files);
    } catch (error) {
      console.error('Error refreshing files:', error);
      setError('Failed to refresh files');
    }
  };

  if (!isJoined) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] p-4">
        <div className="w-full max-w-2xl">
          <div className="card bg-base-200 shadow-xl rounded-2xl hover:shadow-2xl transition-all duration-300">
            <div className="card-body">
              <h2 className="card-title text-2xl font-bold mb-4">Join Chat</h2>
              
              <div className="mb-6">
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
              </div>

              <div className="divider my-0"></div>
              
              {error && (
                <div className="alert alert-error mb-4">
                  <span>{error}</span>
                </div>
              )}
              
              <form onSubmit={joinChat} className="space-y-4">
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
                  <label className="label pt-3">
                    <span className="label-text-alt text-base-content/70">
                      The secret key is required to join an existing investigation room. This key is shared by the room creator and ensures only authorized investigators can access the room.
                    </span>
                  </label>
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
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-4 p-4 max-w-[1920px] mx-auto h-[calc(100vh-12rem)]">
      <div className="col-span-1 card bg-base-200 shadow-xl rounded-2xl max-h-[calc(100vh-12rem)] overflow-hidden">
        <ActiveUsersSidebar 
          activeUsers={activeUsers}
          username={username}
          uploadedFiles={uploadedFiles}
          uploadProgress={uploadProgress}
          onFileUpload={handleFileUpload}
          handleFileDownload={handleFileDownload}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          getDisplayedFiles={getDisplayedFiles}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          onFileDelete={handleFileDelete}
          onRefreshFiles={handleRefreshFiles}
        />
      </div>

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
                <div className="tooltip tooltip-bottom" data-tip="Open this investigation's timeline in Timesketch">
                  <a
                    href={`${process.env.REACT_APP_TIMESKETCH_HOST}/sketch/${sketchId}/explore`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm px-4 hover:bg-primary/10 text-primary hover:text-primary rounded-xl border-none transition-all duration-300"
                  >
                    <FaExternalLinkAlt className="w-3.5 h-3.5 mr-2" />
                    Open in Timesketch
                  </a>
                </div>
              )}
              {isRoomOwner && (
                <>
                  <div className="tooltip tooltip-bottom" data-tip="Copy the secret key to share with others who need to join">
                    <button 
                      onClick={() => setShowSecretKeyModal(true)}
                      className="btn btn-ghost btn-sm px-4 hover:bg-primary/10 text-primary hover:text-primary rounded-xl border-none transition-all duration-300"
                    >
                      <FaCopy className="w-3.5 h-3.5 mr-2" />
                      Copy Secret Key
                    </button>
                  </div>
                  <div className="tooltip tooltip-bottom" data-tip="Close this investigation and end the chat for all participants">
                    <button 
                      onClick={handleCloseRoom}
                      className="btn btn-ghost btn-sm px-4 hover:bg-red-500/10 text-red-500 hover:text-red-600 rounded-xl border-none transition-all duration-300"
                    >
                      <HiOutlineLogout className="w-5 h-5 mr-1.5" />
                      Close Investigation
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto mt-4 space-y-4 pr-2 min-h-0">
            {messages.map((msg, index) => (
              <div key={msg.id || `temp-${index}`}>
                {msg.isBot ? (
                  <BotMessage 
                    message={msg.content} 
                    timestamp={msg.timestamp} 
                    theme={theme} 
                  />
                ) : (
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
                        ? msg.type === 'file-upload'
                          ? 'text-xs bg-primary/10 text-primary px-4 py-2 flex items-center gap-2'
                          : msg.type === 'user-join'
                            ? 'text-xs bg-success/10 text-success px-4 py-2 flex items-center gap-2'
                            : 'text-xs text-base-content/50 bg-base-300/30 px-3 py-1'
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
                      {msg.type === 'file-upload' ? (
                        <>
                          <FaFileUpload className="w-3.5 h-3.5" />
                          {msg.content}
                        </>
                      ) : msg.type === 'user-join' ? (
                        <>
                          <HiUserAdd className="w-3.5 h-3.5" />
                          {msg.content}
                        </>
                      ) : (
                        formatMessageContent(msg.content, username)
                      )}
                    </div>
                  </div>
                )}
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
                  
                  {showMentions && (
                    <div className="fixed transform -translate-y-full left-auto mb-2 w-48 bg-base-200 rounded-lg shadow-xl border border-base-300 z-50">
                      {'sketchy'.includes(mentionFilter.toLowerCase()) && (
                        <button
                          onClick={() => handleMentionClick('sketchy')}
                          className="w-full px-4 py-2 text-left hover:bg-base-300 first:rounded-t-lg last:rounded-b-lg flex items-center gap-2 text-purple-400"
                        >
                          <FaRobot className="w-3.5 h-3.5" />
                          sketchy
                        </button>
                      )}
                      
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

      <ConfirmCloseModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={confirmCloseRoom}
        error={closeError}
      />

      <SecretKeyModal
        isOpen={showSecretKeyModal}
        onClose={() => setShowSecretKeyModal(false)}
        secretKey={secretKey}
        username={username}
        roomName={roomName}
      />

      <RecoveryKeyModal
        isOpen={showRecoveryKeyModal && recoveryKey}
        onClose={() => setShowRecoveryKeyModal(false)}
        recoveryKey={recoveryKey}
        username={username}
        roomName={roomName}
      />
    </div>
  );
}

export default ChatRoom;
