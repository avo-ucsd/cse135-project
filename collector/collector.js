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
  const MAX_ERRORS = 10;

  // Error Tracking State
  const reportedErrors = new Set();
  let errorCount = 0;

  // Web Vitals State 
  const vitals = {
    lcp: null,
    cls: 0,
    inp: null
  };

  // Mouse Activity State
  const MAX_MOUSE_EVENTS = 200;
  const MAX_KEYBOARD_EVENTS = 300;
  const MAX_IDLE_BREAKS = 200;
  const IDLE_THRESHOLD_MS = 2000;
  const mouse = {
    cursor: { x: null, y: null, ts: null },
    moves: [],
    clicks: [],
    scrolls: [],
    totals: {
      moves: 0,
      clicks: 0,
      scrolls: 0
    }
  };

  const keyboard = {
    downs: [],
    ups: [],
    lastKey: null,
    totals: {
      keydown: 0,
      keyup: 0
    }
  };

  const pageLifecycle = {
    enteredAtMs: Date.now(),
    enteredAt: new Date().toISOString(),
    leftAtMs: null,
    leftAt: null,
    leftReason: null,
    entryUrl: window.location.href,
    entryPath: window.location.pathname,
    entryTitle: document.title
  };

  const idle = {
    lastActivityTs: pageLifecycle.enteredAtMs,
    breaks: [],
    totals: {
      count: 0,
      totalDurationMs: 0,
      longestDurationMs: 0
    }
  };

  let hasSentLeaveBeacon = false;

  function pushLimited(list, eventData, maxSize = MAX_MOUSE_EVENTS) {
    list.push(eventData);
    if (list.length > maxSize) {
      list.shift();
    }
  }

  function recordActivity(source) {
    const now = Date.now();
    const gapMs = now - idle.lastActivityTs;

    if (gapMs >= IDLE_THRESHOLD_MS) {
      const idleBreak = {
        source: source,
        startedAtMs: idle.lastActivityTs,
        startedAt: new Date(idle.lastActivityTs).toISOString(),
        endedAtMs: now,
        endedAt: new Date(now).toISOString(),
        durationMs: gapMs,
        pageUrl: window.location.href
      };

      pushLimited(idle.breaks, idleBreak, MAX_IDLE_BREAKS);
      idle.totals.count++;
      idle.totals.totalDurationMs += gapMs;
      if (gapMs > idle.totals.longestDurationMs) {
        idle.totals.longestDurationMs = gapMs;
      }
    }

    idle.lastActivityTs = now;
  }

  function markPageLeft(reason) {
    const now = Date.now();
    pageLifecycle.leftAtMs = now;
    pageLifecycle.leftAt = new Date(now).toISOString();
    pageLifecycle.leftReason = reason;
  }

  function sendLeaveBeacon(reason) {
    if (hasSentLeaveBeacon) return;
    hasSentLeaveBeacon = true;
    markPageLeft(reason);
    collect();
  }

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

  // Web Vitals
  /**
   * Initialize PerformanceObservers for Core Web Vitals.
   * LCP, CLS, and INP are collected continuously and included
   * in the exit beacon when the page is hidden.
   */
  function initWebVitals() {
    // Largest Contentful Paint (LCP)
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length) {
          vitals.lcp = round(entries[entries.length - 1].startTime);
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {
      console.log('[collector-v6] LCP observer not supported');
    }

    // Cumulative Layout Shift (CLS)
    try {
      const clsObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (!entry.hadRecentInput) {
            vitals.cls = round(vitals.cls + entry.value);
          }
        });
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch (e) {
      console.log('[collector-v6] CLS observer not supported');
    }

    // Interaction to Next Paint (INP)
    try {
      const inpObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          const duration = entry.duration;
          if (vitals.inp === null || duration > vitals.inp) {
            vitals.inp = round(duration);
          }
        });
      });
      inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 16 });
    } catch (e) {
      console.log('[collector-v6] INP observer not supported');
    }
  }

  /**
   * Return the current vitals snapshot.
   */
  function getWebVitals() {
    return {
      lcp: vitals.lcp,
      cls: vitals.cls,
      inp: vitals.inp
    };
  }

  // Mouse Tracking 

  /**
   * Initialize listeners for mouse movement, clicks, and scrolling.
   * Stores latest cursor position and bounded event buffers.
   */
  function initMouseTracking() {
    document.addEventListener('mousemove', (event) => {
      recordActivity('mousemove');
      mouse.totals.moves++;
      const moveEvent = {
        x: event.clientX,
        y: event.clientY,
        ts: Date.now()
      };
      mouse.cursor = moveEvent;
      pushLimited(mouse.moves, moveEvent);
    }, { passive: true });

    document.addEventListener('click', (event) => {
      recordActivity('click');
      mouse.totals.clicks++;
      pushLimited(mouse.clicks, {
        x: event.clientX,
        y: event.clientY,
        button: event.button,
        buttonName: event.button === 0 ? 'left' : event.button === 1 ? 'middle' : event.button === 2 ? 'right' : 'other',
        ts: Date.now()
      });
    }, { passive: true });

    window.addEventListener('scroll', () => {
      recordActivity('scroll');
      mouse.totals.scrolls++;
      pushLimited(mouse.scrolls, {
        x: window.scrollX,
        y: window.scrollY,
        ts: Date.now()
      });
    }, { passive: true });

    console.log('[collector-v6] Mouse tracking initialized');
  }

  /**
   * Return a snapshot of tracked mouse activity.
   */
  function getMouseActivity() {
    return {
      cursor: mouse.cursor,
      moves: mouse.moves,
      clicks: mouse.clicks,
      scrolls: mouse.scrolls,
      totals: mouse.totals
    };
  }

  /**
   * Initialize listeners for keyboard keydown/keyup activity.
   */
  function initKeyboardTracking() {
    document.addEventListener('keydown', (event) => {
      recordActivity('keydown');
      keyboard.totals.keydown++;
      const keyEvent = {
        type: 'keydown',
        key: event.key,
        code: event.code,
        repeat: event.repeat,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        ts: Date.now()
      };
      keyboard.lastKey = keyEvent;
      pushLimited(keyboard.downs, keyEvent, MAX_KEYBOARD_EVENTS);
    }, { passive: true });

    document.addEventListener('keyup', (event) => {
      recordActivity('keyup');
      keyboard.totals.keyup++;
      const keyEvent = {
        type: 'keyup',
        key: event.key,
        code: event.code,
        repeat: event.repeat,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        ts: Date.now()
      };
      keyboard.lastKey = keyEvent;
      pushLimited(keyboard.ups, keyEvent, MAX_KEYBOARD_EVENTS);
    }, { passive: true });

    console.log('[collector-v6] Keyboard tracking initialized');
  }

  /**
   * Return a snapshot of tracked keyboard activity.
   */
  function getKeyboardActivity() {
    return {
      downs: keyboard.downs,
      ups: keyboard.ups,
      lastKey: keyboard.lastKey,
      totals: keyboard.totals
    };
  }

  /**
   * Return a snapshot of idle periods detected from user activity gaps.
   */
  function getIdleActivity() {
    return {
      thresholdMs: IDLE_THRESHOLD_MS,
      lastActivityAtMs: idle.lastActivityTs,
      lastActivityAt: new Date(idle.lastActivityTs).toISOString(),
      breaks: idle.breaks,
      totals: idle.totals
    };
  }

  /**
   * Return page entry/exit lifecycle information.
   */
  function getPageLifecycle() {
    return {
      enteredAtMs: pageLifecycle.enteredAtMs,
      enteredAt: pageLifecycle.enteredAt,
      leftAtMs: pageLifecycle.leftAtMs,
      leftAt: pageLifecycle.leftAt,
      leftReason: pageLifecycle.leftReason,
      pageUrl: window.location.href,
      pagePath: window.location.pathname,
      pageTitle: document.title,
      entryUrl: pageLifecycle.entryUrl,
      entryPath: pageLifecycle.entryPath,
      entryTitle: pageLifecycle.entryTitle
    };
  }

  // Payload Delivery 
  /**
   * Send the payload to the analytics endpoint via sendBeacon,
   * falling back to fetch with keepalive.
   */
  function send(payload) {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, blob);
      console.log('[collector-v6] Beacon sent');
    } else {
      fetch(ENDPOINT, {
        method: 'POST',
        body: blob,
        keepalive: true
      }).catch((err) => {
        console.warn('[collector-v6] fetch fallback error:', err.message);
      });
    }

    console.log('[collector-v6] payload:', payload);
  }


  // Error Tracking

  /**
   * Report an error with deduplication and rate limiting.
   * Prevents beacon storms from repeated errors (e.g., in render loops).
   */
  function reportError(errorData) {
    // Rate limit: max errors per page load
    if (errorCount >= MAX_ERRORS) {
      console.log(`[collector-v6] Error rate limit reached (${MAX_ERRORS}), ignoring:`, errorData.message);
      return;
    }

    // Deduplicate by type + message + source + line
    const key = `${errorData.type}:${errorData.message || ''}:${errorData.source || ''}:${errorData.line || ''}`;
    if (reportedErrors.has(key)) {
      console.log('[collector-v6] Duplicate error suppressed:', errorData.message);
      return;
    }
    reportedErrors.add(key);
    errorCount++;

    console.log(`[collector-v6] Error #${errorCount}:`, errorData.type, '-', errorData.message);

    // Send error beacon
    const payload = {
      type: 'error',
      error: errorData,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      session: getSessionId()
    };

    send(payload);

    // Dispatch custom event so test pages can display the error
    window.dispatchEvent(new CustomEvent('collector:error', { detail: { errorData: errorData, count: errorCount } }));
  }

  /**
   * Initialize error listeners for JS errors, resource load failures,
   * and unhandled promise rejections.
   */
  function initErrorTracking() {
    // JS runtime errors AND resource load failures (capture phase for resources)
    window.addEventListener('error', (event) => {
      if (event instanceof ErrorEvent) {
        // JavaScript runtime error
        reportError({
          type: 'js-error',
          message: event.message,
          source: event.filename,
          line: event.lineno,
          column: event.colno,
          stack: event.error ? event.error.stack : '',
          url: window.location.href
        });
      } else {
        // Resource load failure (IMG, SCRIPT, LINK)
        const target = event.target;
        if (target && (target.tagName === 'IMG' || target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
          reportError({
            type: 'resource-error',
            tagName: target.tagName,
            src: target.src || target.href || '',
            url: window.location.href
          });
        }
      }
    }, true); // capture phase required for resource errors

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      reportError({
        type: 'promise-rejection',
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : '',
        url: window.location.href
      });
    });

    console.log('[collector-v6] Error tracking initialized');
  }

  // Collect and Send

  /**
   * Build the full analytics payload and send it.
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
      resources: getResourceSummary(),
      vitals: getWebVitals(),
      mouse: getMouseActivity(),
      keyboard: getKeyboardActivity(),
      idle: getIdleActivity(),
      pageLifecycle: getPageLifecycle(),
      errorCount: errorCount
    };

    send(payload);

    // Dispatch a custom event so test pages can read the payload
    window.dispatchEvent(new CustomEvent('collector:payload', { detail: payload }));
  }


  // Triggers
  // Initialize error tracking immediately (before any errors can fire)
  initErrorTracking();
  
  // Initialize Web Vitals observers
  initWebVitals();

  // Initialize Mouse activity tracking
  initMouseTracking();

  // Initialize Keyboard activity tracking
  initKeyboardTracking();

  // Collect pageview after the page is fully loaded
  window.addEventListener('load', () => {
    setTimeout(() => {
      console.log('[collector-v6] Page loaded collecting data');
      collect();
    }, 0);
  });

  // Collect again when the page is being hidden (tab close, navigation away)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      console.log('[collector-v6] Page hidden sending exit beacon');
      sendLeaveBeacon('visibility-hidden');
    }
  });

  window.addEventListener('pagehide', () => {
    sendLeaveBeacon('pagehide');
  });

  // Expose for test page

  window.__collector = {
    getNavigationTiming: getNavigationTiming,
    getResourceSummary: getResourceSummary,
    getTechnographics: getTechnographics,
    getWebVitals: getWebVitals,
    getMouseActivity: getMouseActivity,
    getKeyboardActivity: getKeyboardActivity,
    getIdleActivity: getIdleActivity,
    getPageLifecycle: getPageLifecycle,
    getSessionId: getSessionId,
    getNetworkInfo: getNetworkInfo,
    reportError: reportError,
    collect: collect,
    getErrorCount: () => errorCount,
    getReportedErrors: () => Array.from(reportedErrors)
  };

})();
