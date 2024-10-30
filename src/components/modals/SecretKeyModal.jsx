import React from 'react';
import SecretInput from '../SecretInput';

function SecretKeyModal({ isOpen, onClose, secretKey }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="modal-box bg-base-200 p-6 rounded-2xl shadow-lg max-w-sm mx-4">
        <h3 className="font-bold text-lg mb-4">Room Secret Key</h3>
        <div className="form-control">
          <SecretInput
            value={secretKey}
            readOnly={true}
          />
        </div>
        <div className="modal-action mt-6">
          <button 
            className="btn btn-ghost rounded-xl"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default SecretKeyModal; 