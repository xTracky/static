/******/ (() => { // webpackBootstrap
/******/ 	"use strict";

;// ./src/functions/onLoad.ts
/**
 * Executes a function when the document is loaded
 * @param fn Function to execute
 */
function onLoad(fn) {
    if (isDocumentLoaded()) {
        return fn();
    }
    window.addEventListener("load", fn);
}
/**
 * Checks if the document is already loaded
 */
function isDocumentLoaded() {
    return document.readyState === 'complete';
}

;// ./src/functions/watch.ts

function mutationWatch(query, process, root = document) {
    onLoad(() => {
        // Process existing iframes when page loads
        process(root.querySelectorAll(query));
        // Set up observer for dynamically added iframes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                // Check for added nodes
                if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach((node) => {
                        // Check if the added node is an iframe
                        if (node instanceof Element) {
                            if (node.matches(query)) {
                                process([node]);
                            }
                            // Check if the added node contains iframes
                            process(node.querySelectorAll(query));
                        }
                    });
                }
            });
        });
        // Start observing the entire document for changes
        observer.observe(root, {
            childList: true, // Watch for changes to the direct children
            subtree: true // Watch for changes in the entire subtree
        });
        // Function to process iframes and add parent URL parameters
    });
}

;// ./src/functions/storage.ts
function context(name) {
    const context = this;
    return {
        get() {
            return context.get(name);
        },
        set(value) {
            return context.set(name, value);
        }
    };
}
function createStore(storage) {
    return {
        context,
        get(key) {
            return storage.getItem(key) ?? undefined;
        },
        set(key, value) {
            storage.setItem(key, value);
        },
    };
}
function asConst() {
    return (source) => source;
}
const stores = asConst()({
    local: createStore(localStorage),
    session: createStore(sessionStorage),
});

;// ./src/functions/initUTMHandler.ts



function initUTMHandler(hardCodedConfig) {
    const config = {
        'token': '',
        'clickIdParams': ['click_id', 'ttclid', 'fbclid', 'gclid'], // Support Kwai, TikTok, Facebook, Google
        'stepId': 'initial',
        'currentUrl': new URL(window.location.href),
        'fingerPrintId': undefined,
        'apiEndpoint': "https://view.xtracky.dev/api/analytics/view" || 0,
    };
    const UTM_SOURCE_PARAM = 'utm_source';
    function getLeadIdStorageKey() {
        return `XTRACKY_LEAD_ID_${config.token}`;
    }
    function initializeFromScript() {
        const currentScript = getCurrentScript();
        if (currentScript) {
            Object.assign(config, {
                token: getDataToken() || '',
                stepId: currentScript.getAttribute("data-step-id") || 'initial',
                currentUrl: new URL(window.location.href),
            });
        }
    }
    function getCurrentScript() {
        const currentScript = document.currentScript;
        return currentScript;
    }
    function getDataToken() {
        const script = getCurrentScript();
        return script?.getAttribute("data-token");
    }
    function getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ')
                c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0)
                return c.substring(nameEQ.length, c.length);
        }
        return null;
    }
    function getUrlParameters() {
        // Returns the URLSearchParams converted to an object
        const params = Object.fromEntries(new URLSearchParams(window.location.search));
        // If this is a Facebook click (has fbclid), add _fbp cookie if it exists
        if (params['fbclid']) {
            const fbp = getCookie('_fbp');
            if (fbp) {
                params['_fbp'] = fbp;
            }
        }
        return params;
    }
    function detectClickId(urlParams) {
        // Check if any of the supported click ID parameters exist
        for (const clickIdParam of config.clickIdParams) {
            if (urlParams[clickIdParam]) {
                return urlParams[clickIdParam];
            }
        }
        return null;
    }
    function updateUrlWithLeadId(leadId) {
        // Preserve existing query parameters and update/set only utm_source
        const newUrl = new URL(window.location.href);
        // Get existing URLSearchParams to preserve all current query parameters
        const searchParams = new URLSearchParams(newUrl.search);
        // Set or update only the utm_source parameter
        searchParams.set(UTM_SOURCE_PARAM, leadId);
        newUrl.search = searchParams.toString();
        window.history.replaceState({}, '', newUrl.toString());
        config.currentUrl = newUrl;
    }
    function updateAllLinksWithLeadId(leadId) {
        const links = document.querySelectorAll('a');
        links.forEach(link => {
            if (!link.href || link.href.startsWith('#') || link.href.startsWith('javascript:')) {
                return;
            }
            try {
                const url = new URL(link.href);
                // Update ALL links (internal and external)
                url.searchParams.set(UTM_SOURCE_PARAM, leadId);
                link.href = url.href;
            }
            catch (e) {
                // Invalid URL, skip
            }
        });
    }
    async function dispatch(data) {
        if (hasPrevious(data)) {
            return null;
        }
        return run();
        function hasPrevious(data) {
            const PREVIOUS_STORAGE_KEY = 'PREVIOUS_PAGE_VIEW';
            const list = JSON.parse(sessionStorage.getItem(PREVIOUS_STORAGE_KEY) ?? '[]');
            const previous = new Set(list);
            const current = JSON.stringify(data);
            if (previous.has(current))
                return true;
            previous.add(current);
            sessionStorage.setItem(PREVIOUS_STORAGE_KEY, JSON.stringify([...previous.values()]));
            return false;
        }
        async function run() {
            const endpoint = config.apiEndpoint;
            try {
                console.log('VIEW', { data, endpoint });
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(data),
                    signal: AbortSignal.timeout(3000),
                    keepalive: true
                });
                const result = await response.json();
                console.log('VIEW Response', result);
                if (result.success && result.leadId) {
                    return result.leadId;
                }
                return null;
            }
            catch (error) {
                console.warn('Erro ao enviar view:', error);
                return null;
            }
        }
    }
    async function handleUtmParameters() {
        const store = stores.local.context(getLeadIdStorageKey());
        const urlParams = getUrlParameters();
        // Check if we have a NEW click ID from any platform (PRIORITY #1)
        const clickId = detectClickId(urlParams);
        console.log({ urlParams, clickId, detectedPlatform: clickId ? 'yes' : 'no' });
        // If we have a NEW click ID, process it (even if we have stored leadId)
        if (clickId) {
            // Convert URL params to URLSearchParams string format
            const urlParamsString = new URLSearchParams(urlParams).toString();
            // Build the dispatch data with ALL URL params as URLSearchParams string
            const dispatchData = {
                step_id: config.stepId,
                href: config.currentUrl.href,
                product_id: config.token,
                finger_print_id: config.fingerPrintId ?? await initFingerPrint.promise.promise,
                url_params: urlParamsString, // Send ALL URL parameters as string
            };
            // Send to backend and get leadId
            const leadId = await dispatch(dispatchData);
            if (leadId) {
                console.log('Received NEW leadId from backend', leadId);
                // Save to localStorage (overwrite previous)
                store.set(leadId);
                // Update URL to only have utm_source=leadId
                updateUrlWithLeadId(leadId);
                // Update all links on the page
                updateAllLinksWithLeadId(leadId);
            }
            return;
        }
        // No new click ID, check if we have stored leadId or utm_source in URL
        const storedLeadId = store.get();
        const utmSourceInUrl = urlParams[UTM_SOURCE_PARAM];
        // If we have utm_source in URL and it matches stored, just propagate it
        if (utmSourceInUrl && storedLeadId && utmSourceInUrl === storedLeadId) {
            console.log('Using existing leadId from URL', utmSourceInUrl);
            updateAllLinksWithLeadId(storedLeadId);
            return;
        }
        // If we have stored leadId but no utm_source in URL, restore it
        if (storedLeadId && !utmSourceInUrl) {
            console.log('Restoring leadId from localStorage', storedLeadId);
            updateUrlWithLeadId(storedLeadId);
            updateAllLinksWithLeadId(storedLeadId);
            return;
        }
        // No click ID, no stored leadId, no utm_source - nothing to do
        console.log('No tracking data available');
    }
    async function dynamicImport(name) {
        return new Function(`return import("${name}")`)();
    }
    function withResolvers() {
        const config = {};
        config.promise = new Promise((resolve, reject) => {
            Object.assign(config, { resolve, reject });
        });
        return config;
    }
    initFingerPrint.promise = withResolvers();
    async function initFingerPrint() {
        config.fingerPrintId = await getFingerPrintId();
        initFingerPrint.promise.resolve(config.fingerPrintId);
    }
    async function getFingerPrintId() {
        const FingerprintJS = await dynamicImport('https://cdn.skypack.dev/@fingerprintjs/fingerprintjs@4.0.1').then(res => res.default);
        const fingerPrint = await FingerprintJS.load().then((res) => res.get());
        const id = fingerPrint.visitorId;
        return id;
    }
    onMount();
    async function onMount() {
        initializeFromScript();
        initFingerPrint();
        await onLoad(handleUtmParameters);
        initWatch();
    }
    function initWatch() {
        // Watch for iframes and pass through utm_source
        mutationWatch('iframe', iframes => iframes.forEach(iframe => {
            if (iframe.src) {
                const store = stores.local.context(getLeadIdStorageKey());
                const leadId = store.get();
                if (leadId) {
                    const url = new URL(iframe.src);
                    url.searchParams.set(UTM_SOURCE_PARAM, leadId);
                    iframe.src = url.href;
                }
            }
        }));
        // Watch for new links added dynamically
        mutationWatch('a', links => {
            const store = stores.local.context(getLeadIdStorageKey());
            const leadId = store.get();
            if (leadId) {
                updateAllLinksWithLeadId(leadId);
            }
        });
    }
}

;// ./src/export/utm-handler.ts

// Initialize the UTM handler for multi-platform tracking
// Supports: Kwai (click_id), TikTok (ttclid), Facebook (fbclid), Google (gclid)
initUTMHandler({
    shouldEnableInterception: false,
});

/******/ })()
;
