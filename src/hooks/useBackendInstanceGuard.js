/**
 * useBackendInstanceGuard Hook
 * 
 * Detects when the backend has restarted and clears stale sessions.
 * 
 * The backend generates a unique SERVER_INSTANCE_ID on startup.
 * When the frontend loads, it compares the current backend instance ID
 * to the one it saw last time. If they differ, the backend has restarted
 * and any stored session ID is stale.
 * 
 * This prevents the "zombie session" problem where:
 * - Backend restarts (losing all session state)
 * - Frontend still has a sessionId in sessionStorage
 * - API calls fail mysteriously because the session doesn't exist
 * 
 * Result: After backend restart, user sees "Not connected" and can cleanly reconnect.
 * 
 * IMPROVEMENTS (from code review):
 * - Increased health check timeout from 5s to 10s
 * - Added grace period: requires 2 consecutive mismatches before clearing
 * - Uses deployment-level identifier when available (for load balancers)
 */

import { useEffect, useRef } from 'react';
import { createLogger } from '../utils/logger';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Keys in sessionStorage
const BACKEND_INSTANCE_KEY = 'MDLH_BACKEND_INSTANCE_ID';
const BACKEND_MISMATCH_COUNT_KEY = 'MDLH_BACKEND_MISMATCH_COUNT';
const SESSION_KEY = 'snowflake_session'; // Must match useSnowflake.js

// Configuration
const HEALTH_CHECK_TIMEOUT_MS = 10000; // 10 seconds (increased from 5)
const REQUIRED_MISMATCHES = 2; // Require 2 consecutive mismatches before clearing

const log = createLogger('BackendGuard');

/**
 * Hook that runs on app load to detect backend restarts.
 * 
 * If the backend has restarted since last visit:
 * - Clears the stale session from sessionStorage
 * - User will see "Not connected" state and can reconnect cleanly
 * 
 * Usage:
 * ```jsx
 * function App() {
 *   useBackendInstanceGuard();
 *   // rest of app...
 * }
 * ```
 */
export function useBackendInstanceGuard() {
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    // Only run once per app mount
    if (hasCheckedRef.current) {
      return;
    }
    hasCheckedRef.current = true;

    async function checkBackendInstance() {
      try {
        const res = await fetch(`${API_URL}/health`, {
          // Increased timeout for slower networks/backends
          signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
        });

        if (!res.ok) {
          log.warn('Health check failed', { status: res.status });
          return;
        }

        const data = await res.json();
        
        // Use deployment ID if available (for load balancers), fallback to instance ID
        const newInstanceId = data.deploymentId || data.serverInstanceId;

        if (!newInstanceId) {
          log.debug('No serverInstanceId in health response (old backend?)');
          return;
        }

        const storedInstanceId = window.sessionStorage.getItem(BACKEND_INSTANCE_KEY);

        // First run: just store the instance ID
        if (!storedInstanceId) {
          log.info('First visit - storing backend instance ID', { 
            instanceId: newInstanceId.substring(0, 8) + '...' 
          });
          window.sessionStorage.setItem(BACKEND_INSTANCE_KEY, newInstanceId);
          window.sessionStorage.setItem(BACKEND_MISMATCH_COUNT_KEY, '0');
          return;
        }

        // Check if backend restarted
        if (storedInstanceId !== newInstanceId) {
          // Grace period: require multiple consecutive mismatches
          const currentMismatches = parseInt(
            window.sessionStorage.getItem(BACKEND_MISMATCH_COUNT_KEY) || '0', 
            10
          ) + 1;
          
          log.warn('Backend instance mismatch detected', {
            oldInstance: storedInstanceId.substring(0, 8) + '...',
            newInstance: newInstanceId.substring(0, 8) + '...',
            mismatchCount: currentMismatches,
            requiredMismatches: REQUIRED_MISMATCHES,
          });
          
          window.sessionStorage.setItem(BACKEND_MISMATCH_COUNT_KEY, String(currentMismatches));
          
          // Only clear if we hit the threshold
          if (currentMismatches >= REQUIRED_MISMATCHES) {
            log.warn('Backend restart confirmed - clearing stale session');
            
            // Clear the stale session
            const hadSession = !!window.sessionStorage.getItem(SESSION_KEY);
            window.sessionStorage.removeItem(SESSION_KEY);
            
            // Store the new instance ID and reset counter
            window.sessionStorage.setItem(BACKEND_INSTANCE_KEY, newInstanceId);
            window.sessionStorage.setItem(BACKEND_MISMATCH_COUNT_KEY, '0');

            if (hadSession) {
              log.info('Stale session cleared - user will need to reconnect');
              
              // Dispatch a custom event so components can react
              window.dispatchEvent(new CustomEvent('snowflake-session-cleared', {
                detail: { reason: 'backend-restart' }
              }));
            }
          } else {
            log.debug(`Mismatch ${currentMismatches}/${REQUIRED_MISMATCHES} - waiting for confirmation`);
          }
        } else {
          // Instance matched - reset mismatch counter
          window.sessionStorage.setItem(BACKEND_MISMATCH_COUNT_KEY, '0');
          log.debug('Backend instance unchanged', { 
            instanceId: newInstanceId.substring(0, 8) + '...' 
          });
        }
      } catch (err) {
        // If health check fails, don't worry about it
        // The regular connection flow will handle errors
        if (err.name === 'TimeoutError' || err.name === 'AbortError') {
          log.debug('Health check timed out - backend may be slow/unreachable');
        } else {
          log.debug('Health check failed', { error: err.message });
        }
      }
    }

    checkBackendInstance();
  }, []);
}

/**
 * Utility to manually check if the backend has restarted.
 * Useful for programmatic checks outside React.
 * 
 * Note: This uses the grace period logic - won't immediately clear on first mismatch.
 * 
 * @param {boolean} forceCheck - If true, ignores grace period and clears immediately on mismatch
 * @returns {Promise<{restarted: boolean, cleared: boolean, mismatchCount: number}>}
 */
export async function checkBackendRestart(forceCheck = false) {
  try {
    const res = await fetch(`${API_URL}/health`, {
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
    });

    if (!res.ok) {
      return { restarted: false, cleared: false, mismatchCount: 0 };
    }

    const data = await res.json();
    const newInstanceId = data.deploymentId || data.serverInstanceId;

    if (!newInstanceId) {
      return { restarted: false, cleared: false, mismatchCount: 0 };
    }

    const storedInstanceId = window.sessionStorage.getItem(BACKEND_INSTANCE_KEY);

    if (!storedInstanceId) {
      window.sessionStorage.setItem(BACKEND_INSTANCE_KEY, newInstanceId);
      window.sessionStorage.setItem(BACKEND_MISMATCH_COUNT_KEY, '0');
      return { restarted: false, cleared: false, mismatchCount: 0 };
    }

    if (storedInstanceId !== newInstanceId) {
      const currentMismatches = parseInt(
        window.sessionStorage.getItem(BACKEND_MISMATCH_COUNT_KEY) || '0',
        10
      ) + 1;
      
      window.sessionStorage.setItem(BACKEND_MISMATCH_COUNT_KEY, String(currentMismatches));
      
      // Only clear if forced or hit threshold
      if (forceCheck || currentMismatches >= REQUIRED_MISMATCHES) {
        const hadSession = !!window.sessionStorage.getItem(SESSION_KEY);
        window.sessionStorage.removeItem(SESSION_KEY);
        window.sessionStorage.setItem(BACKEND_INSTANCE_KEY, newInstanceId);
        window.sessionStorage.setItem(BACKEND_MISMATCH_COUNT_KEY, '0');
        
        return { restarted: true, cleared: hadSession, mismatchCount: currentMismatches };
      }
      
      return { restarted: false, cleared: false, mismatchCount: currentMismatches };
    }

    // Match - reset counter
    window.sessionStorage.setItem(BACKEND_MISMATCH_COUNT_KEY, '0');
    return { restarted: false, cleared: false, mismatchCount: 0 };
  } catch {
    return { restarted: false, cleared: false, mismatchCount: 0 };
  }
}

export default useBackendInstanceGuard;

