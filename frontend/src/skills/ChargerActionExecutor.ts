/**
 * ChargerActionExecutor -- convenience re-export that registers charger scene handlers.
 *
 * Delegates to the central ActionExecutor.registerChargerActions() so all
 * charger-related action IDs are wired to chargerStore methods.
 */

export { registerChargerActions } from './ActionExecutor';
