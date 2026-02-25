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

      // JS, images, CSS
      javascriptEnabled: true, // If this runs, JS is enabled arbitrarily
      imagesEnabled: (() => {  // Create a 1x1 gif and check to see if it's successfully created or not.
        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        return img.complete || img.width > 0;
      })(),
      cssEnabled: (() => { // Injects a div and checks if getComputedStyle reflects it. If CSS is disabled or blocked, it would return False.
        const el = document.createElement('div');
        el.style.position = 'absolute';
        document.body.appendChild(el);
        const computed = window.getComputedStyle(el).position;
        document.body.removeChild(el);
        return computed === 'absolute';
      })(),

      // Viewport (current browser window)
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,

      // Window dimension
      windowWidth: window.outerWidth,
      windowHeight: window.outerHeight,

      // Screen (physical display)
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      pixelRatio: window.devicePixelRatio,

      /* NOT INTERESTED
      // Hardware
      cores: navigator.hardwareConcurrency || 0,
      memory: navigator.deviceMemory || 0,
      */

      // Network (feature-detected)
      network: getNetworkInfo(),

      /*
      // Preferences
      colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark' : 'light',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      */

      //
    };
  }

  // Navigation timing
  /**
   * Extract key performance milestones from the Navigation Timing API.
   * Returns an object with durations in milliseconds, or an empty
   * object if the API is unavailable.
   */
  function getNavigationTiming() {
    const entries = performance.getEntriesByType('navigation');
    if (!entries.length) return {};

    const n = entries[0];

    return {
      // DNS lookup time
      dnsLookup: round(n.domainLookupEnd - n.domainLookupStart),
      // TCP connection time
      tcpConnect: round(n.connectEnd - n.connectStart),
      // TLS handshake (HTTPS only)
      tlsHandshake: n.secureConnectionStart > 0
        ? round(n.connectEnd - n.secureConnectionStart) : 0,
      // Time to First Byte
      ttfb: round(n.responseStart - n.requestStart),
      // Download time (response)
      download: round(n.responseEnd - n.responseStart),
      // DOM interactive (HTML parsed, not all resources loaded)
      domInteractive: round(n.domInteractive - n.fetchStart),
      // DOM complete (all resources loaded)
      domComplete: round(n.domComplete - n.fetchStart),
      // Full page load
      loadEvent: round(n.loadEventEnd - n.fetchStart),
      // Total fetch time
      fetchTime: round(n.responseEnd - n.fetchStart),
      // Transfer size and header overhead
      transferSize: n.transferSize,
      headerSize: n.transferSize - n.encodedBodySize
    };
  }

  function round(n) {
    return Math.round(n * 100) / 100;
  }

  // Resource Timing
  /**
   * Aggregate resource timing data by initiator type.
   * Returns total resource count and per-type breakdown of
   * count, totalSize (bytes), and totalDuration (ms).
   */

  function getResourceSummary() {
    const resources = performance.getEntriesByType('resource');

    const summary = {
      script:         { count: 0, totalSize: 0, totalDuration: 0 },
      link:           { count: 0, totalSize: 0, totalDuration: 0 },  // CSS
      img:            { count: 0, totalSize: 0, totalDuration: 0 },
      font:           { count: 0, totalSize: 0, totalDuration: 0 },
      fetch:          { count: 0, totalSize: 0, totalDuration: 0 },
      xmlhttprequest: { count: 0, totalSize: 0, totalDuration: 0 },
      other:          { count: 0, totalSize: 0, totalDuration: 0 }
    };

    resources.forEach((r) => {
      const type = summary[r.initiatorType] ? r.initiatorType : 'other';
      summary[type].count++;
      summary[type].totalSize += r.transferSize || 0;
      summary[type].totalDuration += r.duration || 0;
    });

    return {
      totalResources: resources.length,
      byType: summary
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
      technographics: getTechnographics(),
      timing: getNavigationTiming(),
      resources: getResourceSummary()
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
  // Collect after the page is fully loaded
  window.addEventListener('load', () => {
    // Small delay to ensure loadEventEnd is populated
    setTimeout(() => {
      console.log('[collector-v4] Page loaded â€” collecting performance timing');
      collect();
      // Add to beacon payload...
    }, 0);
  });


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
    collect: collect,
    getResourceSummary: getResourceSummary
  };

})();
