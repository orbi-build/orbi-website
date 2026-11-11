// Issue #1237: the price a visitor actually pays is written first on the
// Cloud pages, with the list price struck through beside it. While founding
// places remain that is the founding 50% price (the FOUNDING50 code's terms);
// once the places are gone the same tokens fall back to the list price and the
// struck element stays hidden. Derived from pricing.json rather than typed as
// a second set of numbers, so the discount cannot drift away from the prices
// it discounts.
//
// Issue #1281: the same condition decides whether every Cloud checkout link
// carries the promo code. Cloud only hands a code to Stripe when the link
// itself names it (orbi-cloud src/billing-routes.ts), so without this the
// visitor would land on the list price the card strikes through.
//
// Its own module, not src/worker.js: the plain-Node browser stand-in in
// tests/homepage.smoke.mjs seeds its server from this rule too, and it cannot
// import the Worker (a JSON import there needs a bundler or a vitest loader).
export const FOUNDING_DISCOUNT = 0.5;

// Issue #1298: the checkout link carries the code itself (the promo query
// below), so the copy says the discount is applied by that click instead of
// asking the visitor to type the code — the instruction made the card's price
// read as a list price. Only the number of places decides whether the sentence
// ships, the same condition as the price and the promo query; with no places
// left it is empty, because there is no 50% to promise.
//
// The English value opens with the space that separates it from the sentence
// it follows; the Chinese one does not, because Chinese prose puts no space
// after a full stop. Placed after "... places left." the sentence reads
// correctly with and without it.
export const FOUNDING_DISCOUNT_NOTE = {
  en: " The 50% discount is applied automatically when you subscribe — no code to enter.",
  zh: "订阅时自动按五折结算，无需填写优惠码。",
};

const foundingPlacesRemain = (remaining) => Number(remaining) > 0;

export function foundingDiscountNote(pricing, { zh = false, remaining = pricing.foundingPartnerRemaining } = {}) {
  return foundingPlacesRemain(remaining) ? FOUNDING_DISCOUNT_NOTE[zh ? "zh" : "en"] : "";
}

export function paidPriceReplacements(pricing, remaining = pricing.foundingPartnerRemaining) {
  const founding = foundingPlacesRemain(remaining);
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
    // Appended to an href, so the separator ships escaped; empty once the
    // places are gone, which leaves the link exactly as it was.
    [pricing.foundingPromoQueryToken]: founding ? `&amp;promo=${pricing.foundingPromoCode}` : "",
  };
}
