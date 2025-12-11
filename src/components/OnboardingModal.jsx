import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Database, Code2, BookOpen, Search, Sparkles, GraduationCap, Users, Check, Play, Lightbulb } from 'lucide-react';

// Storage key for first-visit tracking
const ONBOARDING_STORAGE_KEY = 'mdlh_onboarding_completed';
const ONBOARDING_ROLE_KEY = 'mdlh_user_role';

// Check if this is the first visit
export function isFirstVisit() {
  if (typeof window === 'undefined') return false;
  return !localStorage.getItem(ONBOARDING_STORAGE_KEY);
}

// Mark onboarding as completed
export function markOnboardingComplete(role = null) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
  if (role) {
    localStorage.setItem(ONBOARDING_ROLE_KEY, role);
  }
}

// Get saved user role
export function getUserRole() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ONBOARDING_ROLE_KEY);
}

// Reset onboarding (for testing or re-onboarding)
export function resetOnboarding() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  localStorage.removeItem(ONBOARDING_ROLE_KEY);
}

// User role definitions with tailored content
const USER_ROLES = [
  {
    id: 'csm',
    label: 'Customer Success Manager',
    shortLabel: 'CSM',
    icon: Users,
    description: 'Learn MDLH to help customers get value from their metadata',
    recommendedQueries: ['popular-tables', 'recent-queries', 'data-freshness'],
    tipFocus: 'customer-value'
  },
  {
    id: 'data-analyst',
    label: 'Data Analyst',
    shortLabel: 'Analyst',
    icon: Search,
    description: 'Discover data assets and understand data lineage',
    recommendedQueries: ['lineage-tracking', 'column-search', 'usage-metrics'],
    tipFocus: 'data-discovery'
  },
  {
    id: 'data-engineer',
    label: 'Data Engineer',
    shortLabel: 'Engineer',
    icon: Code2,
    description: 'Build queries and integrate with data pipelines',
    recommendedQueries: ['schema-info', 'table-ddl', 'process-lineage'],
    tipFocus: 'sql-patterns'
  },
  {
    id: 'explorer',
    label: 'Just Exploring',
    shortLabel: 'Explorer',
    icon: Lightbulb,
    description: 'Learning about MDLH and its capabilities',
    recommendedQueries: ['entity-overview', 'sample-data', 'glossary-terms'],
    tipFocus: 'basics'
  }
];

// Onboarding steps
const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to MDLH Dictionary',
    subtitle: 'Your guide to Atlan\'s Metadata Lakehouse'
  },
  {
    id: 'role',
    title: 'Tell us about yourself',
    subtitle: 'We\'ll customize your experience'
  },
  {
    id: 'tour',
    title: 'Quick Tour',
    subtitle: 'Key features you\'ll use most'
  },
  {
    id: 'ready',
    title: 'You\'re Ready!',
    subtitle: 'Start exploring MDLH'
  }
];

// Tour features
const TOUR_FEATURES = [
  {
    id: 'entity-browser',
    title: 'Entity Browser',
    description: 'Browse all 150+ entity types organized by category',
    icon: Database,
    tip: 'Use the sidebar to navigate between categories'
  },
  {
    id: 'query-library',
    title: 'Query Library',
    description: '100+ pre-built queries for common tasks',
    icon: BookOpen,
    tip: 'Click "View All Queries" to see examples by category'
  },
  {
    id: 'sql-editor',
    title: 'SQL Editor',
    description: 'Write and test queries with smart autocomplete',
    icon: Code2,
    tip: 'Click the "Query" button on any entity to see its SQL'
  },
  {
    id: 'demo-mode',
    title: 'Demo Mode',
    description: 'Explore with sample data - no connection needed',
    icon: Sparkles,
    tip: 'All queries return realistic demo data'
  }
];

export default function OnboardingModal({ isOpen, onClose, onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedRole, setSelectedRole] = useState(null);
  const [tourIndex, setTourIndex] = useState(0);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setSelectedRole(null);
      setTourIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const step = ONBOARDING_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    markOnboardingComplete(selectedRole);
    onComplete?.(selectedRole);
    onClose();
  };

  const handleSkip = () => {
    markOnboardingComplete();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleSkip}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        {/* Progress indicator */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gray-100">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${((currentStep + 1) / ONBOARDING_STEPS.length) * 100}%` }}
          />
        </div>

        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors z-10"
          title="Skip onboarding"
        >
          <X size={20} />
        </button>

        {/* Content */}
        <div className="pt-8 pb-6 px-8">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {ONBOARDING_STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === currentStep
                    ? 'w-6 bg-blue-500'
                    : i < currentStep
                      ? 'bg-blue-300'
                      : 'bg-gray-200'
                }`}
              />
            ))}
          </div>

          {/* Step content */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">{step.title}</h2>
            <p className="text-gray-500 mt-1">{step.subtitle}</p>
          </div>

          {/* Step-specific content */}
          {step.id === 'welcome' && (
            <div className="space-y-6">
              <div className="flex justify-center">
                <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <Database size={48} className="text-white" />
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-6 space-y-4">
                <p className="text-gray-700 text-center">
                  MDLH Dictionary helps you explore and query <strong>Atlan's Metadata Lakehouse</strong> -
                  a Snowflake database containing all your data catalog metadata.
                </p>
                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">150+</div>
                    <div className="text-xs text-gray-500">Entity Types</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">100+</div>
                    <div className="text-xs text-gray-500">Query Templates</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">SQL</div>
                    <div className="text-xs text-gray-500">Native Access</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step.id === 'role' && (
            <div className="grid grid-cols-2 gap-3">
              {USER_ROLES.map(role => {
                const Icon = role.icon;
                const isSelected = selectedRole === role.id;
                return (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRole(role.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        <Icon size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{role.shortLabel}</span>
                          {isSelected && <Check size={14} className="text-blue-500" />}
                        </div>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{role.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {step.id === 'tour' && (
            <div className="space-y-4">
              {/* Feature cards carousel */}
              <div className="relative">
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6">
                  {(() => {
                    const feature = TOUR_FEATURES[tourIndex];
                    const Icon = feature.icon;
                    return (
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-white rounded-xl shadow-sm">
                          <Icon size={28} className="text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 text-lg">{feature.title}</h3>
                          <p className="text-gray-600 mt-1">{feature.description}</p>
                          <div className="flex items-start gap-2 mt-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                            <Lightbulb size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-amber-800">{feature.tip}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Feature indicators */}
              <div className="flex items-center justify-center gap-2">
                {TOUR_FEATURES.map((f, i) => (
                  <button
                    key={f.id}
                    onClick={() => setTourIndex(i)}
                    className={`w-2.5 h-2.5 rounded-full transition-all ${
                      i === tourIndex ? 'bg-blue-500 scale-125' : 'bg-gray-300 hover:bg-gray-400'
                    }`}
                    title={f.title}
                  />
                ))}
              </div>

              {/* Feature mini nav */}
              <div className="flex justify-between items-center px-4">
                <button
                  onClick={() => setTourIndex(prev => Math.max(0, prev - 1))}
                  disabled={tourIndex === 0}
                  className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-400">{tourIndex + 1} of {TOUR_FEATURES.length}</span>
                <button
                  onClick={() => setTourIndex(prev => Math.min(TOUR_FEATURES.length - 1, prev + 1))}
                  disabled={tourIndex === TOUR_FEATURES.length - 1}
                  className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {step.id === 'ready' && (
            <div className="space-y-6">
              <div className="flex justify-center">
                <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center shadow-lg animate-pulse">
                  <Check size={40} className="text-white" />
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="font-semibold text-gray-900 mb-3 text-center">Quick Start Suggestions</h3>
                <div className="space-y-2">
                  <button className="w-full flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left">
                    <Play size={18} className="text-blue-600" />
                    <div>
                      <div className="font-medium text-gray-900">Try a Sample Query</div>
                      <div className="text-xs text-gray-500">See TABLE_ENTITY data in action</div>
                    </div>
                  </button>
                  <button className="w-full flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left">
                    <BookOpen size={18} className="text-blue-600" />
                    <div>
                      <div className="font-medium text-gray-900">Browse Query Library</div>
                      <div className="text-xs text-gray-500">100+ pre-built queries by category</div>
                    </div>
                  </button>
                  <button className="w-full flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left">
                    <GraduationCap size={18} className="text-blue-600" />
                    <div>
                      <div className="font-medium text-gray-900">Learn SQL Patterns</div>
                      <div className="text-xs text-gray-500">MDLH-specific query techniques</div>
                    </div>
                  </button>
                </div>
              </div>

              {selectedRole && (
                <p className="text-center text-sm text-gray-500">
                  We've customized suggestions for <span className="font-medium text-gray-700">
                    {USER_ROLES.find(r => r.id === selectedRole)?.label}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer with navigation */}
        <div className="px-8 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Skip
          </button>

          <div className="flex items-center gap-3">
            {!isFirstStep && (
              <button
                onClick={handlePrev}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft size={16} />
                Back
              </button>
            )}

            {isLastStep ? (
              <button
                onClick={handleComplete}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
              >
                <Sparkles size={16} />
                Get Started
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={step.id === 'role' && !selectedRole}
                className="flex items-center gap-1 px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm"
              >
                Continue
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
