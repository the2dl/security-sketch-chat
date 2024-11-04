import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import { useTheme } from '../context/ThemeContext';

function Admin() {
  const { theme } = useTheme();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [adminKey, setAdminKey] = useState('');
  const [teams, setTeams] = useState([]);
  const [newTeam, setNewTeam] = useState({ name: '', description: '' });
  const [error, setError] = useState(null);
  const [teamToDelete, setTeamToDelete] = useState(null);
  const [prompts, setPrompts] = useState({
    evidence_processor_prompt: '',
    sketch_operator_prompt: ''
  });
  const navigate = useNavigate();

  // Add useEffect for initial admin key check
  useEffect(() => {
    const storedKey = localStorage.getItem('adminKey');
    if (storedKey) {
      verifyAdminKey(storedKey);
    }
  }, []);

  // Add fetchTeams function
  const fetchTeams = async () => {
    try {
      const result = await api.getTeams();
      setTeams(result);
    } catch (err) {
      setError('Failed to fetch teams');
    }
  };

  // Add verifyAdminKey function
  const verifyAdminKey = async (key) => {
    try {
      const result = await api.verifyAdminKey(key);
      if (result.valid) {
        setIsAuthorized(true);
        localStorage.setItem('adminKey', key);
        fetchTeams(); // Fetch teams after authorization
      }
    } catch (err) {
      setError('Invalid admin key');
      localStorage.removeItem('adminKey');
    }
  };

  // Helper function to show toast
  const showToast = (message) => {
    // Remove any existing toasts
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(toast => toast.remove());

    // Create and show new toast
    const toast = document.createElement('div');
    toast.className = 'toast toast-top toast-end';
    toast.innerHTML = `
      <div class="alert alert-success">
        <span>${message}</span>
      </div>
    `;
    document.body.appendChild(toast);

    // Remove toast after 3 seconds
    setTimeout(() => {
      toast.remove();
    }, 3000);
  };

  const handleAddTeam = async (e) => {
    e.preventDefault();
    try {
      await api.createTeam(newTeam);
      showToast('Team added successfully');
      setNewTeam({ name: '', description: '' });
      fetchTeams();
    } catch (err) {
      setError('Failed to add team');
    }
  };

  const handleDeleteTeam = async () => {
    if (!teamToDelete) return;
    
    try {
      await api.deleteTeam(teamToDelete.id);
      showToast('Team deleted successfully');
      fetchTeams();
    } catch (err) {
      setError('Failed to delete team');
    } finally {
      setTeamToDelete(null); // Close modal
    }
  };

  // Add useEffect to fetch prompts
  useEffect(() => {
    if (isAuthorized) {
      fetchPrompts();
    }
  }, [isAuthorized]);

  const fetchPrompts = async () => {
    try {
      const result = await api.getPrompts();
      setPrompts(result);
    } catch (err) {
      setError('Failed to fetch prompts');
    }
  };

  const handleUpdatePrompts = async (e) => {
    e.preventDefault();
    try {
      await api.updatePrompts(prompts);
      showToast('Prompts updated successfully');
    } catch (err) {
      setError('Failed to update prompts');
    }
  };

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] p-4">
        <div className="card bg-base-200 shadow-xl w-full max-w-md">
          <div className="card-body">
            <h2 className="card-title">Admin Access</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <input
              type="password"
              placeholder="Enter admin key"
              className="input input-bordered w-full"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
            />
            <button 
              className="btn btn-primary"
              onClick={() => verifyAdminKey(adminKey)}
            >
              Verify Key
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Platform Administration</h1>
      
      {error && <div className="alert alert-error mb-4">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Teams Management */}
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Teams Management</h2>
            
            <form onSubmit={handleAddTeam} className="space-y-4">
              <input
                type="text"
                placeholder="Team Name"
                className="input input-bordered w-full"
                value={newTeam.name}
                onChange={(e) => setNewTeam({...newTeam, name: e.target.value})}
              />
              <input
                type="text"
                placeholder="Description"
                className="input input-bordered w-full"
                value={newTeam.description}
                onChange={(e) => setNewTeam({...newTeam, description: e.target.value})}
              />
              <button type="submit" className="btn btn-primary w-full">
                Add Team
              </button>
            </form>

            <div className="divider">Current Teams</div>
            
            <div className="space-y-2">
              {teams.map(team => (
                <div key={team.id} className="flex justify-between items-center p-3 bg-base-300 rounded-lg">
                  <div>
                    <h3 className="font-semibold">{team.name}</h3>
                    <p className="text-sm text-base-content/70">{team.description}</p>
                  </div>
                  <button 
                    className="btn btn-ghost btn-sm"
                    onClick={() => setTeamToDelete(team)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Prompts Management */}
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">AI Prompts Management</h2>
            
            <form onSubmit={handleUpdatePrompts} className="space-y-4">
              <div>
                <label className="label">
                  <span className="label-text">Evidence Processor Prompt</span>
                </label>
                <textarea
                  className="textarea textarea-bordered w-full h-48"
                  placeholder="Enter evidence processor prompt"
                  value={prompts.evidence_processor_prompt}
                  onChange={(e) => setPrompts({
                    ...prompts,
                    evidence_processor_prompt: e.target.value
                  })}
                />
              </div>

              <div>
                <label className="label">
                  <span className="label-text">Sketch Operator Prompt</span>
                </label>
                <textarea
                  className="textarea textarea-bordered w-full h-48"
                  placeholder="Enter sketch operator prompt"
                  value={prompts.sketch_operator_prompt}
                  onChange={(e) => setPrompts({
                    ...prompts,
                    sketch_operator_prompt: e.target.value
                  })}
                />
              </div>

              <button type="submit" className="btn btn-primary w-full">
                Update Prompts
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {teamToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="modal-box bg-base-200 p-6 rounded-2xl shadow-lg max-w-sm mx-4">
            <h3 className="font-bold text-lg mb-4">Delete Team</h3>
            <p className="text-base-content/70 mb-6">
              Are you sure you want to delete the team "{teamToDelete.name}"? This action cannot be undone.
            </p>
            <div className="modal-action flex gap-3">
              <button 
                className="btn btn-ghost"
                onClick={() => setTeamToDelete(null)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-error"
                onClick={handleDeleteTeam}
              >
                Delete Team
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Admin;