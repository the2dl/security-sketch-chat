import React, { useState } from 'react';
import SecretInput from '../SecretInput';
import { FaDownload, FaCopy } from 'react-icons/fa';

function SecretKeyModal({ isOpen, onClose, secretKey, username, roomName }) {
  const [isToastVisible, setToastVisible] = useState(false);

  const downloadKeyFile = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `secret-key_${roomName}_${timestamp}.txt`;
    const content = `Secret Key for ${roomName}
Generated: ${new Date().toLocaleString()}
Secret Key: ${secretKey}

This is the secret key needed to join this investigation room.
You can share this key with other investigators who need access.`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(secretKey);
      setToastVisible(true);
      setTimeout(() => {
        setToastVisible(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      {isToastVisible && (
        <div className="toast toast-top toast-center">
          <div className="alert alert-success">
            <span>Copied to clipboard!</span>
          </div>
        </div>
      )}
      <div className="modal-box bg-base-200 p-6 rounded-2xl shadow-lg max-w-sm mx-4">
        <h3 className="font-bold text-lg mb-4">Room Secret Key</h3>
        <div className="form-control">
          <SecretInput
            value={secretKey}
            readOnly={true}
          />
        </div>
        <div className="flex gap-2 mt-4">
          <button 
            className="btn btn-ghost gap-2 flex-1"
            onClick={copyToClipboard}
          >
            <FaCopy className="w-4 h-4" />
            Copy
          </button>
          <button 
            className="btn btn-ghost gap-2 flex-1"
            onClick={downloadKeyFile}
          >
            <FaDownload className="w-4 h-4" />
            Download
          </button>
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