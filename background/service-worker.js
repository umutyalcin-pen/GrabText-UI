chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Side panel davranışı ayarlanamadı:', error));

let pendingArea = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'captureScreen') {
        captureVisibleTab()
            .then((dataUrl) => sendResponse({ success: true, dataUrl }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'startSelection') {
        startAreaSelection(sender.tab?.id)
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'captureArea') {
        pendingArea = request.area;
        captureAndCropArea(request.area)
            .then((dataUrl) => {
                chrome.runtime.sendMessage({
                    action: 'areaCaptured',
                    dataUrl: dataUrl
                });
            })
            .catch((error) => {
                chrome.runtime.sendMessage({
                    action: 'captureError',
                    error: error.message
                });
            });
        return true;
    }

    if (request.action === 'selectionCancelled') {
        chrome.runtime.sendMessage({ action: 'selectionCancelled' });
        return true;
    }
});

async function startAreaSelection(tabId) {
    if (!tabId) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        tabId = tab?.id;
    }

    if (!tabId) {
        throw new Error('Aktif sekme bulunamadı');
    }

    await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['scripts/selection-overlay.js']
    });
}

async function captureVisibleTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
        throw new Error('Aktif sekme bulunamadı');
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'png',
        quality: 90
    });

    return dataUrl;
}

async function captureAndCropArea(area) {
    const fullScreenDataUrl = await captureVisibleTab();
    const croppedDataUrl = await cropImage(fullScreenDataUrl, area);
    return croppedDataUrl;
}

async function cropImage(dataUrl, area) {
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    const imageBitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(
        Math.round(area.width * area.devicePixelRatio),
        Math.round(area.height * area.devicePixelRatio)
    );
    const ctx = canvas.getContext('2d');

    ctx.drawImage(
        imageBitmap,
        Math.round(area.x * area.devicePixelRatio),
        Math.round(area.y * area.devicePixelRatio),
        Math.round(area.width * area.devicePixelRatio),
        Math.round(area.height * area.devicePixelRatio),
        0,
        0,
        Math.round(area.width * area.devicePixelRatio),
        Math.round(area.height * area.devicePixelRatio)
    );

    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(croppedBlob);
    });
}
