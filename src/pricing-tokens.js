// Issue #1237: the price a visitor actually pays is written first on the
// Cloud pages, with the list price struck through beside it. While founding
// places remain that is the founding 50% price (the FOUNDING50 code's terms);
// once the places are gone the same tokens fall back to the list price and the
// struck element stays hidden. Derived from pricing.json rather than typed as
// a second set of numbers, so the discount cannot drift away from the prices
// it discounts.
//
// Its own module, not src/worker.js: the plain-Node browser stand-in in
// tests/homepage.smoke.mjs seeds its server from this rule too, and it cannot
// import the Worker (a JSON import there needs a bundler or a vitest loader).
export const FOUNDING_DISCOUNT = 0.5;

export function paidPriceReplacements(pricing, remaining = pricing.foundingPartnerRemaining) {
  const founding = Number(remaining) > 0;
  const paid = (amount) => String(founding ? amount * (1 - FOUNDING_DISCOUNT) : amount);
  const paidAnnualMonthly = (annual) => String(Math.round(Number(paid(annual)) / 12));
  return {
    [pricing.soloPaidMonthlyUsdToken]: paid(pricing.soloMonthlyUsd),
    [pricing.soloPaidAnnualUsdToken]: paid(pricing.soloAnnualUsd),
    [pricing.soloPaidAnnualMonthlyUsdToken]: paidAnnualMonthly(pricing.soloAnnualUsd),
    [pricing.proPaidMonthlyUsdToken]: paid(pricing.cloudMonthlyUsd),
    [pricing.proPaidAnnualUsdToken]: paid(pricing.proAnnualUsd),
    [pricing.proPaidAnnualMonthlyUsdToken]: paidAnnualMonthly(pricing.proAnnualUsd),
    [pricing.foundingPriceStateToken]: founding ? 'data-founding-price="on"' : 'data-founding-price="off"',
  };
}
