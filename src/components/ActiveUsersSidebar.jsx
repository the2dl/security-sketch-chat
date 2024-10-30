import { HiUserAdd } from 'react-icons/hi';
import { FaFileUpload, FaTrash, FaRobot } from 'react-icons/fa';
import { useState } from 'react';
import ConfirmDeleteModal from './modals/ConfirmDeleteModal';

function ActiveUsersSidebar({ 
  activeUsers, 
  username,
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
}) {
  const [fileToDelete, setFileToDelete] = useState(null);

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

  return (
    <div className="flex flex-col h-full">
      {/* Active Users Section */}
      <div className="card-body">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-base-content/70">
            Active Users ({activeUsers.length})
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Bot user - always shown first */}
          <div className="badge badge-primary bg-purple-500/10 border-purple-500/20 text-purple-300 gap-2 p-3 rounded-lg">
            <FaRobot className="w-3.5 h-3.5" />
            SecurityBot
          </div>
          
          {/* Existing user badges */}
          {activeUsers.map(user => (
            <div 
              key={user.username}
              className="badge badge-primary bg-primary/10 border-primary/20 text-primary-content gap-2 p-3 rounded-lg"
            >
              <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
              {user.username}
            </div>
          ))}
        </div>
      </div>

      {/* Evidence Files Section */}
      <div className="border-t border-base-300 pt-6 px-6 pb-6 flex-1">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 bg-info rounded-full"></div>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-base-content/70">
            Evidence Files
          </h3>
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
                <div className="text-xs text-base-content/70 uppercase tracking-wide">
                  Uploaded Files ({uploadedFiles.length})
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