import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

// Storage key for learning mode preference
const LEARNING_MODE_KEY = 'mdlh_learning_mode';

// Create context
const LearningModeContext = createContext(null);

// Learning mode settings
const DEFAULT_SETTINGS = {
  enabled: true,
  autoShowWork: true,          // Automatically show "Show My Work" for queries
  showTips: true,              // Show contextual tips
  highlightKeyColumns: true,   // Highlight important columns in results
  explainErrors: true,         // Show detailed error explanations
  difficultyFilter: 'all'      // 'all', 'beginner', 'intermediate', 'advanced'
};

// Provider component
export function LearningModeProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    // Load from localStorage on init
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
      const saved = localStorage.getItem(LEARNING_MODE_KEY);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Save settings to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LEARNING_MODE_KEY, JSON.stringify(settings));
    }
  }, [settings]);

  // Toggle learning mode on/off
  const toggleLearningMode = useCallback(() => {
    setSettings(prev => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  // Update a specific setting
  const updateSetting = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  // Reset to defaults
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const value = {
    ...settings,
    toggleLearningMode,
    updateSetting,
    resetSettings,
    isLearningMode: settings.enabled
  };

  return (
    <LearningModeContext.Provider value={value}>
      {children}
    </LearningModeContext.Provider>
  );
}

// Hook to use learning mode
export function useLearningMode() {
  const context = useContext(LearningModeContext);
  if (!context) {
    // Return a fallback for components outside the provider
    return {
      enabled: false,
      autoShowWork: false,
      showTips: false,
      highlightKeyColumns: false,
      explainErrors: false,
      difficultyFilter: 'all',
      toggleLearningMode: () => {},
      updateSetting: () => {},
      resetSettings: () => {},
      isLearningMode: false
    };
  }
  return context;
}

export default LearningModeContext;
