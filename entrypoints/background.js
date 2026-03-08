let windowId = null;

async function openAnnotationWindow() {
  if (windowId !== null) {
    try {
      const win = await browser.windows.get(windowId);
      if (win) {
        await browser.windows.update(windowId, { focused: true });
        return;
      }
    } catch (e) {
      windowId = null;
    }
  }

  const win = await browser.windows.create({
    url: browser.runtime.getURL("window.html"),
    type: "popup",
    width: 900,
    height: 600
  });
  windowId = win.id;
}

browser.windows.onRemoved.addListener((id) => {
  if (id === windowId) {
    windowId = null;
  }
});

browser.browserAction.onClicked.addListener(openAnnotationWindow);
