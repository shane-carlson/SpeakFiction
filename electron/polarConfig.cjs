// Public Polar identifiers. These are not secrets — they ship in the app.
// Create the product + License Keys benefit + Checkout Link at polar.sh, then
// fill these in (or override with env when packing).
// Never put POLAR_ACCESS_TOKEN in this file or the renderer.

function trim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const organizationId = trim(process.env.POLAR_ORGANIZATION_ID) || 'cfd3c2a6-2654-4565-8c15-e8ca7d25bff6';
const benefitId = trim(process.env.POLAR_BENEFIT_ID) || 'b0375348-4176-48e6-a8bb-272d48964c19';
const checkoutUrl = trim(process.env.POLAR_CHECKOUT_URL) || 'https://buy.polar.sh/polar_cl_UY6hL0ShOvh0QrngLAY5phDdQKHux87mxEqp21sNBGD';
const server = process.env.POLAR_SERVER === 'sandbox' ? 'sandbox' : 'production';

function apiBase() {
  return server === 'sandbox' ? 'https://sandbox-api.polar.sh' : 'https://api.polar.sh';
}

function isConfigured() {
  return Boolean(organizationId && checkoutUrl);
}

module.exports = {
  organizationId,
  benefitId,
  checkoutUrl,
  server,
  apiBase,
  isConfigured,
};
