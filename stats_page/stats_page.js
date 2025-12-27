import Chart from "chart.js/auto";

//Converts raw ms to number of hours and minutes
function msToHuman(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;

  } else{
    return `${minutes}m ${seconds}s`;
  }
}

//Sorts the domain in a descending order
function sortDomainsByTimeDesc(entries) {
  return entries.sort((a, b) => b[1] - a[1]);
}

//Wrapper to retrieve data
function storageGet(keysOrDefaults) {
  return browser.storage.local.get(keysOrDefaults);
}

//Global variable; pieChartInstance is first null.
let pieChartInstance = null;
let lineChartInstance = null;

let gDayIndexNewestFirst = [];
let gBuckets = {};

let gSelectedDay = null;     
let gSelectedDomain = null; 

//helper for line graph and pie chart

/* 
Personal Notes:
bucket -> one days data; just domain and total time in ms


*/

//For a single day build the hashmap for domain and time
function computeDomainTotalsFromBucket(bucketObj) {
  const totals = new Map();

  for (const [domain, ms] of Object.entries(bucketObj || {})) {
    totals.set(domain, (totals.get(domain) || 0) + ms);

  }

  return totals;
}

//Aggregates over multiple days; goes over single day and coaletes domain and total-time
function computeOverallDomainTotals(dayIndexNewestFirst, buckets) {
  const totals = new Map();
  for (const day of dayIndexNewestFirst) {
    const bucket = buckets[`day:${day}`] || {};

    for (const [domain, ms] of Object.entries(bucket)) {
      totals.set(domain, (totals.get(domain) || 0) + ms);

    }
  }

  return totals;
}

//Goes over days and gives day -> total time
function computeDailyTotals(dayIndexNewestFirst, buckets) {
  
  return dayIndexNewestFirst.map((day) => {
    const bucket = buckets[`day:${day}`] || {};
    let sum = 0;
    for (const ms of Object.values(bucket)) sum += ms;
    return sum;
  });
}

//For a domain, goes over every day and gives me the time for that domain (for line graph)
function computeDailySeriesForDomain(dayIndexNewestFirst, buckets, domain) {
  return dayIndexNewestFirst.map((day) => {
    const bucket = buckets[`day:${day}`] || {};
    return bucket[domain] || 0;
  });
}

//Only keep the top 7 domains for each day/total
function topNWithOther(domainTotalsMap, topN = 7, minMs = 60_000) {
  const entries = Array.from(domainTotalsMap.entries())
    .filter(([, ms]) => ms >= minMs)
    .sort((a, b) => b[1] - a[1]);

  const top = entries.slice(0, topN);
  const rest = entries.slice(topN);
  const otherSum = rest.reduce((acc, [, ms]) => acc + ms, 0);

  if (otherSum > 0) top.push(["Other", otherSum]);
  return top;
}

//Function helper, given an id (for div container), and text; sets the text in that id
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

//Chart creation/updates

//Ensures that the chart library is loaded
function ensureChartJSLoaded() {
  if (typeof Chart === "undefined") {
    throw new Error("Chart.js is not loaded. Check vendor/chart.umd.min.js path and manifest packaging.");
  }
}


//Color labels; ensures that other is reserved for grey
function colorsForLabels(labels) {
  const palette = [
    "#0A84FF", "#FF375F", "#FF9F0A", "#AF52DE", "#34C759",
    "#64D2FF", "#FFD60A", "#5E5CE6", "#FF453A", "#00C7BE",
    "#AC8E68", "#40C8E0"
  ];

  let i = 0;
  return labels.map((label) => {
    if (label === "Other") {
      return "#8E8E93";
    } else{
      const c = palette[i % palette.length]; //for wrapping around
      i++;
      return c;
    }
  })
}


//Creates/Updates the pie-chart
function buildOrUpdatePie(labels, dataMinutes) {
  const canvas = document.getElementById("pieChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  //first time, create a new piechart!
  if (!pieChartInstance) {
    pieChartInstance = new Chart(ctx, {
      type: "pie",
      data: {
        labels,
        datasets: [{ data: dataMinutes,
            backgroundColor: colorsForLabels(labels),
            borderColor: "#FFFFFF",
            borderWidth: 2
         }]
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: (item) => `${item.label}: ${item.raw} min`
            }
          }
        }
      }
    });
  } else { //Second time; change the data of the pie chart instance
    pieChartInstance.data.labels = labels;  
    pieChartInstance.data.datasets[0].data = dataMinutes;
    pieChartInstance.data.datasets[0].backgroundColor = colorsForLabels(labels);
    pieChartInstance.update();
  }
}

//Creates/Updates the line-chart
function buildOrUpdateLine(labels, dataMinutes, subtitleText) {
  const canvas = document.getElementById("lineChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  
  //First time; create a line graph instance
  if (!lineChartInstance) {
    lineChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Minutes",
          data: dataMinutes,
          tension: 0.25,
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => `${v}m` }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => `${item.raw} min`
            }
          }
        }
      }
    });
  } else { //Second time; change the data
    lineChartInstance.data.labels = labels;
    lineChartInstance.data.datasets[0].data = dataMinutes;
    lineChartInstance.update();
  }

  if (subtitleText){ 
    setText("lineSubtitle", subtitleText);
  }
}

//Renders pie for the over all; used for reset pie chart button
function renderPieForOverall() {
  const totals = computeOverallDomainTotals(gDayIndexNewestFirst, gBuckets);
  const pieEntries = topNWithOther(totals, 7, 60_000);
  const labels = pieEntries.map(([d]) => d);
  const minutes = pieEntries.map(([, ms]) => Math.round(ms / 60000));

  buildOrUpdatePie(labels, minutes);
  setText("pieSubtitle", "Overall (7 days)");
  gSelectedDay = null;
}

//Renders pie for that day
function renderPieForDay(day) {
  const bucket = gBuckets[`day:${day}`] || {};
  const totals = computeDomainTotalsFromBucket(bucket);
  const pieEntries = topNWithOther(totals, 7, 60_000);
  const labels = pieEntries.map(([d]) => d);
  const minutes = pieEntries.map(([, ms]) => Math.round(ms / 60000));

  buildOrUpdatePie(labels, minutes);
  setText("pieSubtitle", `Day: ${day}`);
  gSelectedDay = day;
}

//Renders line for the over all; used for reset pie chart button
function renderLineForTotals() {
  
  //Oldest to newest
  const daysChron = gDayIndexNewestFirst.slice().reverse();
  const dailyTotalsMs = computeDailyTotals(gDayIndexNewestFirst, gBuckets).slice().reverse();
  const minutes = dailyTotalsMs.map(ms => Math.round(ms / 60000));

  buildOrUpdateLine(daysChron, minutes, "Total time per day");
  gSelectedDomain = null;
}

//Renders line graph for a specific domain
function renderLineForDomain(domain) {
  const daysChron = gDayIndexNewestFirst.slice().reverse();
  const seriesMs = computeDailySeriesForDomain(gDayIndexNewestFirst, gBuckets, domain).slice().reverse();
  const minutes = seriesMs.map(ms => Math.round(ms / 60000));

  buildOrUpdateLine(daysChron, minutes, `Site: ${domain}`);
  gSelectedDomain = domain;
}

//Ui initializiation


async function loadAllDays() {
  const status = document.getElementById("status");
  if (status) status.textContent = "Loading...";

  ensureChartJSLoaded();

  const res = await storageGet({ dayIndex: [] });
  let dayIndex = res.dayIndex;//Reading the dayIndex

  if (!Array.isArray(dayIndex) || dayIndex.length < 1) {

    await new Promise(r => setTimeout(r, 200));
    const res2 = await storageGet({ dayIndex: [] });
    dayIndex = res2.dayIndex;

    if (!Array.isArray(dayIndex) || dayIndex.length < 1) {
      status.textContent = "No data to show";
      return;
    }
    
  }

  // newest first for list behavior / quick access
  dayIndex = [...dayIndex].sort().reverse();

  const keys = dayIndex.map(d => `day:${d}`);
  const buckets = await storageGet(keys);

  // store globals
  gDayIndexNewestFirst = dayIndex;
  gBuckets = buckets;

  //Initializing over all days
  renderPieForOverall();
  renderLineForTotals();

  //The days (drop-downs)
  renderDays(dayIndex, buckets);

  // wire reset buttons

  //Reset Button for pie
  const resetPieBtn = document.getElementById("resetPie");
  if (resetPieBtn) {
    resetPieBtn.onclick = () => {
      closeAllDays();// closing the daily dropdowns (optional, feels consistent)
      renderPieForOverall();
    };
  }

  //Reset button for line graph
  const resetLineBtn = document.getElementById("resetLine");
  if (resetLineBtn) {
    resetLineBtn.onclick = () => {
      clearSelectedSiteHighlight(); //Clears whatever line graph there was
      renderLineForTotals(); //Renders line graph for the total time
    };
  }

  if (status) status.textContent = "";
}

function closeAllDays() {
  const all = document.querySelectorAll("details.day");
  for (const d of all) d.open = false;
}

function clearSelectedSiteHighlight() {
  const all = document.querySelectorAll(".siteRow.isSelected");
  for (const el of all) el.classList.remove("isSelected");
}

//Rendering UI for the daily/day drop downs. 
function renderDays(daysNewestFirst, buckets) {
  
  //First clearing the previous data
  const container = document.getElementById("daysContainer");
  if (!container) return;
  container.innerHTML = "";

  //For each day (sorted), build the drop-down
  daysNewestFirst.forEach((day, idx) => {
    const storageKey = `day:${day}`;
    const bucket = buckets[storageKey] || {};

    const entries = Object.entries(bucket)
      .filter(([, ms]) => ms >= 60_000); // 1 minute threshold

    const sortedEntries = sortDomainsByTimeDesc(entries);

    const details = createDaySection(day, sortedEntries); //Function helper; creates each day per se

    // Optional: open newest day by default
    if (idx === 0) {
      details.open = true;
    }

    container.appendChild(details);
  });
}

//Creates each drop down day for a single/given day; used in renderDays
//"main logic"
function createDaySection(day, entries) {
  const details = document.createElement("details");
  details.classList.add("day");

  const summary = document.createElement("summary");
  summary.textContent = day;
  details.appendChild(summary); //Details tag has summary as a child

  const body = document.createElement("div");
  body.classList.add("dayBody"); //Actual 'meat' of that day


  //If no entries, leave it
  if (entries.length < 1) {
    const p = document.createElement("p");
    p.classList.add("empty");
    p.textContent = "No sites above 1 minute";
    body.appendChild(p);
    details.appendChild(body);

    // still allow day-open to update pie (will show empty / no labels)
    details.addEventListener("toggle", () => {
      if (details.open) renderPieForDay(day);
    });

    return details;
  }

  //Creating a list
  const ul = document.createElement("ul");

  for (const [domain, ms] of entries) { //Iterating through each of the domain:time of the entries
    const li = document.createElement("li");

    // make it a clickable row (button-like)
    const row = document.createElement("div");
    row.classList.add("siteRow");
    row.dataset.domain = domain;

    const left = document.createElement("span"); //Holds the domain name
    left.classList.add("siteDomain");
    left.textContent = domain;

    const right = document.createElement("span"); //Holds the time
    right.classList.add("siteTime");
    right.textContent = msToHuman(ms);

    row.appendChild(left);
    row.appendChild(right);

    // click website -> update line chart to that domain
    row.addEventListener("click", (e) => {
      e.stopPropagation();

      clearSelectedSiteHighlight();//Clearing the line graph
      row.classList.add("isSelected");

      renderLineForDomain(domain);
    });

    li.appendChild(row);
    ul.appendChild(li);
  }

  body.appendChild(ul);
  details.appendChild(body);

  //Adding event listener for the pie chart rendering
  //Note I have used toggle; not click
  details.addEventListener("toggle", () => {
    if (details.open) {
      
      // closing all the other days
      const all = document.querySelectorAll("details.day");

      for (const d of all) {
        if (d !== details) {
          d.open = false;
        }
      }
      renderPieForDay(day);
    }
  });

  return details;
}

// Startup

document.addEventListener("DOMContentLoaded", async () => {
  //Initial load
  await loadAllDays().catch(console.error);

  //Listen for background updates
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    
    // Only refresh if relevant data changed
    const relevantChange = changes.dayIndex || Object.keys(changes).some(k => k.startsWith("day:"));
    if (relevantChange) {
      console.log("Storage updated, refreshing UI...");
      loadAllDays().catch(console.error);
    }
  });
});

// document.addEventListener("DOMContentLoaded",  () => {
//   loadAllDays().catch((err) => {
//     console.error(err);
//     const elem = document.getElementById("status");
//     if (elem) elem.textContent = "Error loading stats.";
//   });

//   browser.storage.onChanged.addListener((changes, area) => {
//     if (area !== "local") return;
//     if (changes.dayIndex || Object.keys(changes).some(k => k.startsWith("day:"))) {
//       loadAllDays().catch(console.error);
//     }
//   });
// });


