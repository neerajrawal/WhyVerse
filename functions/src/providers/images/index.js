'use strict';
const providers = require('../../config/providers');
const secrets = require('../../config/secrets');
const { recordUsage } = require('../../lib/usage');

const impls = { pexels: require('./pexels') };

/** Search the active free-image provider. Caller declares the PEXELS_API_KEY secret. */
async function imageSearch(query, { perPage } = {}) {
  const impl = impls[providers.images.active];
  if (!impl) throw new Error(`Unknown image provider: ${providers.images.active}`);
  const images = await impl.searchImages({ query, apiKey: secrets.PEXELS_API_KEY.value(), perPage });
  await recordUsage({ imageCalls: 1 });
  return images;
}

module.exports = { imageSearch };
