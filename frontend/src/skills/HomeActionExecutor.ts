/**
 * HomeActionExecutor -- convenience re-export that registers home scene handlers.
 *
 * Delegates to the central ActionExecutor.registerHomeActions() so all
 * home-related action IDs are wired to homeStore methods.
 */

export { registerHomeActions } from './ActionExecutor';
