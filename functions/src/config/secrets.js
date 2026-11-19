'use strict';
/**
 * Every secret lives ONLY in Google Secret Manager, declared here and read with .value()
 * inside a function handler. Nothing here ever reaches the browser.
 *
 * Set each with:   firebase functions:secrets:set NAME
 */
const { defineSecret } = require('../runtime/params');

module.exports = {
  GEMINI_API_KEY: defineSecret('GEMINI_API_KEY'), // Google AI Studio key (free tier)
  // OPTIONAL, only if providers.search.active = 'google_cse' (legacy, see config/providers.js).
  // Do not list these in a function's `secrets` option unless you use that provider, or deploy fails.
  GOOGLE_CSE_KEY: defineSecret('GOOGLE_CSE_KEY'),
  GOOGLE_CSE_CX: defineSecret('GOOGLE_CSE_CX'),
  PEXELS_API_KEY: defineSecret('PEXELS_API_KEY'), // Pexels image API key
  ADMIN_CODE_PEPPER: defineSecret('ADMIN_CODE_PEPPER'), // random 32+ char string, secret half of the code hash
  RATE_LIMIT_SALT: defineSecret('RATE_LIMIT_SALT'), // random 32+ char string, salts hashed IP buckets
};
