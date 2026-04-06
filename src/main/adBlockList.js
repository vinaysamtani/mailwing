'use strict';

/**
 * Root domains to block via session.webRequest.onBeforeRequest.
 * Both exact matches and subdomains are checked in sessionManager.
 * Provider safe-domains take precedence — see sessionManager.attachAdBlocker.
 *
 * Deliberately excludes all Google/Zoho domains so their services keep working.
 */
const adDomains = [
  // Google ad infrastructure (safe for blocking in non-Google sessions)
  'doubleclick.net',
  'googlesyndication.com',
  'googletagmanager.com',
  'googletagservices.com',
  'google-analytics.com',
  'googleadservices.com',
  'adservice.google.com',

  // Amazon
  'amazon-adsystem.com',
  'advertising.amazon.com',

  // Analytics / session recording
  'scorecardresearch.com',
  'quantserve.com',
  'chartbeat.com',
  'hotjar.com',
  'mouseflow.com',
  'fullstory.com',
  'logrocket.com',
  'inspectlet.com',

  // CDPs / data brokers
  'mixpanel.com',
  'segment.io',
  'segment.com',
  'cdn.segment.com',
  'optimizely.com',
  'amplitude.com',

  // Ad networks
  'outbrain.com',
  'taboola.com',
  'criteo.com',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'adsrvr.org',
  'adnxs.com',
  'casalemedia.com',
  'contextweb.com',
  'advertising.com',
  'yieldmo.com',
  'triplelift.com',
  'sharethrough.com',
  'spotx.tv',
  'spotxchange.com',
  'liveintent.com',
  'liveramp.com',

  // DMP / audience
  'krxd.net',
  'bluekai.com',
  'demdex.net',
  'everesttech.net',
  'omtrdc.net',
  'rlcdn.com',
  'bidswitch.net',
  'smartadserver.com',

  // Social tracking pixels
  'analytics.twitter.com',
  'syndication.twitter.com',
  'static.ads-twitter.com',
  'connect.facebook.net',
  'tr.snapchat.com',
  'sc-static.net',

  // Microsoft advertising/analytics
  'bat.bing.com',
  'clarity.ms',
  'ads.yahoo.com',
];

module.exports = { adDomains };
