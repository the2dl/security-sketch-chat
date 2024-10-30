import React, { useEffect, useRef } from 'react';
import SecretInput from '../SecretInput';
import { FaDownload, FaCopy } from 'react-icons/fa';

function RecoveryKeyModal({ isOpen, onClose, recoveryKey, username, roomName }) {
  const initialDownloadDone = useRef(false);

  useEffect(() => {
    if (isOpen && recoveryKey && !initialDownloadDone.current) {
      downloadKeyFile();
      initialDownloadDone.current = true;
    }
  }, [isOpen, recoveryKey]);

  const downloadKeyFile = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `recovery-key_${username}_${roomName}_${timestamp}.txt`;
    const content = `Recovery Key for ${roomName}
Username: ${username}
Generated: ${new Date().toLocaleString()}
Recovery Key: ${recoveryKey}

Please keep this key safe. You'll need it to recover your session if you get disconnected.`;

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
      await navigator.clipboard.writeText(recoveryKey);
      // Optionally show a toast or some feedback
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="modal-box bg-base-200 p-6 rounded-2xl shadow-lg max-w-sm mx-4">
        <h3 className="font-bold text-lg mb-4">Your Recovery Key</h3>
        <p className="text-base-content/70 mb-4">
          Please save this recovery key. You'll need it to recover your session if you get disconnected.
          A file has been automatically downloaded to your computer.
        </p>
        <div className="form-control">
          <SecretInput
            value={recoveryKey}
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
            Download Again
          </button>
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