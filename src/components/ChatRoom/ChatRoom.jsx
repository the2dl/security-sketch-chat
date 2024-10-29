import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { FaExternalLinkAlt } from 'react-icons/fa';
import { HiOutlineLogout } from 'react-icons/hi';
import { api } from '../../api/api';

import ChatInput from './ChatInput';
import MessageList from './MessageList';
import UserSidebar from './UserSidebar';
import Modals from './Modals';
import JoinForm from './JoinForm'; // We should also create this component for the join form

function ChatRoom() {
  // State declarations
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [username, setUsername] = useState('');
  const [userId, setUserId] = useState(() => localStorage.getItem(`userId_${roomId}`) || null);
  const [isJoined, setIsJoined] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [activeUsers, setActiveUsers] = useState([]);
  const [error, setError] = useState(null);
  const [secretKey, setSecretKey] = useState(location.state?.secretKey || '');
  const [isRoomOwner, setIsRoomOwner] = useState(false);
  const [roomName, setRoomName] = useState('Security Sketch');
  const [sketchId, setSketchId] = useState(null);
  const [isRoomActive, setIsRoomActive] = useState(true);
  
  // Modal states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSecretKeyModal, setShowSecretKeyModal] = useState(false);
  const [showRecoveryKeyModal, setShowRecoveryKeyModal] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [closeError, setCloseError] = useState(null);

  // Room management functions
  const handleCloseRoom = () => setShowConfirmModal(true);

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

  // Message handling
  const sendMessage = async (e) => {
    e.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    try {
      const messageData = {
        content: trimmedMessage,
        username,
        timestamp: new Date(),
        roomId
      };

      setMessages(prev => [...prev, messageData]);
      setMessage('');

      await api.sendMessage({
        roomId,
        username,
        content: trimmedMessage
      });
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message');
      setMessages(prev => prev.filter(msg => msg.content !== trimmedMessage));
    }
  };

  // Join chat function
  const joinChat = async (e) => {
    e.preventDefault();
    
    try {
      setError(null);
      
      if (location.state?.isRecovery) {
        setUserId(location.state.userId);
        setUsername(location.state.username);
        setIsRoomOwner(location.state.isOwner);
        await api.joinRoom(roomId, location.state.username, secretKey, location.state.userId, location.state.isOwner);
      } else if (location.state?.isNewRoom) {
        setIsRoomOwner(true);
        await api.joinRoom(roomId, location.state.username, secretKey, location.state.userId, true);
      } else {
        await api.joinRoom(roomId, username, secretKey);
      }
      
      setIsJoined(true);
    } catch (err) {
      setError(err.message || 'Failed to join room');
      console.error(err);
    }
  };

  // Socket and room setup effect
  useEffect(() => {
    const socket = api.initSocket();
    
    api.onRoomJoined((data) => {
      setMessages(data.messages || []);
      setActiveUsers(data.activeUsers || []);
      setIsJoined(true);
      
      if (data.userId) {
        setUserId(data.userId);
        localStorage.setItem(`userId_${roomId}`, data.userId);
      }
      if (data.roomName) setRoomName(data.roomName);
      if (data.recoveryKey) {
        setRecoveryKey(data.recoveryKey);
        setShowRecoveryKeyModal(true);
      }
    });

    // Set up other socket listeners
    api.onUpdateActiveUsers(({ activeUsers }) => setActiveUsers(activeUsers));
    api.onUserJoined((user, updatedActiveUsers) => {
      if (updatedActiveUsers) {
        setActiveUsers(updatedActiveUsers);
      }
    });
    api.onUserLeft(({ username }) => {
      setActiveUsers(prev => prev.filter(u => u.username !== username));
    });
    api.onNewMessage((message) => {
      setMessages(prev => {
        const messageExists = prev.some(m => 
          m.id === message.id || 
          (m.content === message.content && m.username === message.username && !m.id)
        );
        
        if (messageExists) {
          return prev.map(m => 
            (m.content === message.content && m.username === message.username && !m.id)
              ? message 
              : m
          );
        }
        return [...prev, message];
      });
    });
    api.onError(({ message }) => setError(message));

    // Cleanup function
    return () => {
      if (userId) {
        api.leaveRoom(roomId, userId);
      }
      api.cleanup();
      api.disconnect();
    };
  }, [roomId, userId, isJoined]);

  // Room details effect
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

  if (!isJoined) {
    return <JoinForm 
      username={username}
      setUsername={setUsername}
      secretKey={secretKey}
      setSecretKey={setSecretKey}
      joinChat={joinChat}
      error={error}
      activeUsers={activeUsers}
      location={location}
    />;
  }

  return (
    <div className="grid grid-cols-4 gap-4 p-4 max-w-[1920px] mx-auto h-[calc(100vh-12rem)]">
      <UserSidebar activeUsers={activeUsers} />
      
      <div className="col-span-3 card bg-base-200 shadow-xl rounded-2xl max-h-[calc(100vh-12rem)] overflow-hidden relative">
        <div className="card-body flex flex-col h-full">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h2 className="card-title text-2xl font-bold">{roomName}</h2>
              <div className="badge badge-ghost gap-2">
                <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
                {username}
              </div>
            </div>
            
            {/* Action buttons */}
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
          
          <MessageList 
            messages={messages}
            username={username}
            activeUsers={activeUsers}
          />
          
          <ChatInput 
            username={username}
            message={message}
            setMessage={setMessage}
            sendMessage={sendMessage}
            activeUsers={activeUsers}
            roomName={roomName}
          />
        </div>
      </div>

      <Modals 
        showConfirmModal={showConfirmModal}
        showSecretKeyModal={showSecretKeyModal}
        showRecoveryKeyModal={showRecoveryKeyModal}
        secretKey={secretKey}
        recoveryKey={recoveryKey}
        closeError={closeError}
        setShowConfirmModal={setShowConfirmModal}
        setShowSecretKeyModal={setShowSecretKeyModal}
        setShowRecoveryKeyModal={setShowRecoveryKeyModal}
        confirmCloseRoom={confirmCloseRoom}
      />
    </div>
  );
}

export default ChatRoom; 