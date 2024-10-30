function ConfirmDeleteModal({ isOpen, onClose, onConfirm, filename }) {
  if (!isOpen) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4">Delete File</h3>
        <p className="py-4">
          Are you sure you want to delete <span className="font-semibold">{filename}</span>?
          <br />
          <span className="text-sm text-base-content/70">This action cannot be undone.</span>
        </p>
        <div className="modal-action">
          <button 
            className="btn btn-ghost"
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            className="btn btn-error"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDeleteModal; 