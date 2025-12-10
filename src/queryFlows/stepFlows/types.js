/**
 * Multi-Step Query Flow Types
 * 
 * Defines the architecture for guided, step-by-step query wizards
 * that help users build complex queries incrementally.
 */

/**
 * @typedef {Object} FlowStepResult
 * @property {boolean} success - Whether the step executed successfully
 * @property {Object} results - Query results (columns, rows)
 * @property {Object} extractedData - Data extracted for next step
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} FlowStep
 * @property {string} id - Unique step identifier
 * @property {string} title - Display title for this step
 * @property {string} description - What this step does
 * @property {boolean} [optional] - Whether this step can be skipped
 * @property {function(EntityContext, Object, string[]): string} buildQuery - Generates SQL for this step
 * @property {function(Object): Object} [extractDataForNext] - Extracts data from results for next step
 * @property {string} [nextStep] - ID of next step (null = final)
 * @property {function(Object): boolean} [shouldSkip] - Condition to auto-skip this step
 * @property {string} [skipMessage] - Message shown when step is skipped
 */

/**
 * @typedef {Object} MultiStepFlow
 * @property {string} id - Flow identifier (e.g., 'LINEAGE_WIZARD')
 * @property {string} label - Display name
 * @property {string} description - Flow description
 * @property {string} icon - Icon name
 * @property {string[]} supportedEntityTypes - Entity types this flow supports
 * @property {FlowStep[]} steps - Ordered list of steps
 * @property {function(EntityContext): Object} buildInitialInputs - Creates initial inputs from entity
 */

/**
 * @typedef {Object} WizardState
 * @property {string} flowId - Current flow ID
 * @property {number} currentStepIndex - Current step (0-based)
 * @property {Object} inputs - Accumulated inputs from all steps
 * @property {FlowStepResult[]} stepResults - Results from each completed step
 * @property {boolean} isComplete - Whether the flow is finished
 * @property {string} [finalSql] - The final generated SQL
 */

export const WIZARD_STATUS = {
  IDLE: 'idle',
  RUNNING_STEP: 'running_step',
  AWAITING_INPUT: 'awaiting_input',
  STEP_COMPLETE: 'step_complete',
  FLOW_COMPLETE: 'flow_complete',
  ERROR: 'error',
};

/**
 * Create initial wizard state
 * @param {string} flowId 
 * @param {Object} initialInputs 
 * @returns {WizardState}
 */
export function createWizardState(flowId, initialInputs = {}) {
  return {
    flowId,
    currentStepIndex: 0,
    inputs: { ...initialInputs },
    stepResults: [],
    isComplete: false,
    finalSql: null,
    status: WIZARD_STATUS.IDLE,
  };
}

/**
 * Advance wizard to next step
 * @param {WizardState} state 
 * @param {FlowStepResult} stepResult 
 * @param {MultiStepFlow} flow 
 * @returns {WizardState}
 */
export function advanceWizard(state, stepResult, flow) {
  const newInputs = {
    ...state.inputs,
    ...(stepResult.extractedData || {}),
  };
  
  const newStepResults = [...state.stepResults, stepResult];
  const nextIndex = state.currentStepIndex + 1;
  const isComplete = nextIndex >= flow.steps.length;
  
  return {
    ...state,
    currentStepIndex: nextIndex,
    inputs: newInputs,
    stepResults: newStepResults,
    isComplete,
    status: isComplete ? WIZARD_STATUS.FLOW_COMPLETE : WIZARD_STATUS.STEP_COMPLETE,
  };
}

