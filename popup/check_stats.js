document.getElementById("checkStats").addEventListener("click", async () => {

    try{
        await browser.runtime.sendMessage({type: "FLUSH_SESSION"});

        await browser.tabs.create({
            url: browser.runtime.getURL("stats_page/stats_page.html")
        });

        window.close();

    } catch(e){

        console.error("Failed to open stats: " ,e);

    }
    
});
