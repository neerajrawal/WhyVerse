'use strict';
/**
 * Default values. The admin portal writes overrides to Firestore settings/main, which are
 * merged over DEFAULT_SETTINGS at runtime (see lib/settings.js). seed-settings.js writes
 * these defaults on first setup.
 */

const REGION = 'asia-south1';
const TIMEZONE = 'Asia/Kolkata';

const BANDS = ['junior', 'teen', 'all'];

// Which page bands each browsing mode may see (Junior mode = Junior + All, etc.).
const BANDS_FOR_MODE = {
  all: ['all'], // "All ages" mode: only pages suitable for everyone
  junior: ['junior', 'all'],
  teen: ['teen', 'all'],
  everything: ['junior', 'teen', 'all'], // adults only
};

const REPORT_REASONS = ['inaccurate', 'unsuitable', 'scary', 'copyright', 'broken', 'other'];

const DEFAULT_CATEGORIES = [
  { id: 'space', name: 'Space', emoji: '🚀', order: 1 },
  { id: 'animals', name: 'Animals', emoji: '🐘', order: 2 },
  { id: 'nature', name: 'Nature & Earth', emoji: '🌏', order: 3 },
  { id: 'science', name: 'Science', emoji: '🔬', order: 4 },
  { id: 'technology', name: 'Technology', emoji: '💡', order: 5 },
  { id: 'history', name: 'History', emoji: '🏛️', order: 6 },
  { id: 'india', name: 'India', emoji: '🇮🇳', order: 7 },
  { id: 'body', name: 'Human Body', emoji: '🫀', order: 8 },
  { id: 'maths', name: 'Maths', emoji: '➗', order: 9 },
  { id: 'art', name: 'Art & Music', emoji: '🎨', order: 10 },
  { id: 'sports', name: 'Sports', emoji: '🏏', order: 11 },
  { id: 'food', name: 'Food & Culture', emoji: '🍛', order: 12 },
];

const DEFAULT_SETTINGS = {
  limits: {
    // Cost controls. When one is reached the queue pauses and admins get an alert.
    maxPagesPerDay: 6, // sized for the free Gemini tier
    maxSearchCallsPerDay: 300, // Wikipedia is free; lower this if you switch to a paid search provider
    maxLlmTokensPerDay: 1500000,
  },
  submissions: {
    maxPerDay: 2,
    maxPending: 10,
    maxWords: 1500,
    // Automatic rejections IN A ROW (a page an admin approves resets the count to 0).
    // Each step has its own message; pauseHours stops sending pages for that long.
    strikes: [
      { at: 1, level: 'notice', pauseHours: 0 },
      { at: 2, level: 'warning', pauseHours: 0 },
      { at: 3, level: 'final_warning', pauseHours: 24 },
      { at: 4, level: 'suspended', pauseHours: 168 },
      { at: 5, level: 'blocked', pauseHours: 0, block: true },
    ],
    requireAuthorApproval: true, // an admin approves each person before they can send pages
  },
  safety: {
    // "strict" bands refuse anything borderline. "balanced" (Teen) allows depth on history,
    // science, health basics and current affairs but never graphic/sexual/hateful/drug/gambling.
    strictness: { junior: 'strict', teen: 'balanced', all: 'strict' },
    bannedTopics: [
      'porn', 'sex', 'sexual', 'nude', 'naked', 'erotic', 'fetish',
      'gambling', 'betting', 'casino', 'lottery', 'rummy', 'poker',
      'cocaine', 'heroin', 'meth', 'marijuana', 'weed', 'ganja', 'opium', 'drug abuse', 'vaping',
      'suicide', 'self-harm', 'self harm',
      'gore', 'torture', 'beheading', 'massacre', 'genocide denial',
      'terrorist attack', 'bomb making', 'how to make a bomb', 'weapon making',
      'racist', 'slur', 'hate speech',
      'election campaign', 'political party manifesto',
    ],
    // Reviewed by a human when the model is unsure.
    sendBorderlineToReview: true,
  },
  sources: {
    webCheck: true, // check submissions and AI pages against the wider web (Gemini + Google Search)
    // Preferred domains get a ranking boost; blocked domains are never fetched.
    preferredSuffixes: ['.gov', '.gov.in', '.nic.in', '.edu', '.ac.in', '.edu.in', '.org', '.museum'],
    preferredDomains: [
      'nasa.gov', 'isro.gov.in', 'wikipedia.org', 'britannica.com', 'kids.nationalgeographic.com',
      'nationalgeographic.com', 'smithsonianmag.com', 'si.edu', 'who.int', 'unesco.org',
      'sciencenewsforstudents.org', 'ducksters.com', 'kiddle.co', 'bbc.co.uk', 'khanacademy.org',
    ],
    blockedDomains: [
      'reddit.com', 'quora.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com',
      'tiktok.com', 'pinterest.com', '4chan.org', 'tumblr.com',
    ],
  },
  llm: {
    // Empty string = use the model from config/providers.js.
    writeModel: '',
    checkModel: '',
  },
  automation: {
    enabled: false, // auto mode is OFF until an admin switches it on
    pagesPerRun: 1,
    schedule: 'daily', // 'daily' | 'weekly'
    defaultBand: 'all',
  },
  chat: {
    enabled: true,
    guestRatePerHour: 30,
    adultRatePerHour: 120,
  },
  accessCode: {
    maxFailures: 5,
    lockoutMinutes: 15,
    sessionHours: 2,
  },
};

const PUBLIC_SETTINGS = {
  siteName: 'WhyVerse',
  bands: { junior: 'Junior (6-12)', teen: 'Teen (13-17)', all: 'Everyone' },
  submissionsOpen: true,
  authorApprovalRequired: true,
  maintenance: false,
};

module.exports = {
  REGION,
  TIMEZONE,
  BANDS,
  BANDS_FOR_MODE,
  REPORT_REASONS,
  DEFAULT_CATEGORIES,
  DEFAULT_SETTINGS,
  PUBLIC_SETTINGS,
};
