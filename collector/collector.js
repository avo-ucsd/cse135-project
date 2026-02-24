/**
 * collector-v2.js â€” Analytics Collector with Technographics
 * CSE 135 - Module 02: Technographics
 *
 * Extends the Module 01 "hello beacon" collector with:
 *   - getTechnographics(): browser, device, screen, network, preferences
 *   - getSessionId(): session identity via sessionStorage (no cookies)
 *   - getNetworkInfo(): Network Information API with feature detection
 *
 * Usage: Include this script in any HTML page.
 *        Open the browser console to see collected data.
 */

(function () {
  'use strict';

  // Configuration
  const ENDPOINT = 'https://collector.teamate.site';

  // Session Identity

  /**
   * Generate or retrieve a session ID from sessionStorage.
   * Persists across page navigations within the same tab.
   * Clears automatically when the tab or browser closes.
   * No cookies, no cross-site tracking.
   */
  function getSessionId() {
    let sid = sessionStorage.getItem('_collector_sid');
    if (!sid) {
      sid = Math.random().toString(36).substring(2) + Date.now().toString(36);
      sessionStorage.setItem('_collector_sid', sid);
    }
    return sid;
  }

  // Network Information

  /**
   * Collect network connection data via the Network Information API.
   * Feature-detected: returns an empty object if the API is unavailable
   * (e.g., in Safari or Firefox).
   */
  function getNetworkInfo() {
    if (!('connection' in navigator)) return {};

    const conn = navigator.connection;
    return {
      effectiveType: conn.effectiveType,  // 'slow-2g', '2g', '3g', '4g'
      downlink: conn.downlink,            // Estimated bandwidth in Mbps
      rtt: conn.rtt,                      // Estimated round-trip time in ms
      saveData: conn.saveData             // true if user enabled data saver
    };
  }

  // Technographics

  /**
   * Collect a complete technographic profile of the user's environment.
   * All properties are feature-detected with safe fallbacks.
   * Returns a plain object â€” no side effects, no async.
   */
  function getTechnographics() {
    return {
      // Browser identification
      userAgent: navigator.userAgent,
      language: navigator.language,
      cookiesEnabled: navigator.cookieEnabled,

      // Viewport (current browser window)
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,

      // Screen (physical display)
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      pixelRatio: window.devicePixelRatio,

      // Hardware
      cores: navigator.hardwareConcurrency || 0,
      memory: navigator.deviceMemory || 0,

      // Network (feature-detected)
      network: getNetworkInfo(),

      // Preferences
      colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark' : 'light',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }

  // Payload & Delivery

  /**
   * Build the analytics payload and send it via sendBeacon.
   * Extends the Module 01 payload with session ID and technographics.
   */
  function collect() {
    const payload = {
      url: window.location.href,
      title: document.title,
      referrer: document.referrer,
      timestamp: new Date().toISOString(),
      type: 'pageview',
      session: getSessionId(),
      technographics: getTechnographics()
    };

    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, blob);
      console.log('[collector-v2] Beacon sent');
    } else {
      console.warn('[collector-v2] sendBeacon not available');
    }

    console.log('[collector-v2] payload:', payload);

    // Dispatch a custom event so test pages can read the payload
    window.dispatchEvent(new CustomEvent('collector:payload', { detail: payload }));
  }

  // Triggers

  // Collect on page load
  window.addEventListener('load', () => {
    console.log('[collector-v2] Page loaded” collecting technographics');
    collect();
  });

  // Collect again when the page is being hidden (tab close, navigation away)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      console.log('[collector-v2] Page hidden” sending exit beacon');
      collect();
    }
  });

  // Expose functions for the test page
  window.__collector = {
    getTechnographics: getTechnographics,
    getSessionId: getSessionId,
    getNetworkInfo: getNetworkInfo,
    collect: collect
  };

})();
