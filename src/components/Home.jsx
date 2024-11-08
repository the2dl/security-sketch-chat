import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import { formatDistanceToNow } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { io } from 'socket.io-client';
import { Helmet } from 'react-helmet-async';

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
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedTeamDetails, setSelectedTeamDetails] = useState(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState(null);
  const [adminKey, setAdminKey] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [isInitialized, setIsInitialized] = useState(null);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [accessWord, setAccessWord] = useState('');
  const [accessError, setAccessError] = useState(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [showSetupModal, setShowSetupModal] = useState(false);

  useEffect(() => {
    fetchActiveRooms();
    fetchTeams();
  }, []);

  useEffect(() => {
    const checkInitialAccess = async () => {
      try {
        setIsChecking(true);
        const { initialized } = await api.checkAccessStatus();
        setIsInitialized(initialized);
        
        const sessionAccess = sessionStorage.getItem('hasAccess');
        if (sessionAccess === 'true') {
          setHasAccess(true);
          setIsChecking(false);
        } else {
          if (!initialized) {
            setShowSetupModal(true);
            setShowAccessModal(false);
          } else {
            setShowAccessModal(true);
            setShowSetupModal(false);
          }
          setIsChecking(false);
        }
      } catch (error) {
        console.error('Failed to check access status:', error);
        setIsChecking(false);
      }
    };

    checkInitialAccess();
  }, []);

  useEffect(() => {
    // Only set up socket if we're not initialized or if we need to show setup
    if (!isChecking && (!isInitialized || showSetupModal)) {
      console.log('Setting up socket connection for admin key...');
      
      const socket = io(process.env.REACT_APP_API_URL, {
        withCredentials: true,
        auth: { apiKey: process.env.REACT_APP_API_KEY },
        transports: ['websocket']
      });

      socket.on('connect', () => {
        console.log('Socket connected successfully');
      });

      socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
      });

      socket.on('initial_admin_key', ({ adminKey }) => {
        console.log('Received admin key:', adminKey);
        setAdminKey(adminKey);
        if (!isInitialized) {
          setShowSetupModal(true);
        }
      });

      return () => {
        console.log('Cleaning up socket connection');
        socket.off('initial_admin_key');
        socket.disconnect();
      };
    }
  }, [isChecking, isInitialized, showSetupModal]);

  // Add some debug logging
  useEffect(() => {
    console.log('Setup Modal State:', {
      isChecking,
      isInitialized,
      showSetupModal,
      hasAccess,
      adminKey
    });
  }, [isChecking, isInitialized, showSetupModal, hasAccess, adminKey]);

  const fetchTeams = async () => {
    try {
      const teamsData = await api.getTeams();
      setTeams(teamsData);
    } catch (error) {
      console.error('Failed to fetch teams:', error);
    }
  };

  useEffect(() => {
    const fetchTeamDetails = async () => {
      if (selectedTeam) {
        try {
          const teamDetails = await api.getTeamDetails(selectedTeam);
          setSelectedTeamDetails(teamDetails);
        } catch (error) {
          console.error('Failed to fetch team details:', error);
        }
      } else {
        setSelectedTeamDetails(null);
      }
    };

    fetchTeamDetails();
  }, [selectedTeam]);

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
    if (!sketchName.trim() || !username.trim() || !selectedTeam) return;
    
    try {
      setError(null);
      setCreatingSketch(true);
      
      const userId = localStorage.getItem('userId') || uuidv4();
      localStorage.setItem('username', username);
      localStorage.setItem('userId', userId);
      
      const room = await api.createRoom(sketchName, userId, username);
      
      if (!room || !room.id || !room.sketch_id) {
        throw new Error('Invalid room data received');
      }

      localStorage.setItem(`userId_${room.id}`, userId);

      navigate(`/chat/${room.id}`, { 
        state: { 
          sketchName,
          secretKey: room.secret_key,
          isNewRoom: true,
          userId,
          username,
          sketch_id: room.sketch_id,
          teamId: selectedTeam,
          teamDetails: selectedTeamDetails
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
    setJoiningRoomId(roomId);
    setUsername(localStorage.getItem('username') || '');
    setShowJoinModal(true);
  };

  const handleJoinRoom = async () => {
    if (!username.trim() || !selectedTeam) {
      setError('Username and team are required');
      return;
    }

    try {
      const roomDetails = await api.getRoomDetails(joiningRoomId);
      if (!roomDetails || !roomDetails.id) {
        throw new Error('Invalid room details received');
      }

      const userId = localStorage.getItem('userId') || uuidv4();
      localStorage.setItem('username', username);
      localStorage.setItem('userId', userId);
      localStorage.setItem(`userId_${joiningRoomId}`, userId);

      navigate(`/chat/${joiningRoomId}`, { 
        state: { 
          sketchName: roomDetails.name,
          isNewRoom: false,
          userId,
          username,
          teamId: selectedTeam,
          teamDetails: selectedTeamDetails
        } 
      });
    } catch (err) {
      setError('Failed to join room');
      console.error(err);
    } finally {
      setShowJoinModal(false);
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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(adminKey);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  // Update the handleModalClose function
  const handleModalClose = async () => {
    try {
      await api.acknowledgeAdminKey();
      setShowSetupModal(false);
      setShowAccessModal(false);
      setIsChecking(false);
    } catch (error) {
      console.error('Failed to acknowledge admin key:', error);
    }
  };

  const handleInitializeAccess = async () => {
    try {
      setAccessError(null);
      await api.initializeAccess(accessWord);
      setIsInitialized(true);
      setHasAccess(true);
      sessionStorage.setItem('hasAccess', 'true');
      
      if (adminKey) {
        await api.acknowledgeAdminKey();
        setShowSetupModal(false);
        setShowAccessModal(false);
        setIsChecking(false);
        navigate('/admin');
      }
    } catch (error) {
      setAccessError(error.message);
    }
  };

  const handleVerifyAccess = async () => {
    try {
      setAccessError(null);
      const { valid } = await api.verifyAccess(accessWord);
      if (valid) {
        setHasAccess(true);
        setShowAccessModal(false);
        sessionStorage.setItem('hasAccess', 'true');
        setIsChecking(false);
      } else {
        setAccessError('Invalid access word');
      }
    } catch (error) {
      setAccessError(error.message);
    }
  };

  return (
    <>
      <Helmet>
        <title>Security Sketch | Investigation Hub</title>
        <meta name="description" content="Create or join secure investigation rooms for collaborative security analysis and incident response." />
        <meta property="og:title" content="Security Sketch | Investigation Hub" />
        <meta property="og:description" content="Create or join secure investigation rooms for collaborative security analysis and incident response." />
      </Helmet>
      
      {isChecking ? (
        <div className="flex items-center justify-center min-h-screen">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      ) : (
        <>
          {showSetupModal && !isInitialized && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="modal-box bg-base-200 p-6 rounded-2xl shadow-lg max-w-md mx-4">
                <h3 className="font-bold text-xl mb-4">Security Sketch Setup</h3>
                
                <div className="alert alert-info mb-6">
                  <div>
                    <h4 className="font-semibold">Initial Setup Process:</h4>
                    <ol className="list-decimal list-inside mt-2 space-y-1">
                      <li>Set your system access word below</li>
                      <li>Save your admin key securely</li>
                      <li>After setup, you'll be taken to the admin page to:</li>
                      <ul className="list-disc list-inside ml-6 mt-1">
                        <li>Create investigation teams</li>
                        <li>Configure AI assistant prompts</li>
                      </ul>
                    </ol>
                  </div>
                </div>

                {/* Step 1: Access Word */}
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-semibold text-lg">Step 1: Set Access Word</h4>
                  </div>
                  <p className="text-base-content/70 mb-4">
                    Choose a memorable word that all users will need to access the system.
                  </p>
                  {accessError && (
                    <div className="alert alert-error mb-4">
                      <span>{accessError}</span>
                    </div>
                  )}
                  <input
                    type="password"
                    placeholder="Set access word"
                    className="input input-bordered w-full"
                    value={accessWord}
                    onChange={(e) => setAccessWord(e.target.value)}
                    autoFocus
                  />
                </div>

                {/* Step 2: Admin Key */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-semibold text-lg">Step 2: Save Admin Key</h4>
                  </div>
                  <p className="text-base-content/70 mb-4">
                    This is your administrator key for managing the system. Store it securely - it will only be shown once.
                  </p>
                  <div className="bg-base-300 p-3 rounded-lg flex items-center gap-2">
                    <code className="text-primary break-all font-mono flex-1">
                      {adminKey}
                    </code>
                    <button 
                      className={`btn btn-sm ${copySuccess ? 'btn-success' : 'btn-ghost'}`}
                      onClick={handleCopy}
                    >
                      {copySuccess ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="modal-action">
                  <button 
                    className="btn btn-primary"
                    onClick={handleInitializeAccess}
                    disabled={!accessWord.trim()}
                  >
                    Complete Setup & Continue to Admin
                  </button>
                </div>
              </div>
            </div>
          )}

          {hasAccess && (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] p-4 max-w-2xl mx-auto w-full">
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
                    <h2 className="card-title text-xl">Sketching Rooms</h2>
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
                      <div className="form-control">
                        <label className="label">
                          <span className="label-text">Team</span>
                        </label>
                        <select
                          className="select select-bordered w-full"
                          value={selectedTeam}
                          onChange={(e) => setSelectedTeam(e.target.value)}
                          required
                        >
                          <option value="">Select a team</option>
                          {teams.map(team => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
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
                        disabled={!sketchName.trim() || !username.trim() || !selectedTeam || creatingSketch}
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

              {showJoinModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="modal-box bg-base-200 p-6 rounded-2xl shadow-lg max-w-sm mx-4">
                    <h3 className="font-bold text-lg mb-4">Join Investigation</h3>
                    <div className="form-control gap-4">
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
                      <div className="form-control">
                        <label className="label">
                          <span className="label-text">Team</span>
                        </label>
                        <select
                          className="select select-bordered w-full"
                          value={selectedTeam}
                          onChange={(e) => setSelectedTeam(e.target.value)}
                          required
                        >
                          <option value="">Select a team</option>
                          {teams.map(team => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="modal-action">
                      <button 
                        className="btn btn-ghost"
                        onClick={() => {
                          setShowJoinModal(false);
                          setJoiningRoomId(null);
                        }}
                      >
                        Cancel
                      </button>
                      <button 
                        className="btn btn-primary"
                        onClick={handleJoinRoom}
                        disabled={!username.trim() || !selectedTeam}
                      >
                        Join
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showAccessModal && isInitialized && !hasAccess && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="modal-box bg-base-200 p-6 rounded-2xl shadow-lg max-w-md mx-4">
                    <h3 className="font-bold text-xl mb-6">Enter Access Word</h3>
                    {accessError && (
                      <div className="alert alert-error mb-4">
                        <span>{accessError}</span>
                      </div>
                    )}
                    <input
                      type="password"
                      placeholder="Enter access word"
                      className="input input-bordered w-full mb-4"
                      value={accessWord}
                      onChange={(e) => setAccessWord(e.target.value)}
                      autoFocus
                    />
                    <div className="modal-action">
                      <button 
                        className="btn btn-primary"
                        onClick={handleVerifyAccess}
                        disabled={!accessWord.trim()}
                      >
                        Verify
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

export default Home;
