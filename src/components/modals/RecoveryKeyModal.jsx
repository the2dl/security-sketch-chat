import React from 'react';
import SecretInput from '../SecretInput';

function RecoveryKeyModal({ isOpen, onClose, recoveryKey }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="modal-box bg-base-200 p-6 rounded-2xl shadow-lg max-w-sm mx-4">
        <h3 className="font-bold text-lg mb-4">Your Recovery Key</h3>
        <p className="text-base-content/70 mb-4">
          Please save this recovery key. You'll need it to recover your session if you get disconnected:
        </p>
        <div className="form-control">
          <SecretInput
            value={recoveryKey}
            readOnly={true}
          />
        </div>
        <div className="modal-action mt-6">
          <button 
            className="btn btn-primary rounded-xl"
            onClick={onClose}
          >
            I've Saved It
          </button>
        </div>
      </div>
    </div>
  );
}

export default RecoveryKeyModal; 