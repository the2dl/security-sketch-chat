import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import { useTheme } from '../context/ThemeContext';
import { Helmet } from 'react-helmet';

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

  return (
    <>
      <Helmet>
        <title>Security Sketch | Admin Panel</title>
        <meta name="description" content="Administrative panel for managing teams and AI prompts in Security Sketch." />
        <meta property="og:title" content="Security Sketch | Admin Panel" />
        <meta property="og:description" content="Administrative panel for managing teams and AI prompts in Security Sketch." />
      </Helmet>

      {!isAuthorized ? (
        <div className="hero min-h-[calc(100vh-8rem)]">
          <div className="hero-content flex-col lg:flex-row-reverse">
            <div className="text-center lg:text-left lg:ml-8">
              <h1 className="text-5xl font-bold">Admin Access</h1>
              <p className="py-6">Please enter your admin key to access the platform administration panel.</p>
            </div>
            <div className="card flex-shrink-0 w-full max-w-sm shadow-2xl bg-base-200">
              <div className="card-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="form-control">
                  <input
                    type="password"
                    placeholder="Enter admin key"
                    className="input input-bordered"
                    value={adminKey}
                    onChange={(e) => setAdminKey(e.target.value)}
                  />
                </div>
                <div className="form-control mt-6">
                  <button 
                    className="btn btn-primary"
                    onClick={() => verifyAdminKey(adminKey)}
                  >
                    Verify Key
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="container mx-auto p-4 max-w-5xl">
          <h1 className="text-3xl font-bold mb-8">Platform Administration</h1>
          
          {error && <div className="alert alert-error mb-6">{error}</div>}

          <div className="space-y-8">
            {/* Teams Management */}
            <div className="card bg-base-200 shadow-xl">
              <div className="card-body">
                <div className="flex justify-between items-center">
                  <h2 className="card-title text-2xl">Teams Management</h2>
                  <div className="badge badge-primary">{teams.length} Teams</div>
                </div>
                
                <div className="divider"></div>
                
                <form onSubmit={handleAddTeam} className="flex gap-4 mb-6">
                  <input
                    type="text"
                    placeholder="Team Name"
                    className="input input-bordered flex-1"
                    value={newTeam.name}
                    onChange={(e) => setNewTeam({...newTeam, name: e.target.value})}
                  />
                  <input
                    type="text"
                    placeholder="Description"
                    className="input input-bordered flex-1"
                    value={newTeam.description}
                    onChange={(e) => setNewTeam({...newTeam, description: e.target.value})}
                  />
                  <button type="submit" className="btn btn-primary">
                    Add Team
                  </button>
                </form>
                
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Team Name</th>
                        <th>Description</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teams.map(team => (
                        <tr key={team.id}>
                          <td className="font-medium">{team.name}</td>
                          <td className="text-base-content/70">{team.description}</td>
                          <td>
                            <button 
                              className="btn btn-ghost btn-sm text-error"
                              onClick={() => setTeamToDelete(team)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* AI Prompts Management */}
            <div className="card bg-base-200 shadow-xl">
              <div className="card-body">
                <h2 className="card-title text-2xl mb-6">AI Prompts Management</h2>
                
                <form onSubmit={handleUpdatePrompts} className="space-y-6">
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text text-lg font-medium">Evidence Processor Prompt</span>
                    </label>
                    <textarea
                      className="textarea textarea-bordered min-h-[200px] font-mono text-sm"
                      placeholder="Enter evidence processor prompt"
                      value={prompts.evidence_processor_prompt}
                      onChange={(e) => setPrompts({
                        ...prompts,
                        evidence_processor_prompt: e.target.value
                      })}
                    />
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text text-lg font-medium">Sketch Operator Prompt</span>
                    </label>
                    <textarea
                      className="textarea textarea-bordered min-h-[200px] font-mono text-sm"
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
            <div className="modal modal-open">
              <div className="modal-box">
                <h3 className="font-bold text-lg">Delete Team</h3>
                <p className="py-4">
                  Are you sure you want to delete the team "{teamToDelete.name}"? This action cannot be undone.
                </p>
                <div className="modal-action">
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
      )}
    </>
  );
}

export default Admin;