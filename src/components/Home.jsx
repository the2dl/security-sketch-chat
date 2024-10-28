import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import { formatDistanceToNow } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

function Home() {
  const [sketchName, setSketchName] = useState('');
  const [activeRooms, setActiveRooms] = useState([]); // Initialize as empty array
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const roomsPerPage = 5;
  const [creatingSketch, setCreatingSketch] = useState(false);
  const [showRecoveryInput, setShowRecoveryInput] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [recoveryError, setRecoveryError] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [username, setUsername] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchActiveRooms();
  }, []);

  const fetchActiveRooms = async () => {
    try {
      setLoading(true);
      const response = await api.getActiveRooms();
      // Sort rooms by creation date (newest first)
      const sortedRooms = Array.isArray(response) 
        ? response.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        : [];
      setActiveRooms(sortedRooms);
    } catch (err) {
      setError('Failed to fetch active rooms');
      console.error(err);
      setActiveRooms([]);
    } finally {
      setLoading(false);
    }
  };

  const createNewSketch = async () => {
    if (!sketchName.trim() || !username.trim()) return;
    
    try {
      setError(null);
      setCreatingSketch(true);
      
      // Get existing userId or create new one
      const userId = localStorage.getItem('userId') || uuidv4();
      
      // Store username and userId in localStorage
      localStorage.setItem('username', username);
      localStorage.setItem('userId', userId);
      
      // Create room with username
      const room = await api.createRoom(sketchName, userId, username);
      
      if (!room || !room.id || !room.sketch_id) {
        throw new Error('Invalid room data received');
      }

      // Store room-specific userId after room is created
      localStorage.setItem(`userId_${room.id}`, userId);

      navigate(`/chat/${room.id}`, { 
        state: { 
          sketchName,
          secretKey: room.secret_key,
          isNewRoom: true,
          userId,
          username,
          sketch_id: room.sketch_id
        } 
      });
    } catch (err) {
      setError('Failed to create room: ' + (err.message || 'Unknown error'));
    } finally {
      setCreatingSketch(false);
      setShowCreateModal(false);
    }
  };

  const joinRoom = async (roomId) => {
    try {
      const roomDetails = await api.getRoomDetails(roomId);
      if (!roomDetails || !roomDetails.id) {
        throw new Error('Invalid room details received');
      }
      navigate(`/chat/${roomId}`, { 
        state: { 
          sketchName: roomDetails.name,
          isNewRoom: false
        } 
      });
    } catch (err) {
      setError('Failed to join room');
      console.error(err);
    }
  };

  const handleRecovery = async (roomId) => {
    try {
      setRecoveryError(null);
      console.log('Attempting recovery with key:', recoveryKey);
      const userData = await api.recoverSession(roomId, recoveryKey);
      
      // Add debug logging
      console.log('Recovery response:', userData);
      
      // Store original user ID for ANY user
      localStorage.setItem(`userId_${roomId}`, userData.userId);
      
      navigate(`/chat/${roomId}`, {
        state: {
          isRecovery: true,
          username: userData.username,
          userId: userData.userId,
          isOwner: userData.isOwner,  // Verify this is being set correctly
          roomName: userData.roomName
        }
      });
    } catch (error) {
      console.error('Recovery error:', error);
      setRecoveryError('Invalid recovery key');
    }
  };

  // Add debug logging
  console.log('Active Rooms:', activeRooms);

  // Add pagination calculation
  const indexOfLastRoom = currentPage * roomsPerPage;
  const indexOfFirstRoom = indexOfLastRoom - roomsPerPage;
  const currentRooms = activeRooms.slice(indexOfFirstRoom, indexOfLastRoom);
  const totalPages = Math.ceil(activeRooms.length / roomsPerPage);

  // Add this pagination handler
  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  const handleCreateClick = () => {
    // Pre-fill username if it exists in localStorage
    setUsername(localStorage.getItem('username') || '');
    setShowCreateModal(true);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] p-4 max-w-md mx-auto w-full">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-2 rounded-lg">Security Sketch</h1>
        <p className="text-base-content/70 rounded-lg">Create or join a secure sketching room</p>
      </div>

      {error && (
        <div className="alert alert-error mb-4">
          <span>{error}</span>
        </div>
      )}

      <div className="card bg-base-200 shadow-xl w-full rounded-2xl">
        <div className="card-body gap-6">
          {/* Create Sketch Section */}
          <div className="space-y-4">
            <h2 className="card-title text-xl">Create New Sketch</h2>
            <button 
              className="btn btn-primary w-full"
              onClick={handleCreateClick}
            >
              Create New Investigation
            </button>
          </div>

          <div className="divider rounded-full">OR</div>

          {/* Updated Rooms Section */}
          <div className="space-y-4">
            <h2 className="card-title text-xl">Investigation Rooms</h2>
            {loading ? (
              <div className="flex justify-center">
                <span className="loading loading-spinner loading-md"></span>
              </div>
            ) : !Array.isArray(activeRooms) ? (
              <div className="text-center text-base-content/70">
                Error loading rooms
              </div>
            ) : activeRooms.length === 0 ? (
              <div className="text-center text-base-content/70">
                No rooms available
              </div>
            ) : (
              <div className="space-y-2">
                {currentRooms.map((room) => (
                  <div 
                    key={room.id}
                    className={`flex items-center justify-between p-4 rounded-xl transition-colors
                      ${room.active 
                        ? 'bg-base-100 hover:bg-base-300 cursor-pointer' 
                        : 'bg-base-300/30 opacity-60 cursor-not-allowed hover:bg-base-300/30'
                      }`}
                    onClick={() => room.active && joinRoom(room.id)}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{room.name}</h3>
                        {!room.active && (
                          <span className="badge badge-sm badge-ghost bg-base-300">Investigation Complete</span>
                        )}
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-base-content/70">
                        <span>{room.participant_count || 0} participants</span>
                        <span>•</span>
                        <span>{formatDistanceToNow(new Date(room.created_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                    {room.active && (
                      <div className="flex gap-2">
                        <button 
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            joinRoom(room.id);
                          }}
                        >
                          Join
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowRecoveryInput(true);
                            setSelectedRoom(room);  // Store the selected room
                          }}
                        >
                          Recover
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                
                {/* Add pagination controls */}
                {activeRooms.length > roomsPerPage && (
                  <div className="flex justify-center items-center gap-2 mt-4">
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </button>
                    {[...Array(totalPages)].map((_, index) => (
                      <button
                        key={index + 1}
                        className={`btn btn-sm ${
                          currentPage === index + 1 ? 'btn-primary' : 'btn-ghost'
                        }`}
                        onClick={() => handlePageChange(index + 1)}
                      >
                        {index + 1}
                      </button>
                    ))}
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showRecoveryInput && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="modal-box bg-base-200 p-6 rounded-2xl shadow-lg max-w-sm mx-4">
            <h3 className="font-bold text-lg mb-4">Recover Session</h3>
            {recoveryError && (
              <div className="alert alert-error mb-4">
                <span>{recoveryError}</span>
              </div>
            )}
            <div className="form-control mb-6">
              <input
                type="text"
                placeholder="Enter recovery key"
                className="input input-bordered w-full"
                value={recoveryKey}
                onChange={(e) => setRecoveryKey(e.target.value)}
              />
            </div>
            <div className="modal-action">
              <button 
                className="btn btn-ghost"
                onClick={() => {
                  setShowRecoveryInput(false);
                  setRecoveryKey('');
                  setRecoveryError(null);
                  setSelectedRoom(null);  // Clear selected room
                }}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                onClick={() => {
                  if (selectedRoom) {
                    handleRecovery(selectedRoom.id);
                  }
                }}
                disabled={!recoveryKey.trim() || !selectedRoom}
              >
                Recover
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="modal-box bg-base-200 p-6 rounded-2xl shadow-lg max-w-sm mx-4">
            <h3 className="font-bold text-lg mb-4">Create New Investigation</h3>
            <div className="form-control gap-4">
              <div>
                <label className="label">
                  <span className="label-text">Investigation Name</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter investigation name"
                  className="input input-bordered w-full"
                  value={sketchName}
                  onChange={(e) => setSketchName(e.target.value)}
                />
              </div>
              <div>
                <label className="label">
                  <span className="label-text">Your Name</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  className="input input-bordered w-full"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-action">
              <button 
                className="btn btn-ghost"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                onClick={createNewSketch}
                disabled={!sketchName.trim() || !username.trim() || creatingSketch}
              >
                {creatingSketch ? (
                  <span className="loading loading-spinner loading-sm"></span>
                ) : (
                  'Create'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Home;
