import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api/api';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { FaExternalLinkAlt, FaCopy, FaFileUpload, FaCode, FaFileContract, FaNetworkWired, FaLock } from 'react-icons/fa';
import { HiOutlineLogout, HiUserAdd } from 'react-icons/hi';
import ConfirmCloseModal from './modals/ConfirmCloseModal';
import SecretKeyModal from './modals/SecretKeyModal';
import RecoveryKeyModal from './modals/RecoveryKeyModal';
import SecretInput from './SecretInput';
import ActiveUsersSidebar from './ActiveUsersSidebar';
import BotMessage from './BotMessage';
import { FaRobot } from 'react-icons/fa';
import { processCommand } from './Commands';
import { FaTerminal, FaSlash } from 'react-icons/fa';
import { COMMANDS } from './Commands';
import { Helmet } from 'react-helmet-async';
import { SiVirustotal } from "react-icons/si";
import { TbWorldWww } from "react-icons/tb";

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

  const [showTeamSelect, setShowTeamSelect] = useState(false);

  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(() => {
    if (location.state?.teamDetails) {
      return location.state.teamDetails;
    }
    const storedTeam = localStorage.getItem(`team_${roomId}`);
    return storedTeam ? JSON.parse(storedTeam) : null;
  });

  const [coOwners, setCoOwners] = useState([]);

  const formatMessageContent = (content, username) => {
    // Add IP address regex before the existing URL regex
    const ipRegex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
    const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/g);
    
    return parts.map((part, index) => {
      // Handle multi-line code blocks
      if (part.startsWith('```') && part.endsWith('```')) {
        const code = part.slice(3, -3);
        const language = code.split('\n')[0].trim(); // Get potential language identifier
        const codeContent = language ? code.slice(language.length).trim() : code;
        
        return (
          <div key={index} className="relative my-3 max-w-full">
            <div className="absolute -top-2.5 left-3 px-2 py-0.5 rounded-md bg-[#282a36] text-[#bd93f9] text-xs font-mono border border-[#bd93f9]/20 flex items-center gap-1.5">
              <FaCode className="w-3 h-3" />
              {language || 'code'}
            </div>
            <pre className="bg-[#282a36] border border-[#bd93f9]/20 p-3 pt-4 rounded-lg font-mono text-sm overflow-x-auto text-[#f8f8f2] whitespace-pre-wrap break-words max-w-full">
              <code className="break-words whitespace-pre-wrap">
                {codeContent}
              </code>
            </pre>
          </div>
        );
      }
      
      // Handle inline code
      if (part.startsWith('`') && part.endsWith('`')) {
        const code = part.slice(1, -1);
        return (
          <code key={index} className="bg-[#282a36] border border-[#bd93f9]/10 px-1.5 py-0.5 rounded font-mono text-sm text-[#f8f8f2] whitespace-pre-wrap break-words">
            {code}
          </code>
        );
      }
      
      // For regular text, process IPs, URLs, and mentions
      let result = [];
      let lastIndex = 0;
      
      // First find and process IP addresses
      const ipMatches = [...part.matchAll(ipRegex)];
      ipMatches.forEach((match, i) => {
        // Add text before the IP
        if (match.index > lastIndex) {
          result.push(part.slice(lastIndex, match.index));
        }
        
        // Add the IP as a link
        result.push(
          <span key={`ip-${index}-${i}`}>
            <a 
              href={`https://spur.us/context/${match[0]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80 transition-opacity"
            >
              {match[0]}
            </a>
          </span>
        );
        
        lastIndex = match.index + match[0].length;
      });
      
      // Add remaining text
      if (lastIndex < part.length) {
        result.push(part.slice(lastIndex));
      }
      
      // Process URLs and mentions in the remaining text parts
      return result.map((item, i) => {
        if (typeof item === 'string') {
          // Process URLs and mentions as before
          const urlRegex = /(https?:\/\/[^\s]+)/g;
          const mentionRegex = /@(\w+)@(\w+)/g;
          const subParts = item.split(mentionRegex);
          
          return subParts.map((subPart, subIndex) => {
            if (subIndex % 3 === 0) {
              // First process IP addresses, then URLs in regular text
              const ipParts = subPart.split(ipRegex);
              return ipParts.map((text, i) => {
                if (text.match(ipRegex)) {
                  return (
                    <span key={`${index}-${subIndex}-${i}`} className="inline-flex items-center gap-1">
                      <a 
                        href={`https://spur.us/context/${text}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:opacity-80 transition-opacity"
                      >
                        {text}
                      </a>
                      <FaExternalLinkAlt className="w-3 h-3 opacity-50" />
                    </span>
                  );
                }
                
                // Process remaining URLs as before
                const urlParts = text.split(urlRegex);
                return urlParts.map((urlText, j) => {
                  if (urlText.match(urlRegex)) {
                    return (
                      <span key={`${index}-${subIndex}-${i}-${j}`} className="inline-flex items-center gap-1">
                        <a 
                          href={urlText}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:opacity-80 transition-opacity"
                        >
                          {urlText}
                        </a>
                        <FaExternalLinkAlt className="w-3 h-3 opacity-50" />
                      </span>
                    );
                  }
                  return urlText;
                });
              });
            }
            
            // Handle mentions as before
            if (subIndex % 3 === 1) {
              const mentionedUsername = subPart;
              const teamName = subParts[subIndex + 1];
              const isBot = mentionedUsername.toLowerCase() === 'sketchy';
              const isActiveUser = activeUsers.some(user => user.username.toLowerCase() === mentionedUsername.toLowerCase());
              const isMentionedUser = mentionedUsername.toLowerCase() === username.toLowerCase();
              
              let className = 'inline-block px-2 py-0.5 rounded-md font-medium ';
              if (theme === 'corporate') {
                if (isBot) {
                  className += 'bg-primary/25 text-primary-focus';
                } else if (isActiveUser) {
                  className += isMentionedUser
                    ? 'bg-primary/30 text-primary-focus'
                    : 'bg-neutral/25 text-neutral';
                }
              } else {
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
                  key={`${index}-${subIndex}`}
                  className={className}
                >
                  @{mentionedUsername}@{teamName}
                </span>
              );
            }
            return null;
          }).filter(Boolean);
        }
        return item;
      });
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

      // Add explicit room join for room creator
      if (location.state?.isNewRoom) {
        console.log('Room creator joining socket room:', roomId);
        socket.emit('join_socket_room', { roomId });
      }

      api.onRoomJoined(({ 
        messages: roomMessages, 
        activeUsers: roomUsers, 
        userId: newUserId, 
        roomName: newRoomName, 
        username: newUsername,
        recoveryKey: newRecoveryKey,
        team: userTeam,
        isRoomOwner: newIsRoomOwner,
        coOwners: roomCoOwners,
        room  // Add this to receive room data
      }) => {
        console.log('Room joined, active users:', roomUsers);
        
        // Force rejoin socket room after room_joined event
        socket.emit('join_socket_room', { roomId });
        
        // Send immediate keep-alive ping
        socket.emit('keep_alive', { roomId, userId: newUserId });
        
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
        
        if (userTeam) {
          console.log('Setting team:', userTeam);
          setSelectedTeam(userTeam);
          localStorage.setItem(`team_${roomId}`, JSON.stringify(userTeam));
        }
        
        if (newIsRoomOwner) {
          setIsRoomOwner(true);
          localStorage.setItem(`isRoomOwner_${roomId}`, 'true');
        }
        
        if (roomCoOwners) {
          setCoOwners(roomCoOwners);
          // If current user is in co-owners, they should have owner privileges
          if (newUserId && roomCoOwners.includes(newUserId)) {
            setIsRoomOwner(true);
            localStorage.setItem(`isRoomOwner_${roomId}`, 'true');
          }
        }
        if (room?.owner_id) {
          setRoomOwnerId(room.owner_id);
          console.log('Setting room owner ID:', room.owner_id); // Debug log
        }
      });

      api.onUserJoined((user, updatedActiveUsers) => {
        console.log('User joined, updated users:', updatedActiveUsers);
        if (updatedActiveUsers) {
          // Wrap in requestAnimationFrame to ensure DOM is ready
          requestAnimationFrame(() => {
            // Deduplicate by username
            const uniqueUsers = Array.from(
              new Map(updatedActiveUsers.map(user => [user.username, user])).values()
            );
            setActiveUsers(uniqueUsers);
            
            // Safely scroll to bottom
            try {
              if (messagesEndRef.current) {
                messagesEndRef.current.scrollIntoView({ 
                  behavior: 'smooth',
                  block: 'end'
                });
              }
            } catch (error) {
              console.warn('Scroll error:', error);
            }
          });
        }
      });

      api.onUpdateActiveUsers(({ activeUsers: updatedUsers }) => {
        console.log('Active users updated:', updatedUsers);
        // Deduplicate by username and ensure team info is preserved
        const uniqueUsers = Array.from(
          new Map(updatedUsers.map(user => [
            user.username, 
            {
              ...user,
              team: user.team || { name: 'sketch' } // Ensure team object exists
            }
          ])).values()
        );
        setActiveUsers(uniqueUsers);
      });

      api.onUserLeft(({ userId, username, team }) => {
        console.log('User left:', username);
        setActiveUsers(prevUsers => 
          prevUsers.filter(u => u.username !== username)
        );
        setMessages(prev => [...prev, {
          content: `${username}@${team?.name || 'sketch'} left the chat`,
          username: 'system',
          timestamp: new Date().toISOString(),
          isSystem: true
        }]);
      });

      api.onNewMessage((message) => {
        console.log('New message received in ChatRoom:', message);
        
        // Check for mentions
        if (message.content.includes(`@${username}@`) && message.username !== username) {
          sendNotification(message.username, message.content);
        }

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

      // More frequent keep-alive pings when active
      const keepAlivePing = setInterval(() => {
        if (isJoined && roomId && userId) {
          socket.emit('keep_alive', { roomId, userId });
        }
      }, 5000); // Every 5 seconds for more responsive status updates

      // Less frequent active users refresh
      const refreshInterval = setInterval(async () => {
        try {
          if (roomId && isJoined && userId) {
            const activeUsers = await api.getActiveUsers(roomId);
            setActiveUsers(prevUsers => {
              const currentIds = prevUsers.map(u => u.id).sort().join(',');
              const newIds = activeUsers.map(u => u.id).sort().join(',');
              return currentIds !== newIds ? activeUsers : prevUsers;
            });
          }
        } catch (error) {
          console.error('Error refreshing active users:', error);
        }
      }, 60000); // Every minute instead of 15 seconds

      // Add visibility change handler
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          // Immediately ping and refresh when tab becomes visible
          if (isJoined && roomId && userId) {
            socket.emit('keep_alive', { roomId, userId });
            api.getActiveUsers(roomId).then(setActiveUsers);
          }
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);

      // Add co-owner update listener
      api.onCoOwnerUpdated(({ userId, isCoOwner, coOwners }) => {
        console.log('Co-owner update received:', { userId, isCoOwner, coOwners });
        
        // Update coOwners state
        setCoOwners(coOwners);
        
        // If this update is for the current user, update their owner status
        const currentUserId = localStorage.getItem(`userId_${roomId}`);
        if (userId === currentUserId) {
          setIsRoomOwner(isCoOwner);
          if (isCoOwner) {
            localStorage.setItem(`isRoomOwner_${roomId}`, 'true');
          } else {
            localStorage.removeItem(`isRoomOwner_${roomId}`);
          }
        }
      });

      return () => {
        console.log('Cleaning up socket listeners');
        if (userId) {
          api.leaveRoom(roomId, userId);
        }
        api.cleanup();
        api.disconnect();
        clearInterval(refreshInterval);
        clearInterval(keepAlivePing);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
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

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const teamsData = await api.getTeams();
        setTeams(teamsData);
      } catch (error) {
        console.error('Error fetching teams:', error);
      }
    };

    fetchTeams();
  }, []);

  const handleTeamSelect = async (team) => {
    try {
      const teamDetails = await api.getTeamDetails(team.id);
      setSelectedTeam(teamDetails);
    } catch (error) {
      console.error('Error fetching team details:', error);
      setError('Failed to load team details');
    }
  };

  const joinChat = async (e) => {
    e.preventDefault();
    
    if (!username?.trim()) {
      setError('Username is required');
      return;
    }

    if (!selectedTeam && !location.state?.isRecovery) {
      setShowTeamSelect(true);
      return;
    }

    try {
      setError(null);
      const socket = api.initSocket();
      socket.emit('join_socket_room', { roomId });
      
      await api.joinRoom(
        roomId,
        username.trim(),
        secretKey,
        location.state?.userId || userId,
        location.state?.isOwner || false,
        selectedTeam?.id
      );
      
      localStorage.setItem(`username_${roomId}`, username.trim());
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
    
    setMessage('');
    
    try {
      // Process command first
      const commandResult = await processCommand(trimmedMessage);
      
      if (commandResult) {
        console.log('Sending command message:', commandResult);
        await api.sendMessage({
          roomId,
          username,
          content: commandResult.content,
          llm_required: commandResult.llm_required,
          messageType: commandResult.messageType,
          isError: commandResult.isError
        });
      } else if (trimmedMessage.toLowerCase().includes('@sketchy')) {
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
        // Regular message
        await api.sendMessage({
          roomId,
          username,
          content: trimmedMessage,
          llm_required: false,
          messageType: 'chat'
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message');
    }
  };

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      try {
        const messagesContainer = document.querySelector('.messages-container');
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ 
            behavior: 'smooth',
            block: 'end'
          });
        }
      } catch (error) {
        console.warn('Scroll error:', error);
      }
    });
  };

  useEffect(() => {
    // Add a small delay to ensure the DOM has updated
    const timeoutId = setTimeout(() => {
      scrollToBottom();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [messages]); // Only re-run when messages change

  useEffect(() => {
    if (isJoined) {
      messagesEndRef.current?.scrollIntoView({ 
        behavior: "smooth",
        block: "end"
      });
    }
  }, [messages]);

  const onEmojiSelect = (emoji) => {
    setMessage(prev => prev + emoji.native);
    setShowEmojiPicker(false);
  };

  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const textareaRef = useRef(null);

  const handleInput = (e) => {
    const value = e.target.value;
    setMessage(value);
    
    // Show command suggestions when / is typed at the start
    if (value === '/') {
      setShowCommandSuggestions(true);
    } else if (!value.startsWith('/') || value.includes(' ')) {
      // Hide suggestions if text doesn't start with / or if there's a space
      setShowCommandSuggestions(false);
    }
    
    // Existing mention logic
    if (value.includes('@')) {
      const lastMention = value.split('@').pop();
      setMentionFilter(lastMention);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }

    // Adjust textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleMentionClick = (username, teamName) => {
    const textarea = textareaRef.current;
    const text = textarea.value;
    const cursorPosition = textarea.selectionStart;
    
    const mentionStart = text.slice(0, cursorPosition).lastIndexOf('@');
    
    const newText = text.slice(0, mentionStart) + '@' + username + '@' + teamName + ' ' + text.slice(cursorPosition);
    
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
      formData.append('username', username);
      formData.append('team', selectedTeam?.name || 'sketch');

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

  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);

  const handleCommandSelect = (command) => {
    setMessage(`/${command} `);
    setShowCommandSuggestions(false);
    textareaRef.current?.focus();
  };

  const renderTeamSelect = () => {
    if (!showTeamSelect) return null;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-base-200 p-6 rounded-xl shadow-xl max-w-md w-full">
          <h3 className="text-lg font-bold mb-4">Select Your Team</h3>
          <div className="space-y-2">
            {teams.map(team => (
              <button
                key={team.id}
                onClick={async () => {
                  await handleTeamSelect(team);
                  setShowTeamSelect(false);
                  joinChat({ preventDefault: () => {} });
                }}
                className="btn btn-outline w-full justify-start normal-case"
              >
                {team.name}
                {team.description && (
                  <span className="text-xs text-base-content/70 ml-2">
                    - {team.description}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    const loadTeamDetails = async () => {
      if (!selectedTeam?.id) return;
      
      try {
        const teamDetails = await api.getTeamDetails(selectedTeam.id);
        setSelectedTeam(teamDetails);
        // Store in localStorage for persistence
        localStorage.setItem(`team_${roomId}`, JSON.stringify(teamDetails));
      } catch (error) {
        console.error('Error loading team details:', error);
      }
    };

    loadTeamDetails();
  }, [roomId]);

  const renderHeader = () => (
    <div className="flex items-center gap-4">
      <h2 className="card-title text-2xl font-bold">
        {roomName}
      </h2>
      {username && (
        <div className="badge badge-ghost gap-2">
          <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
          {username}@{selectedTeam?.name?.toLowerCase() || 'sketch'}
        </div>
      )}
    </div>
  );

  const renderInputPrompt = () => (
    <span className="font-mono text-base-content/70 pt-2.5 text-sm whitespace-nowrap">
      {username?.toLowerCase() || ''}@{selectedTeam?.name?.toLowerCase() || 'sketch'} ~/{roomName?.toLowerCase()}>
    </span>
  );

  useEffect(() => {
    const storedUsername = localStorage.getItem(`username_${roomId}`);
    const locationUsername = location.state?.username;
    
    if (locationUsername) {
      setUsername(locationUsername);
      localStorage.setItem(`username_${roomId}`, locationUsername);
    } else if (storedUsername) {
      setUsername(storedUsername);
    } else if (!username) {
      // If no username is found, show prompt or redirect
      navigate('/', { state: { error: 'Username is required' } });
    }
  }, [roomId, location.state?.username]);

  const handleAddCoOwner = async (userId) => {
    try {
      await api.addCoOwner(roomId, userId);
      setCoOwners(prev => [...prev, userId]);
    } catch (error) {
      console.error('Failed to add co-owner:', error);
      setError('Failed to add co-owner');
    }
  };

  const handleRemoveCoOwner = async (userId) => {
    try {
      await api.removeCoOwner(roomId, userId);
      setCoOwners(prev => prev.filter(id => id !== userId));
    } catch (error) {
      console.error('Failed to remove co-owner:', error);
      setError('Failed to remove co-owner');
    }
  };

  useEffect(() => {
    const socket = api.initSocket();
    
    // Listen for co-owner updates
    api.onCoOwnerUpdated(({ userId, isCoOwner, coOwners }) => {
      console.log('Co-owner update received:', { userId, isCoOwner, coOwners });
      
      // Update coOwners state
      setCoOwners(coOwners);
      
      // If this update is for the current user, update their owner status
      const currentUserId = localStorage.getItem(`userId_${roomId}`);
      if (userId === currentUserId) {
        setIsRoomOwner(isCoOwner);
        if (isCoOwner) {
          localStorage.setItem(`isRoomOwner_${roomId}`, 'true');
        } else {
          localStorage.removeItem(`isRoomOwner_${roomId}`);
        }
      }
    });

    return () => {
      api.cleanup();
    };
  }, [roomId]);

  // Add this effect to sync with localStorage
  useEffect(() => {
    const isOwner = localStorage.getItem(`isRoomOwner_${roomId}`) === 'true';
    setIsRoomOwner(isOwner);
  }, [roomId]);

  const [roomOwnerId, setRoomOwnerId] = useState(null);

  useEffect(() => {
    const socket = api.initSocket();
    if (!socket) return;

    api.onRoomJoined(({ 
      messages: roomMessages, 
      activeUsers: roomUsers, 
      userId: newUserId, 
      roomName: newRoomName, 
      username: newUsername,
      recoveryKey: newRecoveryKey,
      team: userTeam,
      isRoomOwner: newIsRoomOwner,
      coOwners: roomCoOwners,
      room  // Make sure this is coming through
    }) => {
      // ... existing code ...
      if (room?.owner_id) {
        setRoomOwnerId(room.owner_id);
        console.log('Setting room owner ID:', room.owner_id); // Debug log
      }
    });
  }, [roomId]);

  // Add new state for notification permission
  const [notificationPermission, setNotificationPermission] = useState(Notification.permission);

  // Add useEffect to request notification permission
  useEffect(() => {
    const requestNotificationPermission = async () => {
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
      }
    };

    requestNotificationPermission();
  }, []);

  // Add notification helper function
  const sendNotification = (mentionedBy, content) => {
    if (!isWindowFocused) {
      // Update unread count
      setUnreadMentions(prev => {
        const newCount = prev + 1;
        // Update title with count
        document.title = `(${newCount}) ${roomName}`;
        return newCount;
      });

      // Send notification if permitted
      if (notificationPermission === 'granted') {
        const notification = new Notification('New Mention in Security Sketch', {
          body: `${mentionedBy}: ${content}`,
          icon: '/logo192.png',
          badge: '/logo192.png',
          tag: 'mention',
          requireInteraction: true
        });

        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    }
  };

  // Add new state for unread mentions
  const [unreadMentions, setUnreadMentions] = useState(0);
  const [isWindowFocused, setIsWindowFocused] = useState(true);

  // Add useEffect for window focus handling
  useEffect(() => {
    const onFocus = () => {
      setIsWindowFocused(true);
      setUnreadMentions(0); // Reset count when window is focused
      document.title = roomName; // Reset title
    };

    const onBlur = () => {
      setIsWindowFocused(false);
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);

    // Set initial focus state
    setIsWindowFocused(document.hasFocus());

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, [roomName]);

  // Update the message handler
  useEffect(() => {
    api.onNewMessage((message) => {
      console.log('New message received in ChatRoom:', message);
      
      // Check for mentions
      if (message.content.includes(`@${username}@`) && message.username !== username) {
        sendNotification(message.username, message.content);
      }

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

    // Cleanup function
    return () => {
      document.title = 'Security Sketch'; // Reset title on unmount
    };
  }, [username, isWindowFocused]); // Add isWindowFocused to dependencies

  useEffect(() => {
    if (isJoined && roomId && userId) {
      // Send immediate keep-alive on join
      api.sendKeepAlive({ roomId, userId });
      
      // Set up more frequent keep-alive pings
      const keepAlivePing = setInterval(() => {
        api.sendKeepAlive({ roomId, userId });
      }, 3000); // Every 3 seconds

      return () => clearInterval(keepAlivePing);
    }
  }, [isJoined, roomId, userId]);

  // Add this effect to fetch all users when joining
  useEffect(() => {
    if (!isJoined || !roomId) return;

    const fetchInitialUsers = async () => {
      try {
        const users = await api.getActiveUsers(roomId);
        console.log('Initial users fetch:', users);
        setActiveUsers(users);
      } catch (error) {
        console.error('Error fetching initial users:', error);
      }
    };

    fetchInitialUsers();
  }, [isJoined, roomId]);

  // Update the socket event handlers
  useEffect(() => {
    if (!isJoined || !roomId) return;

    api.onUserJoined((user, updatedActiveUsers) => {
      console.log('User joined, updated users:', updatedActiveUsers);
      if (updatedActiveUsers) {
        setActiveUsers(prev => {
          const existingUsers = new Map(prev.map(u => [u.id, u]));
          updatedActiveUsers.forEach(user => existingUsers.set(user.id, user));
          return Array.from(existingUsers.values());
        });
      }
    });

    api.onUpdateActiveUsers(({ activeUsers: updatedUsers }) => {
      console.log('Active users updated:', updatedUsers);
      if (updatedUsers) {
        setActiveUsers(prev => {
          const existingUsers = new Map(prev.map(u => [u.id, u]));
          updatedUsers.forEach(user => existingUsers.set(user.id, user));
          return Array.from(existingUsers.values());
        });
      }
    });

    // ... other event handlers ...
  }, [isJoined, roomId]);

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
                      {user.username}@{user.team?.name || 'sketch'}
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
        {renderTeamSelect()}
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{`${roomName} | Secure Chat`}</title>
        <meta name="description" content={`Active investigation room: ${roomName}. Collaborate with team members in real-time.`} />
        <meta property="og:title" content={`${roomName} | Secure Chat`} />
        <meta property="og:description" content={`Active investigation room: ${roomName}. Collaborate with team members in real-time.`} />
      </Helmet>

      <div className="grid grid-cols-4 gap-4 p-4 max-w-[1920px] mx-auto h-[calc(100vh-12rem)]">
        <div className="col-span-1 card bg-base-200 shadow-xl rounded-2xl max-h-[calc(100vh-12rem)] overflow-hidden">
          <ActiveUsersSidebar 
            activeUsers={activeUsers}
            username={username}
            selectedTeam={selectedTeam}
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
            isRoomOwner={isRoomOwner}
            onAddCoOwner={handleAddCoOwner}
            onRemoveCoOwner={handleRemoveCoOwner}
            coOwners={coOwners}
            roomId={roomId}
            roomOwnerId={roomOwnerId}
          />
        </div>

        <div className="col-span-3 card bg-base-200 shadow-xl rounded-2xl max-h-[calc(100vh-12rem)] overflow-hidden relative">
          <div className="card-body flex flex-col h-full">
            <div className="flex justify-between items-center">
              {renderHeader()}
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
            
            <hr className="border-base-300 my-2" />
            
            <div className="flex-1 overflow-y-auto mt-4 space-y-4 pr-2 min-h-0 relative">
              {messages
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                .map((msg, index) => (
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
                          <span className="font-medium">
                            {msg.username}@{msg.team?.name || activeUsers.find(u => u.username === msg.username)?.team?.name || 'sketch'}
                          </span>
                          <span className="text-base-content/50">
                            {msg.timestamp && !isNaN(new Date(msg.timestamp).getTime())
                              ? new Date(msg.timestamp).toLocaleTimeString()
                              : new Date().toLocaleTimeString()
                            }
                          </span>
                        </div>
                      )}
                      <div className={`relative inline-block ${
                        (msg.messageType === 'command' || msg.message_type === 'command') ? 'ml-4' : ''
                      }`}>
                        {(msg.messageType === 'command' || msg.message_type === 'command') && (
                          <div className="absolute -top-2 -left-4 bg-base-200 rounded-full p-1 shadow-md z-10">
                            {msg.content.includes('IP information for') ? (
                              <FaNetworkWired className="w-3 h-3 text-blue-400" />
                            ) : msg.content.includes('VirusTotal results') ? (
                              <SiVirustotal className="w-3 h-3 text-indigo-400" />
                            ) : msg.content.includes('WHOIS lookup') ? (
                              <TbWorldWww className="w-3.h-3 text-indigo-400" />
                            ) : msg.content.includes('Base64 Decode') ? (
                              <FaLock className="w-3 h-3 text-green-400" />
                            ) : msg.content.includes('waves a security policy') ? (
                              <FaFileContract className="w-3 h-3 text-indigo-400" />
                            ) : msg.llm_required ? (
                              <FaRobot className="w-3 h-3 text-purple-400" />
                            ) : (
                              <FaTerminal className="w-3 h-3 text-indigo-400" />
                            )}
                          </div>
                        )}
                        <div className={`rounded-lg whitespace-normal ${
                          msg.isSystem 
                            ? msg.type === 'file-upload'
                              ? 'text-xs bg-primary/10 text-primary px-4 py-2 flex items-center gap-2'
                              : msg.type === 'user-join'
                                ? 'text-xs bg-success/10 text-success px-4 py-2 flex items-center gap-2'
                                : 'text-xs text-base-content/50 bg-base-300/30 px-3 py-1'
                            : msg.messageType === 'command' || msg.message_type === 'command'
                              ? `inline-block px-4 py-2 ${
                                  msg.llm_required || msg.content.includes('/whois') || msg.content.includes('/vt') || msg.content.includes('/ipinfo') || msg.content.includes('Base64 Decode')
                                    ? 'bg-purple-400/20 text-purple-300'  // Style for LLM-required commands
                                    : 'bg-indigo-400/20 text-indigo-400 italic'  // Style for other commands
                                }`
                              : `inline-block px-4 py-2 ${
                                msg.username === username 
                                  ? theme === 'black'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-blue-600 text-white'
                                  : theme === 'black'
                                    ? 'bg-zinc-700 text-white'
                                    : 'bg-gray-200 text-gray-800'
                              }`
                        }`}>
                          {msg.messageType === 'command' || msg.message_type === 'command' 
                            ? msg.llm_required || msg.content.includes('Base64 Decode')
                              ? (
                                <>
                                  <span className="text-xs font-medium mr-2">[AI Processing]</span>
                                  {formatMessageContent(msg.content, username)}
                                </>
                              )
                              : (
                                <>
                                  <span className="text-xs font-medium mr-2">*</span>
                                  <span>{msg.username} </span>
                                  {formatMessageContent(msg.content, username)}
                                </>
                              )
                            : msg.type === 'file-upload' 
                              ? (
                                <>
                                  <FaFileUpload className="w-3.5 h-3.5" />
                                  {msg.content}
                                </>
                              ) 
                              : formatMessageContent(msg.content, username)
                          }
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} className="h-px" />
            </div>

            <form onSubmit={sendMessage} className="flex gap-2 items-start relative">
              {renderInputPrompt()}
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
                        setShowCommandSuggestions(false);
                        setShowMentions(false);
                      }
                    }}
                  />
                  
                  {showCommandSuggestions && (
                    <div className="absolute bottom-full left-0 mb-2 w-64 bg-base-200 rounded-lg shadow-xl border border-base-300 overflow-hidden">
                      <div className="px-3 py-2 text-xs text-base-content/70 border-b border-base-300 font-medium">
                        Available Commands
                      </div>
                      {Object.entries(COMMANDS).map(([cmd, details]) => (
                        <button
                          key={cmd}
                          onClick={() => handleCommandSelect(cmd)}
                          className="w-full px-3 py-2 text-left hover:bg-base-300 flex items-start gap-2 group"
                        >
                          <div className="mt-0.5">
                            {cmd === 'slap' ? (
                              <FaFileContract className="w-3.5 h-3.5 text-indigo-400" />
                            ) : cmd === 'vt' ? (
                              <SiVirustotal className="w-3.5 h-3.5 text-indigo-400" />
                            ) : cmd === 'whois' ? (
                              <TbWorldWww className="w-3.5 h-3.5 text-indigo-400" />
                            ) : cmd === 'base64' ? (
                              <FaLock className="w-3.5 h-3.5 text-green-400" />
                            ) : (
                              <FaTerminal className="w-3.5 h-3.5 text-indigo-400" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-primary">/{cmd}</span>
                            </div>
                            <div className="text-xs text-base-content/70 mt-0.5">
                              {details.description}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  
                  {showMentions && (
                    <div className="fixed transform -translate-y-full left-auto mb-2 w-48 bg-base-200 rounded-lg shadow-xl border border-base-300 z-50">
                      {'sketchy'.includes(mentionFilter.toLowerCase()) && (
                        <button
                          onClick={() => handleMentionClick('sketchy', 'bot')}
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
                            onClick={() => handleMentionClick(user.username, user.team?.name || 'sketch')}
                            className="w-full px-4 py-2 text-left hover:bg-base-300 first:rounded-t-lg last:rounded-b-lg"
                          >
                            {user.username}@{user.team?.name || 'sketch'}
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
    </>
  );
}

export default ChatRoom;
