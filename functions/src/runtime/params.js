'use strict';
/** Secrets are plain environment variables (Vercel > Settings > Environment Variables, encrypted at rest). */
function defineSecret(name) {
  return {
    name,
    value() {
      const v = process.env[name];
      if (!v) throw new Error(`Missing environment variable ${name}`);
      return v;
    },
  };
}
module.exports = { defineSecret };
