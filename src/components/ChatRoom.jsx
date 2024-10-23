import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api/api';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';

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
  const isRoomOwner = Boolean(location.state?.secretKey);

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

  useEffect(() => {
    const setupSocketListeners = () => {
      const socket = api.initSocket();
      api.cleanup();

      return socket;
    };

    const socket = setupSocketListeners();
    
    // Define keepAlivePing here, at the useEffect level
    const keepAlivePing = setInterval(() => {
      if (isJoined && roomId && userId) {
        socket.emit('keep_alive', { roomId, userId });
      }
    }, 5000);

    // Update the room joined handler to include room name
    api.onRoomJoined(({ messages: roomMessages, activeUsers: roomUsers, userId: newUserId, roomName }) => {
      console.log('Room joined, setting initial messages:', roomMessages);
      setMessages(roomMessages);
      setActiveUsers(roomUsers);
      setIsJoined(true);
      if (newUserId) setUserId(newUserId);
      if (roomName) setRoomName(roomName);
    });

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
    });

    api.onUserLeft(({ userId, username }) => {
      setActiveUsers(prevUsers => 
        prevUsers.filter(u => u.username !== username)
      );
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

  const joinChat = async (e) => {
    e.preventDefault();
    if (!username.trim() || !secretKey.trim()) return;

    try {
      setError(null); // Clear any existing errors
      // Pass existing userId if available
      api.joinRoom(roomId, username, secretKey);
    } catch (err) {
      setError(err.message || 'Failed to join room');
      console.error(err);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    try {
      console.log('Sending message:', { roomId, username, content: trimmedMessage });
      
      // Create the message data object
      const messageData = {
        content: trimmedMessage,
        username,
        timestamp: new Date(),
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
        username,
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

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Secret Key</span>
                </label>
                <div className="relative">
                  <input
                    type={showSecretKey ? "text" : "password"}
                    placeholder="Enter secret key"
                    className="input input-bordered w-full rounded-xl focus:ring-2 focus:ring-primary transition-all duration-300 pr-10"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    readOnly={isRoomOwner}
                  />
                  {isRoomOwner && (
                    <button
                      type="button"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content transition-colors"
                    >
                      {showSecretKey ? <FaEyeSlash className="w-5 h-5" /> : <FaEye className="w-5 h-5" />}
                    </button>
                  )}
                </div>
                {isRoomOwner && (
                  <label className="label">
                    <span className="label-text-alt text-warning">Make sure to save this key - you'll need it to rejoin the room!</span>
                  </label>
                )}
              </div>

              <div className="card-actions justify-end mt-6">
                <button 
                  className="btn btn-primary rounded-xl hover:scale-105 transition-all duration-300"
                  disabled={!username.trim() || !secretKey.trim()}
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
                key={user.username} // Changed from user.id to user.username
                className="badge badge-primary bg-primary/10 border-primary/20 text-primary-content gap-2 p-3 rounded-lg"
              >
                <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
                {user.username}
              </div>
            ))}
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
            <div className="badge badge-primary rounded-lg px-4 py-3">Room ID: {roomId}</div>
          </div>
          
          <div className="flex-1 overflow-y-auto mt-4 space-y-4 pr-2 min-h-0">
            {messages.map((msg, index) => (
              <div
                key={msg.id || `temp-${index}`}  // Fallback to index for optimistic updates
                className={`flex flex-col ${msg.username === username ? 'items-end' : 'items-start'}`}
              >
                {msg.username !== username && (
                  <div className="opacity-70 text-xs flex items-center gap-2 mb-1 px-1">
                    <span className="font-medium">{msg.username}</span>
                    <span className="text-base-content/50">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                )}
                <div className={`rounded-lg break-words max-w-[75%] px-4 py-2 ${
                  msg.username === username 
                    ? theme === 'black'
                      ? 'bg-indigo-600 text-white shadow-[0_4px_6px_-1px_rgba(0,0,0,0.3)]' 
                      : 'bg-blue-600 text-white shadow-md'
                    : theme === 'black'
                      ? 'bg-zinc-700 text-white shadow-[0_4px_6px_-1px_rgba(0,0,0,0.3)]'
                      : 'bg-gray-200 text-gray-800 shadow-md'
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
    </div>
  );
}

export default ChatRoom;
