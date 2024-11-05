import { HiUserAdd } from 'react-icons/hi';
import { FaFileUpload, FaTrash, FaRobot, FaSync, FaUserShield, FaUserCog, FaUserPlus, FaUserMinus } from 'react-icons/fa';
import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import ConfirmDeleteModal from './modals/ConfirmDeleteModal';
import { api } from '../api/api';

function ActiveUsersSidebar({ 
  activeUsers, 
  username,
  selectedTeam,
  uploadedFiles,
  uploadProgress,
  onFileUpload,
  handleFileDownload,
  searchTerm,
  setSearchTerm,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  getDisplayedFiles,
  currentPage,
  setCurrentPage,
  onFileDelete,
  onRefreshFiles,
  isRoomOwner,
  onAddCoOwner,
  onRemoveCoOwner,
  coOwners = [],
  roomOwnerId,
  roomId
}) {
  const [fileToDelete, setFileToDelete] = useState(null);
  const { theme } = useTheme();
  const [forceUpdate, setForceUpdate] = useState(false);
  const [localActiveUsers, setLocalActiveUsers] = useState(activeUsers);
  const previousActiveUsersRef = useRef(activeUsers);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  useEffect(() => {
    const handleStorageChange = () => {
      setForceUpdate(prev => !prev);
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    if (!activeUsers) return;

    console.log('ActiveUsersSidebar received activeUsers update:', activeUsers);
    console.log('Previous local users state:', localActiveUsers);

    setLocalActiveUsers(prevUsers => {
      console.log('Updating local users. Previous state:', prevUsers);
      
      // Create a map of existing users for faster lookup
      const existingUsersMap = new Map(
        prevUsers?.map(user => [user.id, user]) || []
      );
      
      console.log('Existing users map:', existingUsersMap);
      
      // Update or add new users
      activeUsers.forEach(newUser => {
        console.log('Processing user:', newUser);
        const existingUser = existingUsersMap.get(newUser.id);
        if (existingUser) {
          console.log('Updating existing user:', existingUser);
          existingUsersMap.set(newUser.id, {
            ...existingUser,
            ...newUser,
            status: newUser.status !== existingUser.status ? newUser.status : existingUser.status
          });
        } else {
          console.log('Adding new user:', newUser);
          existingUsersMap.set(newUser.id, newUser);
        }
      });
      
      const updatedUsers = Array.from(existingUsersMap.values())
        .sort((a, b) => {
          const statusPriority = { active: 0, inactive: 1 };
          return statusPriority[a.status] - statusPriority[b.status];
        });

      console.log('Final updated users:', updatedUsers);
      return updatedUsers;
    });
    
    previousActiveUsersRef.current = activeUsers;
  }, [activeUsers]);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const MAX_FILES_BEFORE_SCROLL = 4;

  const handleDeleteClick = (file) => {
    setFileToDelete(file);
  };

  const handleConfirmDelete = async () => {
    if (fileToDelete) {
      await onFileDelete(fileToDelete.id);
      setFileToDelete(null);
    }
  };

  const getBotBadgeStyles = () => {
    if (theme === 'corporate') {
      return 'badge badge-primary bg-primary/10 border-primary/20 text-primary p-2 w-[180px] flex items-center justify-start';
    }
    // Dracula theme styles
    return 'badge badge-primary bg-purple-500/10 border-purple-500/20 text-purple-300 p-2 w-[180px] flex items-center justify-start';
  };

  const formatUserDisplay = (user) => {
    if (user.team) {
      return `${user.username}@${user.team.name}`;
    }
    return user.username;
  };

  const getUserStatusClass = (user) => {
    return user.status === 'active' 
      ? 'bg-success text-success-content'
      : 'bg-error text-error-content';
  };

  const renderUserBadge = (user) => {
    const currentUserId = localStorage.getItem(`userId_${roomId}`);
    const isActualRoomOwner = currentUserId === roomOwnerId;
    const isUserRoomOwner = user.id === roomOwnerId;
    const isUserCoOwner = coOwners.includes(user.id);
    const statusColor = getUserStatusClass(user);
    const statusText = user.status === 'active' ? 'Active' : 'Inactive';

    return (
      <div 
        key={user.username}
        className="flex items-center gap-1.5 group"
      >
        <div className="badge badge-primary bg-primary/10 border-primary/20 p-2 w-[180px] flex items-center justify-start">
          <div className={`w-1.5 h-1.5 ${statusColor} rounded-full shrink-0 mr-2 tooltip tooltip-right`} 
               data-tip={statusText}>
          </div>
          <FaUserCog className={`w-3.5 h-3.5 shrink-0 mr-2 ${
            user.status === 'active' ? 'text-primary' : 'text-base-300'
          }`} />
          <span className={`truncate text-base-content/70 ${
            user.status === 'inactive' ? 'opacity-50' : ''
          }`}>
            {formatUserDisplay(user)}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isUserRoomOwner && (
            <div className="tooltip tooltip-top" data-tip="Room Owner">
              <FaUserShield 
                className="w-3.5 h-3.5 text-yellow-500"
              />
            </div>
          )}
          {isUserCoOwner && (
            <div className="tooltip tooltip-top" data-tip="Co-Owner">
              <FaUserCog 
                className="w-3.5 h-3.5 text-gray-400"
              />
            </div>
          )}
          
          {isActualRoomOwner && !isUserRoomOwner && (
            !isUserCoOwner ? (
              <button
                onClick={() => onAddCoOwner(user.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity btn btn-ghost btn-xs text-success hover:bg-success/10 px-1"
                title="Make co-owner"
              >
                <FaUserPlus size={12} />
              </button>
            ) : (
              <button
                onClick={() => onRemoveCoOwner(user.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity btn btn-ghost btn-xs text-error hover:bg-error/10 px-1"
                title="Remove co-owner"
              >
                <FaUserMinus size={12} />
              </button>
            )
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="card-body">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-base-content/70">
            Active Users ({localActiveUsers.filter(u => u.status === 'active').length} online
            {localActiveUsers.filter(u => u.status === 'inactive').length > 0 && 
              `, ${localActiveUsers.filter(u => u.status === 'inactive').length} inactive`}
            )
          </h3>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className={getBotBadgeStyles()}>
            <div className="w-1.5 h-1.5 bg-primary rounded-full shrink-0 mr-2"></div>
            <FaRobot className="w-3.5 h-3.5 shrink-0 mr-2" />
            <span className="truncate text-left">sketchy@system</span>
          </div>
          
          {localActiveUsers.map(user => renderUserBadge(user))}
        </div>
      </div>

      <div className="border-t border-base-300 pt-6 px-6 pb-6 flex-1">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-info rounded-full"></div>
            <h3 className="font-semibold text-sm uppercase tracking-wide text-base-content/70">
              Evidence Files
            </h3>
          </div>
          {uploadedFiles.length === 0 && (
            <button 
              onClick={onRefreshFiles}
              className="btn btn-ghost btn-sm btn-square hover:bg-base-300"
              title="Refresh files"
            >
              <FaSync className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        
        <div className="space-y-4">
          <label className="flex flex-col gap-2">
            <div className="btn btn-sm btn-primary rounded-xl w-full normal-case">
              <input
                type="file"
                accept=".csv,.tsv,.txt"
                onChange={onFileUpload}
                className="hidden"
              />
              Upload File
            </div>
            <span className="text-xs text-base-content/70 text-center">
              Supports CSV, TSV, and TXT files
            </span>
          </label>

          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="w-full bg-base-300 rounded-full h-1.5">
              <div 
                className="bg-primary h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          )}

          {uploadedFiles.length > 0 && (
            <div className="border-t border-base-300 my-6"></div>
          )}

          {uploadedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-base-content/70 uppercase tracking-wide flex items-center gap-2">
                  Uploaded Files ({uploadedFiles.length})
                  <button 
                    onClick={onRefreshFiles}
                    className="btn btn-ghost btn-xs btn-square hover:bg-base-300"
                    title="Refresh files"
                  >
                    <FaSync className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <select 
                    className="select select-sm select-ghost"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="date">Date</option>
                    <option value="name">Name</option>
                  </select>
                  <button
                    onClick={() => setSortOrder(order => order === 'asc' ? 'desc' : 'asc')}
                    className="btn btn-ghost btn-sm btn-square"
                  >
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Search files..."
                  className="input input-sm input-bordered w-full rounded-xl mb-2"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className={`
                ${uploadedFiles.length > MAX_FILES_BEFORE_SCROLL ? 'max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-base-300 scrollbar-track-base-100' : ''}
                pr-2
              `}>
                {getDisplayedFiles().files.map((file) => (
                  <div 
                    key={file.id}
                    className="flex flex-col gap-1 p-2 bg-base-300/50 rounded-lg text-sm hover:bg-base-300 transition-colors duration-200 mb-2"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <button
                        onClick={() => handleFileDownload(file.id, file.original_filename)}
                        className="flex flex-col gap-1 flex-1 text-left min-w-0"
                      >
                        <span className="truncate font-medium hover:text-primary transition-colors max-w-[160px]">
                          {file.original_filename}
                        </span>
                        <div className="flex items-center justify-between text-xs text-base-content/70 space-x-2">
                          <span className="min-w-[80px]">{formatFileSize(file.file_size)}</span>
                          <span>{new Date(file.created_at).toLocaleString()}</span>
                        </div>
                      </button>
                      
                      <button
                        onClick={() => handleDeleteClick(file)}
                        className="btn btn-ghost btn-xs text-error hover:bg-error/10"
                        title="Delete file"
                      >
                        <FaTrash size={12} />
                      </button>
                    </div>
                    
                    {file.processing_error && (
                      <span className="text-xs text-error mt-1">
                        {file.processing_error}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {getDisplayedFiles().totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-4">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="btn btn-ghost btn-xs px-2"
                  >
                    ←
                  </button>
                  <span className="text-xs">
                    Page {currentPage} of {getDisplayedFiles().totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(getDisplayedFiles().totalPages, p + 1))}
                    disabled={currentPage === getDisplayedFiles().totalPages}
                    className="btn btn-ghost btn-xs px-2"
                  >
                    →
                  </button>
                </div>
              )}

              {/* No results message */}
              {searchTerm && getDisplayedFiles().totalFiles === 0 && (
                <div className="text-center text-sm text-base-content/50 py-4">
                  No files match your search
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDeleteModal
        isOpen={fileToDelete !== null}
        onClose={() => setFileToDelete(null)}
        onConfirm={handleConfirmDelete}
        filename={fileToDelete?.original_filename}
      />
    </div>
  );
}

export default ActiveUsersSidebar; 