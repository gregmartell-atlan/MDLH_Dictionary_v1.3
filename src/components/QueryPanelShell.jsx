/**
 * QueryPanelShell - Reusable shell component for the slide-out panel
 * 
 * Handles:
 * - Backdrop with blur effect
 * - Click-outside to close
 * - Escape key to close
 * - Smooth slide animation
 * - Clean container for content modes
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';

export default function QueryPanelShell({ 
  isOpen, 
  onClose, 
  children,
  // Optional: allow blocking close (e.g., unsaved changes)
  onBeforeClose = null,
  maxWidth = 'max-w-2xl'
}) {
  const panelRef = useRef(null);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  
  // Handle close with optional confirmation
  const handleClose = useCallback(() => {
    if (onBeforeClose) {
      const shouldBlock = onBeforeClose();
      if (shouldBlock) {
        setShowDiscardDialog(true);
        return;
      }
    }
    onClose();
  }, [onClose, onBeforeClose]);
  
  // Confirm discard and close
  const handleConfirmDiscard = useCallback(() => {
    setShowDiscardDialog(false);
    onClose();
  }, [onClose]);
  
  // Cancel discard
  const handleCancelDiscard = useCallback(() => {
    setShowDiscardDialog(false);
  }, []);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target) && isOpen) {
        handleClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, handleClose]);

  return (
    <div className={`fixed inset-0 z-40 ${isOpen ? '' : 'pointer-events-none'}`}>
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      />
      
      {/* Panel */}
      <div
        ref={panelRef}
        className={`
          fixed top-0 right-0 h-full w-full ${maxWidth} bg-white shadow-xl
          transform transition-transform duration-300 ease-out flex flex-col
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
      
      {/* Discard Changes Dialog */}
      {showDiscardDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={handleCancelDiscard}
          />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Discard changes?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              You have unsaved changes to this query. Are you sure you want to discard them?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelDiscard}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDiscard}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

