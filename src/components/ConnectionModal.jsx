/**
 * Connection Modal - Updated to work with session-based backend
 * 
 * Key changes from original:
 * 1. Stores session ID from backend response
 * 2. Saves session to sessionStorage for persistence
 * 3. onConnect callback receives session info including sessionId
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Database, Eye, EyeOff, Loader2, CheckCircle, AlertCircle, Info, Key } from 'lucide-react';
import { createLogger } from '../utils/logger';

const log = createLogger('ConnectionModal');

// API base URL - configurable for different environments
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function ConnectionModal({ isOpen, onClose, onConnect, currentSession }) {
  const [authMethod, setAuthMethod] = useState('token');
  const [formData, setFormData] = useState({
    account: '',
    user: '',
    token: '',
    warehouse: 'COMPUTE_WH',
    database: 'ATLAN_MDLH',
    schema: 'PUBLIC',
    role: ''
  });
  const [showSecret, setShowSecret] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saveToStorage, setSaveToStorage] = useState(true);
  
  // Ref to store the AbortController so we can cancel ongoing requests
  const abortControllerRef = useRef(null);
  const timeoutIdRef = useRef(null);

  // Cancel any ongoing connection attempt
  const cancelConnection = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
    setTesting(false);
  }, []);

  // Handle modal close - cancel any pending requests
  const handleClose = useCallback(() => {
    cancelConnection();
    onClose();
  }, [cancelConnection, onClose]);

  // Load saved config on open, cleanup on close
  useEffect(() => {
    if (isOpen) {
      setTestResult(null);
      const saved = localStorage.getItem('snowflake_config');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setFormData(prev => ({ ...prev, ...parsed, token: '' }));
          if (parsed.authMethod) setAuthMethod(parsed.authMethod);
        } catch (e) {
          log.warn('Failed to load saved config');
        }
      }
    } else {
      // Modal is closing - cancel any pending requests
      cancelConnection();
    }
  }, [isOpen, cancelConnection]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }
    };
  }, []);

  const handleAuthMethodChange = (method) => {
    setAuthMethod(method);
    setTestResult(null);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    // Cancel any existing request first
    cancelConnection();
    
    setTesting(true);
    setTestResult(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    const timeoutMs = authMethod === 'sso' ? 120000 : 30000;
    timeoutIdRef.current = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const requestBody = {
        account: formData.account,
        user: formData.user,
        warehouse: formData.warehouse,
        database: formData.database,
        schema_name: formData.schema,  // Backend expects schema_name
        role: formData.role || undefined,
        auth_type: authMethod
      };

      if (authMethod === 'token') {
        requestBody.token = formData.token;
      }

      const response = await fetch(`${API_BASE_URL}/api/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
      const result = await response.json();

      if (result.connected && result.session_id) {
        // Success! We have a session
        const sessionInfo = {
          sessionId: result.session_id,
          user: result.user,
          warehouse: result.warehouse,
          database: result.database,
          role: result.role,
          connected: true
        };
        
        setTestResult(sessionInfo);

        // Save config (without token)
        if (saveToStorage) {
          const { token, ...configToSave } = formData;
          localStorage.setItem('snowflake_config', JSON.stringify({ 
            ...configToSave, 
            authMethod 
          }));
        }

        // Store session in sessionStorage for persistence across page loads
        const sessionData = {
          sessionId: result.session_id,
          user: result.user,
          warehouse: result.warehouse,
          database: result.database,
          schema: formData.schema || 'PUBLIC',
          role: result.role,
          timestamp: Date.now()
        };
        sessionStorage.setItem('snowflake_session', JSON.stringify(sessionData));
        log.info('Session saved to sessionStorage', {
          sessionId: result.session_id?.substring(0, 8) + '...',
          database: result.database,
          schema: formData.schema || 'PUBLIC',
          timestamp: new Date().toISOString()
        });
        
        // Verify it was saved
        const verify = sessionStorage.getItem('snowflake_session');
        log.debug('Session verification', { status: verify ? 'SAVED' : 'FAILED' });
        
        // Dispatch custom event to notify other components (including App.jsx)
        window.dispatchEvent(new CustomEvent('snowflake-session-changed', { 
          detail: { connected: true, sessionId: result.session_id }
        }));
        log.info('Dispatched snowflake-session-changed event');

        // Notify parent component
        onConnect?.(sessionInfo);
      } else if (result.connected) {
        // Legacy response without session_id (backward compatibility)
        setTestResult({
          connected: true,
          user: result.user,
          warehouse: result.warehouse,
          database: result.database,
          role: result.role
        });
        
        if (saveToStorage) {
          const { token, ...configToSave } = formData;
          localStorage.setItem('snowflake_config', JSON.stringify({ 
            ...configToSave, 
            authMethod 
          }));
        }
        
        onConnect?.(result);
      } else {
        setTestResult({ connected: false, error: result.error || 'Connection failed' });
      }
    } catch (err) {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      if (err.name === 'AbortError') {
        // Check if this was a manual cancel vs timeout
        if (!abortControllerRef.current) {
          // Manual cancel - don't show error
          setTestResult(null);
        } else {
          setTestResult({
            connected: false,
            error: authMethod === 'sso'
              ? 'SSO login timed out or was cancelled. Complete the login in the browser window.'
              : 'Connection timed out. Is the backend server running?'
          });
        }
      } else {
        setTestResult({ connected: false, error: err.message });
      }
    } finally {
      setTesting(false);
      abortControllerRef.current = null;
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleTestConnection();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-[#3366FF] p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Database size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Connect to Snowflake</h2>
                <p className="text-blue-100 text-sm">Enter your credentials to query MDLH</p>
              </div>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Auth Method Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Authentication Method</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleAuthMethodChange('token')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all ${
                  authMethod === 'token' ? 'border-[#3366FF] bg-blue-50 text-[#3366FF]' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <Key size={16} />
                <span className="font-medium">Access Token</span>
              </button>
              <button
                type="button"
                onClick={() => handleAuthMethodChange('sso')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all ${
                  authMethod === 'sso' ? 'border-[#3366FF] bg-blue-50 text-[#3366FF]' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <Database size={16} />
                <span className="font-medium">SSO / Browser</span>
              </button>
            </div>
          </div>

          {/* Account */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account Identifier *</label>
            <input
              type="text"
              value={formData.account}
              onChange={(e) => handleChange('account', e.target.value)}
              placeholder="abc12345.us-east-1"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3366FF] focus:border-transparent outline-none"
              required
            />
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <Info size={12} />
              Found in your Snowflake URL or Admin → Accounts
            </p>
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
            <input
              type="text"
              value={formData.user}
              onChange={(e) => handleChange('user', e.target.value)}
              placeholder="your_username@company.com"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3366FF] focus:border-transparent outline-none"
              required
            />
            {authMethod === 'sso' && (
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                <Info size={12} />
                Use your SSO email address
              </p>
            )}
          </div>

          {/* Token (only for token auth) */}
          {authMethod === 'token' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                <Key size={14} />
                Personal Access Token *
              </label>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={formData.token}
                  onChange={(e) => handleChange('token', e.target.value)}
                  placeholder="Paste your PAT here..."
                  className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3366FF] focus:border-transparent outline-none font-mono text-sm"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showSecret ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                <Info size={12} />
                Generate in Snowsight: User menu → Profile → Access Tokens
              </p>
            </div>
          )}

          {/* SSO Info */}
          {authMethod === 'sso' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800 flex items-start gap-2">
                <Info size={16} className="mt-0.5 flex-shrink-0" />
                <span>A browser window will open for SSO login. The backend must be running locally.</span>
              </p>
            </div>
          )}

          {/* Warehouse & Database */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse *</label>
              <input
                type="text"
                value={formData.warehouse}
                onChange={(e) => handleChange('warehouse', e.target.value)}
                placeholder="COMPUTE_WH"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3366FF] focus:border-transparent outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Database</label>
              <input
                type="text"
                value={formData.database}
                onChange={(e) => handleChange('database', e.target.value)}
                placeholder="ATLAN_MDLH"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3366FF] focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* Schema & Role */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Schema</label>
              <input
                type="text"
                value={formData.schema}
                onChange={(e) => handleChange('schema', e.target.value)}
                placeholder="PUBLIC"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3366FF] focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <input
                type="text"
                value={formData.role}
                onChange={(e) => handleChange('role', e.target.value)}
                placeholder="ACCOUNTADMIN"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3366FF] focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* Remember settings */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={saveToStorage}
              onChange={(e) => setSaveToStorage(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-[#3366FF] focus:ring-[#3366FF]"
            />
            <span className="text-sm text-gray-600">Remember connection settings</span>
          </label>

          {/* Test Result */}
          {testResult && (
            <div className={`p-4 rounded-lg flex items-start gap-3 ${
              testResult.connected ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
              {testResult.connected ? (
                <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5" size={20} />
              ) : (
                <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
              )}
              <div>
                <p className={`font-medium ${testResult.connected ? 'text-green-700' : 'text-red-700'}`}>
                  {testResult.connected ? 'Connected successfully!' : 'Connection failed'}
                </p>
                {testResult.connected ? (
                  <p className="text-green-600 text-sm mt-1">
                    {testResult.user}@{testResult.warehouse} • {testResult.sessionId ? 'Session active' : testResult.database}
                  </p>
                ) : (
                  <p className="text-red-600 text-sm mt-1">{testResult.error}</p>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
            >
              {testing ? 'Cancel' : 'Close'}
            </button>
            <button
              type="submit"
              disabled={testing || !formData.account || !formData.user || (authMethod === 'token' && !formData.token)}
              className="flex-1 px-4 py-2.5 bg-[#3366FF] text-white rounded-lg hover:bg-blue-600 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {testing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  {authMethod === 'sso' ? 'Waiting for SSO...' : 'Connecting...'}
                </>
              ) : (
                'Connect'
              )}
            </button>
          </div>
        </form>

        {/* Footer Note */}
        <div className="px-6 pb-5">
          <p className="text-xs text-gray-400 text-center">
            Your credentials are sent to the backend server at {API_BASE_URL}
          </p>
        </div>
      </div>
    </div>
  );
}
