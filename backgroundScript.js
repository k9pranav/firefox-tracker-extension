import * as tldts from "tldts";

const DEBUG = true;

const DEV_TIME_SCALE = 120;

function dgb(...args){
    if (DEBUG) {
        console.log("[tracker]", ...args);
    }
}

console.log("tldts loaded", Object.keys(tldts));
globalThis._tldts = tldts;

if (typeof tldts.getDomain !== "function") {
    console.error("tldts.getDomain missing!", tldts);
}

const IDLE_DETECTION_SECONDS = 60            //optional, if using idle API
const KEEP_DAYS = 7                          //keep only last 7 days
const TRACK_SCHEMES = ["http:", "https:"]    //ignore about:, moz-extension:, etc.

//GLOBAL IN-MEMORY STATE
const state = {
  currentTabId: null,
  currentWindowId: null,
  currentDomain: null,
  startTimeMs: null,

  isFirefoxFocused: true, // Defaulting to true is usually safer for startup
  isUserIdle: false       // Assuming user is active on startup
};

state.trace = [];
function trace(evt, data = {}){
    const row = {t:Date.now(), evt, ...data};
    state.trace.push(row);

    if (state.trace.length > 200) {
        state.trace.shift()
    }

    dgb(evt, data);
}

function dayKeyLocal(timestampMs){

    let date;
    if (timestampMs === undefined || timestampMs === null) {
        date = new Date();
    } else{
        date = new Date(timestampMs);
    }
    
    let day = String(date.getDate()).padStart(2, "0");
    let month = String(date.getMonth() + 1).padStart(2, "0"); //Months are zero indexed
    let year = date.getFullYear();
    let currentDate = `${year}-${month}-${day}`;
    return currentDate;
}

function lastSevenDays(){
    var seven_keys = [];

    for (let i = 0; i < 7; i++) {
        var date = new Date()
        date.setDate(date.getDate() - i);
        let day = String(date.getDate()).padStart(2, "0");
        let month = String(date.getMonth() + 1).padStart(2, "0"); //Months are zero indexed
        let year = date.getFullYear();
        let currentDate = `${year}-${month}-${day}`;

        seven_keys.push(currentDate);

    }

    return seven_keys;
}

function storageGet(daykey){
    let results = browser.storage.local.get(daykey) //browser get wrapper
    return results;
}

//Setting the entire store area
function storageSet(newStore){
    return browser.storage.local.set(newStore);
}

//Removing a specific day
function storageRemove(daykey){
    return browser.storage.local.remove(daykey);
}

//Converts the time to a new date, the next day
function localMidnightAfter(timeStamp){
    const date = new Date(timeStamp);
    date.setDate(date.getDate() + 1);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

//Domain Helpers 

//Returns true or false if the url starts with http/https and has a valid hostname
//Using try and catch as url just throws an error
function isTrackableUrl(urlString){
    try{
        const url = new URL(urlString);

        let isHttp = false;
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            isHttp = true;
        }

        let hostname = false;
        if (url.hostname.length > 0){
            hostname = true;
        }

        return isHttp && hostname;

    } catch (e){
        return false
    }
}

function baseDomainFromUrl(urlString) {
  
    if (!isTrackableUrl(urlString)) { //Checking if it is valid url or not
        return null;
    }

    try {
        const url = new URL(urlString);
        const domain = tldts.getDomain(url.hostname);
        
        return domain || null; // parsed.domain is the eTLD+1 (e.g., 'google.com' or 'google.co.uk')

    } catch (e) {
        return null;
    }
}

//Initialization of the data

async function initializeDay() {
    let today = dayKeyLocal();
    let allowedKeys = lastSevenDays();

    //Load dayindex
    const result = await storageGet({dayIndex: []});
    let dayIndex = result.dayIndex;

    //Check for first installation
    if (dayIndex == null || Array.isArray(dayIndex) == false) {
        dayIndex = []
    }

    //Keep only the allowed keys
    let oldIndex = [...dayIndex];
    dayIndex = dayIndex.filter(k => allowedKeys.includes(k));

    //Adding today
    if(!dayIndex.includes(today)){
        dayIndex.push(today);
    }

    const todayKey = `day:${today}`;
    const res2 = await storageGet({ [todayKey]: {} }); //Getting today's data, or an empty list
    
    const todayBucket = res2[todayKey];

    if (todayBucket == null || typeof todayBucket !== "object" || Array.isArray(todayBucket)) {
        await storageSet({ [todayKey]: {} });
    }

    let dropped = oldIndex.filter(k => !dayIndex.includes(k));
    if (dropped.length >= 1) {
        for (let i = 0; i < dropped.length; i++) {
            let newDay = "day:" + dropped[i];
            await storageRemove(newDay);
        }
    }

    await storageSet({dayIndex});

}

//Write time to daily buckets
async function addIntervalToDailyBuckets(domain, startMs, endMs){
    
    if (DEBUG) {
        endMs = startMs + (endMs - startMs) * DEV_TIME_SCALE;
    }

    if (domain == null) {
        return;
    }

    if (endMs <= startMs) {
        return;
    }

    while (dayKeyLocal(startMs) != dayKeyLocal(endMs)){
        let day = dayKeyLocal(startMs);
        let midnight = localMidnightAfter(startMs);
        await addToOneDay(domain, day, midnight-startMs);
        startMs = midnight
    }

    let day = dayKeyLocal(startMs);
    await addToOneDay(domain, day, endMs - startMs);
}

async function addToOneDay(domain, daykey, delta) {
    if (delta <= 0) {
        return
    }

    //Enforcing last 7 days policy
    //let date = new Date();
    //let now = date.getTime();
    //let today = dayKeyLocal(now);
    let allowedKeys = lastSevenDays();

    const storageKey = `day:${daykey}`;
    
    const res = await storageGet({dayIndex: [], [storageKey]: {}})
    let dayIndex = res.dayIndex;
    const bucket = res[storageKey];

    if (!Array.isArray(dayIndex)) {
        dayIndex = [];
    }

    let oldIndex = [...dayIndex];

    //Updating my bucket
    if (!bucket[domain]) {
        bucket[domain] = 0;
    }

    bucket[domain] += delta;

    if (!dayIndex.includes(daykey)) {
        dayIndex.push(daykey);
    }

    dayIndex = dayIndex.filter(k => allowedKeys.includes(k));

    let dropped = oldIndex.filter(k => !dayIndex.includes(k));

    await storageSet({[storageKey]: bucket, dayIndex: dayIndex});

    if (dropped.length >= 1) {
        for (let i = 0; i < dropped.length; i++) {
            let newDay = "day:" + dropped[i];
            await storageRemove(newDay);
        }
    }

}


//Session Control
async function finalizeCurrentSession(reason) {

    trace("finalize:enter", { reason, dom: state.currentDomain, start: state.startTimeMs })

    if (state.currentDomain === null || state.startTimeMs === null) {
        return;
    }
    let start = state.startTimeMs;
    let domain = state.currentDomain;

    let myDate = new Date()
    let end = myDate.getTime();
    
    await addIntervalToDailyBuckets(domain, start, end);

    trace("finalize:write", { reason, domain, deltaMs: end - start });

    state.currentTabId = null;
    state.currentWindowId = null;
    state.currentDomain = null;
    state.startTimeMs = null;

    trace("finalize:done", { reason });
}

async function startSessionForTab(tab, windowId) {
    trace("start:enter", { tabId: tab?.id, url: tab?.url, windowId });

    if(!state.isFirefoxFocused){
        trace("start:blocked", { why: "not focused" });
        return;
    }

    if (state.isUserIdle) {
        trace("start:blocked", { why: "idle" });
        return;
    }

    if (!tab || !tab.url) {
        trace("start:blocked", { why: "no url" });
        return;
    }

    let domain = baseDomainFromUrl(tab.url);

    if (domain === null) {
        trace("start:blocked", { why: "untrackable" });
        return;
    }

    state.currentTabId = tab.id;
    state.currentWindowId = tab.windowId;
    state.currentDomain = domain;
    state.startTimeMs = Date.now();

    trace("start:ok", { domain, tabId: tab.id });
}

async function resumeFromFocusedWindow(windowId){
    //Checking for invalid windowId
    if (windowId === browser.windows.WINDOW_ID_NONE || !Number.isFinite(windowId)) {
        return;
    }

    if (!state.isFirefoxFocused) {
        return;
    }

    if (state.isUserIdle) {
        return;
    }

    let [tab] = await browser.tabs.query({windowId, active:true});
    if (!tab) {
        return;
    }

    await startSessionForTab(tab, windowId);
}


//Event Listeners Hooks

//Tab Activation

//Somehow, use tabId, not tab for startSessionForTab
async function handleTabActivation(activeInfo) {
    trace("event:onActivated", activeInfo);
    await finalizeCurrentSession("tab switch");
    let tab = await browser.tabs.get(activeInfo.tabId);
    await startSessionForTab(tab, activeInfo.windowId);

}

browser.tabs.onActivated.addListener(handleTabActivation);

//Tab Updating
async function handleTabUpdating(tabId, changeInfo, tab) {
    
    trace("event:onUpdated", { tabId, url: changeInfo.url, status: changeInfo.status });

    if (changeInfo.url === undefined || !changeInfo.url) {
        return;
    }

    let newDomain = baseDomainFromUrl(changeInfo.url);

    if (newDomain === null) {
        await finalizeCurrentSession("became untrackable");
        return;
    }

    if (newDomain != state.currentDomain) {
        await finalizeCurrentSession("domain change");
        await startSessionForTab(tab, state.currentWindowId);
    }

    //New code logic; comming from an untrackable tab, starts tracking is current tab becomes trackable
    if (state.currentTabId == null) {
        if (!state.isFirefoxFocused || state.isUserIdle) {
            return;
        }

        if (!tab?.active) {
            return;
        }

        const newDomain = baseDomainFromUrl(changeInfo.url);
        if (newDomain == null) {
            return;
        }

        await startSessionForTab(tab, tab.windowId);
    }
}

browser.tabs.onUpdated.addListener(handleTabUpdating);

//Window focused change

async function handleWindowFocus(windowId) {
    trace("event:onFocusChanged", { windowId });

    if (windowId === browser.windows.WINDOW_ID_NONE) {
        state.isFirefoxFocused = false;
        await finalizeCurrentSession("lost focus");
        return;
    }

    state.isFirefoxFocused = true;
    await finalizeCurrentSession("focus changed");
    await resumeFromFocusedWindow(windowId);
}

browser.windows.onFocusChanged.addListener(handleWindowFocus);

//Idle state Changed (not doing it since it is experimental)

//Handle remove, active tab closed
async function handleTabClosed(tabId, removeInfo) {
    trace("event:onRemoved", { tabId, removeInfo, currentTabId: state.currentTabId });

    if (tabId == state.currentTabId) {
        await finalizeCurrentSession("tab closed")
    }
}

browser.tabs.onRemoved.addListener(handleTabClosed);

/*
async function bootStrapSessionFromActiveTab(reason) {
    const [tab] = await browser.tabs.query({active:true, lastFocusedWindow: true});
    if (!tab?.url) {
        trace("bootstrap:noTab", {reason});
        return false;
    }

    const domain = baseDomainFromUrl(tab.url);
    if (!domain) {
        trace("bootstrap:untrackable", {reason, url: tab.url});
        return false;
    }

    const startGuess = Number.isFinite(tab.lastAccessed) ? tab.lastAccessed: Date.now();

    state.currentTabId = tab.id;
    state.currentWindowId = tab.windowId;
    state.currentDomain = domain;
    
    
    state.startTimeMs = startGuess;
    trace("bootstrap:ok", { reason, domain, startGuess, url: tab.url });
    return true;

}
*/


async function main() {
  await initializeDay();

  state.isUserIdle = false;

  const focusedWindow = await browser.windows.getLastFocused();

  if (focusedWindow && focusedWindow.focused) {
    state.isFirefoxFocused = true;
    await resumeFromFocusedWindow(focusedWindow.id);
  } else{
    state.isFirefoxFocused = false;
  }
//   state.isFirefoxFocused = true; // assume focused on startup; onFocusChanged will correct

//   // This is the most reliable way to get the active tab right now
//   const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });

//   if (tab?.url) {
//     await startSessionForTab(tab, tab.windowId);
//     trace("startup:started", { url: tab.url, domain: state.currentDomain });
//   } else {
//     trace("startup:noActiveTab", {});
//   }

  //await bootStrapSessionFromActiveTab("startup")
}

//To test my code!
globalThis.dev = {
    
    //Force saving current session
    flush: async() => {
        await finalizeCurrentSession('dev flush');
        console.log("flushed");
    },

    //Start a fake session
    startFakeUrl: async (url) => {
        await finalizeCurrentSession("dev startFakeUrl")
        state.isFirefoxFocused = true;
        state.isUserIdle = false;
        await startSessionForTab({id: -1, windowId: -1, url}, -1);
        console.log("started fake session: ", url);
    },

    //Inspect today's bucket
    dumpToday: async () => {
        const key = `day:${dayKeyLocal()}`;
        console.log(await browser.storage.local.get(key));
    },

    dumpState: () => console.log(JSON.parse(JSON.stringify(state))),

    cleanup: async () => {
        await initializeDay();
        console.log("Cleanup Done!");
    },

    seedDays: async (daysAgoList = [0,1,2,3,4,5,6,7,10,20]) => {
        const now = Date.now();
        const store = {};
        const dayIndex = [];

        for (const d of daysAgoList) {
            const ts = now - d * 24 * 60 * 60 * 1000;
            const day = dayKeyLocal(ts);
            const key = `day:${day}`;
            store[key] = {"example.com": d*1000 + 123};
            dayIndex.push(day);
            
        }

        store.dayIndex = dayIndex;
        await browser.storage.local.set(store);

        console.log("seeded days:" , dayIndex.sort());
    },

    dumpIndexAndKeys: async () => {
        const all = await browser.storage.local.get(null);
        const keys = Object.keys(all).filter(k => k.startsWith("day:")).sort();
        console.log("day:* keys", keys);
    },

    resetStorage: async () => {
        await browser.storage.local.clear();
        console.log("Storage Cleared");
    },

    addInterval: async (domain, startMs, endMs) => {
        await addIntervalToDailyBuckets(domain, startMs, endMs);
        console.log("added interval", domain, startMs, endMs);
    },

    seedRandomForUI: async ({
        days = 7,
        maxDomainsPerDay = 18,
        clearFirst = true,
  // Optional: end date for deterministic testing
        endDate = new Date(), // last day in the range
        } = {}) => {
        const domains = [
            "google.com","youtube.com","github.com","stackoverflow.com","wikipedia.org",
            "reddit.com","linkedin.com","twitter.com","amazon.com","netflix.com",
            "nytimes.com","bbc.com","theguardian.com","medium.com","dev.to",
            "docs.google.com","mail.google.com","calendar.google.com","discord.com",
            "slack.com","figma.com","notion.so"
        ];

        const rand = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

        const pickN = (arr, n) => {
            const copy = [...arr];
            const out = [];
            while (out.length < n && copy.length) {
                out.push(copy.splice(rand(0, copy.length - 1), 1)[0]);
            }
            return out;
        };

        const toDayKey = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

        
        const end = new Date(endDate);
        end.setHours(12, 0, 0, 0); 

        if (clearFirst) await browser.storage.local.clear();

        const store = {};
        const dayIndex = [];

        // Build oldest -> newest (matches your example)
        for (let i = days - 1; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(d.getDate() - i);

        const dayKey = toDayKey(d);
        dayIndex.push(dayKey);

        const bucket = {};
        const count = rand(3, Math.min(maxDomainsPerDay, domains.length));
        const chosen = pickN(domains, count);

        for (const domain of chosen) {
            const r = Math.random();
            let ms;

            if (r < 0.15) ms = rand(1, 4) * 60 * 60 * 1000;      // 1–4h
            else if (r < 0.7) ms = rand(2, 45) * 60 * 1000;      // 2–45m
            else ms = rand(1, 15) * 60 * 1000;                   // 1–15m

            bucket[domain] = ms;
        }

            store[`day:${dayKey}`] = bucket;
        }

        store.dayIndex = dayIndex;
        await browser.storage.local.set(store);

        console.log("seedRandomForUI done");
        console.log("dayIndex (oldest->newest):", dayIndex);
    },
    
    devTrace: () => {
        state.trace.slice(-50);
    }

}

//Saves my currect session, and then writes to the storage.local
async function checkpointCurrentSession(reason) {
  if (!state.currentDomain || !state.startTimeMs) return;

  const now = Date.now();
  const domain = state.currentDomain;
  const start = state.startTimeMs;

  // write partial interval
  await addIntervalToDailyBuckets(domain, start, now);

  //move start forward so we keep tracking seamlessly
  state.startTimeMs = now;

  trace("checkpoint:write", { reason, domain, deltaMs: now - start });
}

async function ensureSessionStarted(reason) {
  if (state.currentDomain && state.startTimeMs) return true;

  const win = await browser.windows.getLastFocused();
  if (!win?.id) return false;

  const [tab] = await browser.tabs.query({ active: true, windowId: win.id });
  if (!tab?.url) return false;

  // Make sure focus/idle flags won't block startup
  state.isFirefoxFocused = true;
  state.isUserIdle = false;

  await startSessionForTab(tab, win.id); // will set currentDomain/startTimeMs if trackable

  trace("ensureSessionStarted", {
    reason,
    gotDomain: state.currentDomain,
    tabUrl: tab.url
  });

  return !!(state.currentDomain && state.startTimeMs);
}


// browser.runtime.onMessage.addListener((msg) => {
//   if (msg?.type === "FLUSH_SESSION") {
//     return (async () => {
//       //await ensureSessionStarted("pop up flush"); 
      
//     //   if (!state.currentDomain || !state.startTimeMs) {
//     //     await bootStrapSessionFromActiveTab("pop flush bootsrap");
//     //   }

//       await checkpointCurrentSession("popup checkpoint");
//       return { ok: true };
//     })();
//   }
// });

browser.runtime.onMessage.addListener(async (msg) => {
    if (msg?.type === "FLUSH_SESSION") {
        return(async() => {
            await checkpointCurrentSession("popup checkpoint");
            return {ok: true};
        })();
    }
})


browser.runtime.onInstalled.addListener(() => {
  main().catch(console.error);
});

browser.runtime.onStartup.addListener(() => {
  main().catch(console.error);
});

main();



