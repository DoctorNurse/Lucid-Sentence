/**
 * Promo on/off switch.
 *
 * Build time: bundlers can define the global `__LUCID_PROMOS__` (e.g. Vite
 * `define: { __LUCID_PROMOS__: 'false' }`). The demo reads the env variable
 * `LUCID_PROMOS=off` for this. Forks and third-party distributions of this
 * AGPL software can turn promos off this way. When it is not defined, promos
 * are on.
 *
 * Runtime: `configurePromos({ enabled: false })` or `<ls-splash promos="off">`.
 */
declare const __LUCID_PROMOS__: boolean | string | undefined;

function buildTimeDefault(): boolean {
  if (typeof __LUCID_PROMOS__ === 'undefined') return true;
  return __LUCID_PROMOS__ !== false && __LUCID_PROMOS__ !== 'false' && __LUCID_PROMOS__ !== 'off';
}

let enabled = buildTimeDefault();

export interface PromoConfig {
  enabled: boolean;
}

export function configurePromos(config: Partial<PromoConfig>): void {
  if (config.enabled !== undefined) enabled = config.enabled;
}

export function promosEnabled(): boolean {
  return enabled;
}
