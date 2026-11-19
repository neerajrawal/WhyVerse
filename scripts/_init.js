'use strict';
/**
 * Shared setup for the one-time admin scripts. They run on YOUR computer using your own
 * Google credentials (never shipped to the website):
 *
 *   gcloud auth application-default login
 *   (or set GOOGLE_APPLICATION_CREDENTIALS to a service-account key file kept OUTSIDE this folder)
 *
 * The project id is read from .firebaserc, or from the GCLOUD_PROJECT environment variable.
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function projectId() {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  const rc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.firebaserc'), 'utf8'));
  const id = rc.projects && rc.projects.default;
  if (!id || id === 'your-firebase-project-id') {
    throw new Error('Set your real project id in .firebaserc (or GCLOUD_PROJECT) first.');
  }
  return id;
}

function init() {
  const id = projectId();
  if (!admin.apps.length) admin.initializeApp({ projectId: id });
  console.log(`Project: ${id}`);
  return admin;
}

/** Ask for a value without echoing it to the screen (so it is not left in the terminal). */
function askHidden(question) {
  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.output.write('\n');
      rl.close();
      resolve(answer.trim());
    });
  });
}

module.exports = { init, projectId, askHidden };
