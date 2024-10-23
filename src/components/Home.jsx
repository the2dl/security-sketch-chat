import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import { formatDistanceToNow } from 'date-fns';

function Home() {
  const [sketchName, setSketchName] = useState('');
  const [activeRooms, setActiveRooms] = useState([]); // Initialize as empty array
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchActiveRooms();
  }, []);

  const fetchActiveRooms = async () => {
    try {
      setLoading(true);
      const response = await api.getActiveRooms();
      // Ensure we're setting an array
      setActiveRooms(Array.isArray(response) ? response : []);
    } catch (err) {
      setError('Failed to fetch active rooms');
      console.error(err);
      setActiveRooms([]); // Set to empty array on error
    } finally {
      setLoading(false);
    }
  };

  const createNewSketch = async () => {
    if (!sketchName.trim()) return;
    
    try {
      const room = await api.createRoom(sketchName);
      if (!room || !room.id) {
        throw new Error('Invalid room data received');
      }
      navigate(`/chat/${room.id}`, { 
        state: { 
          sketchName,
          secretKey: room.secret_key,
          isNewRoom: true
        } 
      });
    } catch (err) {
      setError('Failed to create room');
      console.error(err);
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
                disabled={!sketchName.trim()}
              >
                Create
              </button>
            </div>
          </div>

          <div className="divider rounded-full">OR</div>

          {/* Active Rooms Section with additional error checking */}
          <div className="space-y-4">
            <h2 className="card-title text-xl">Active Rooms</h2>
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
                No active rooms available
              </div>
            ) : (
              <div className="space-y-2">
                {activeRooms.map((room) => (
                  <div 
                    key={room.id}
                    className="flex items-center justify-between p-4 bg-base-100 rounded-xl hover:bg-base-300 transition-colors cursor-pointer"
                    onClick={() => joinRoom(room.id)}
                  >
                    <div className="space-y-1">
                      <h3 className="font-medium">{room.name}</h3>
                      <div className="flex items-center space-x-4 text-sm text-base-content/70">
                        <span>{room.participant_count || 0} participants</span>
                        <span>•</span>
                        <span>{formatDistanceToNow(new Date(room.created_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm">
                      Join
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;
