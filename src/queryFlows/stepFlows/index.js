/**
 * Step Flows Module
 * 
 * Multi-step query wizards that guide users through complex query building.
 * 
 * This module provides a GLOBAL, DATA-DRIVEN wizard system.
 * All wizards are defined as recipes in queryRecipes.js.
 * No domain-specific wizard components needed.
 */

export * from './types';
export { buildExtractorFromBindings, normalizeResults, getRowValue } from './extractors';
export { buildFlowFromRecipe, getSqlTemplate, registerSqlTemplate } from './recipeBuilder';

import { QUERY_RECIPES, getRecipe, getRecipesForDomain, getRecipesForEntityType } from '../queryRecipes';
import { buildFlowFromRecipe } from './recipeBuilder';

// Lazy-built cache so we don't rebuild flows on every render
const FLOW_CACHE = {};

/**
 * Get a MultiStepFlow by ID, built from QUERY_RECIPES.
 * This is the main entry point for the wizard system.
 * 
 * @param {string} flowId - The recipe ID (e.g., 'lineage_downstream')
 * @returns {import('./types').MultiStepFlow | null}
 */
export function getWizardFlow(flowId) {
  // Return from cache if already built
  if (FLOW_CACHE[flowId]) {
    return FLOW_CACHE[flowId];
  }

  // Get recipe from registry
  const recipe = getRecipe(flowId);
  if (!recipe) {
    return null;
  }

  // Build the flow from the recipe
  const flow = buildFlowFromRecipe(recipe);
  
  // Cache it
  if (flow) {
    FLOW_CACHE[flowId] = flow;
  }
  
  return flow;
}

/**
 * Get all available wizard flows for a given entity type.
 * 
 * @param {string} entityType - The entity type (e.g., 'TABLE', 'COLUMN')
 * @returns {Array<{id: string, label: string, description: string, icon: string}>}
 */
export function getAvailableWizardFlowsForEntity(entityType) {
  const recipes = getRecipesForEntityType(entityType);
  
  return recipes.map(recipe => ({
    id: recipe.id,
    label: recipe.label,
    description: recipe.description,
    icon: recipe.icon,
    intent: recipe.intent,
    domains: recipe.domains,
  }));
}

/**
 * Get all available wizard flows for a given domain.
 * 
 * @param {string} domain - The domain (e.g., 'Core', 'Glossary', 'dbt')
 * @returns {Array<{id: string, label: string, description: string, icon: string}>}
 */
export function getAvailableWizardFlowsForDomain(domain) {
  const recipes = getRecipesForDomain(domain);
  
  return recipes.map(recipe => ({
    id: recipe.id,
    label: recipe.label,
    description: recipe.description,
    icon: recipe.icon,
    intent: recipe.intent,
  }));
}

/**
 * Get all available wizard flows.
 * 
 * @returns {Array<{id: string, label: string, description: string, icon: string, domains: string[]}>}
 */
export function getAllWizardFlows() {
  return Object.values(QUERY_RECIPES).map(recipe => ({
    id: recipe.id,
    label: recipe.label,
    description: recipe.description,
    icon: recipe.icon,
    intent: recipe.intent,
    domains: recipe.domains,
    supportedEntityTypes: recipe.supportedEntityTypes,
  }));
}

/**
 * Clear the flow cache (useful for hot reloading during development)
 */
export function clearFlowCache() {
  Object.keys(FLOW_CACHE).forEach(key => delete FLOW_CACHE[key]);
}

// Re-export recipe helpers for convenience
export { getRecipe, getRecipesForDomain, getRecipesForEntityType } from '../queryRecipes';
export { QUERY_RECIPES, QUERY_INTENTS, STEP_KINDS } from '../queryRecipes';

// Legacy export for backwards compatibility (can be removed later)
export { LINEAGE_WIZARD, getCurrentStep, canProceed } from './lineageWizard';
