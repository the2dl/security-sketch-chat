import React from 'react';

function ConfirmCloseModal({ isOpen, onClose, onConfirm, error }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="modal-box bg-base-200 p-6 rounded-2xl shadow-lg max-w-sm mx-4">
        <h3 className="font-bold text-lg mb-4">Close Investigation?</h3>
        <p className="text-base-content/70 mb-6">
          Are you sure you want to close this investigation? This action cannot be undone.
        </p>
        {error && (
          <div className="alert alert-error mb-4">
            <span>{error}</span>
          </div>
        )}
        <div className="modal-action flex gap-3">
          <button 
            className="btn btn-ghost rounded-xl"
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            className="btn btn-ghost hover:bg-red-500/10 text-red-500 hover:text-red-600 rounded-xl"
            onClick={onConfirm}
          >
            Close Investigation
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmCloseModal; 