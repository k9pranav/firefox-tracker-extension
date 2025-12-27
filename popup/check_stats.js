document.getElementById("checkStats").addEventListener("click", async () => {

    await browser.tabs.create({
      url: browser.runtime.getURL("stats_page/stats_page.html")
    });

    window.close();  
});
