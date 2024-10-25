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
    if (!sketchName.trim()) return;
    
    try {
      setError(null);
      setCreatingSketch(true); // Start loading
      
      // Generate a temporary userId if one doesn't exist
      let userId = localStorage.getItem('userId');
      if (!userId) {
        userId = uuidv4();
        localStorage.setItem('userId', userId);
      }

      // Create room (which now includes Timesketch sketch creation)
      const room = await api.createRoom(sketchName, userId);
      
      if (!room || !room.id || !room.sketch_id) {
        throw new Error('Invalid room data received');
      }

      // Navigate to the new room
      navigate(`/chat/${room.id}`, { 
        state: { 
          sketchName,
          secretKey: room.secret_key,
          isNewRoom: true,
          userId,
          sketch_id: room.sketch_id // Pass sketch_id to chat room
        } 
      });
    } catch (err) {
      setError('Failed to create room: ' + (err.message || 'Unknown error'));
      console.error(err);
    } finally {
      setCreatingSketch(false); // Stop loading regardless of outcome
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
            <div className="join w-full rounded-xl overflow-hidden">
              <input
                type="text"
                placeholder="Enter sketch name..."
                className="input input-bordered join-item flex-1 focus:outline-none"
                value={sketchName}
                onChange={(e) => setSketchName(e.target.value)}
              />
              <button 
                className="btn btn-primary join-item !border-l-0"
                onClick={createNewSketch}
                disabled={!sketchName.trim() || creatingSketch}
              >
                {creatingSketch ? (
                  <span className="loading loading-spinner loading-sm"></span>
                ) : (
                  'Create'
                )}
              </button>
            </div>
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
                      <button 
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          joinRoom(room.id);
                        }}
                      >
                        Join
                      </button>
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
    </div>
  );
}

export default Home;
