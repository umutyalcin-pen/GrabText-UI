(function () {
  if (document.getElementById('grabtext-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'grabtext-overlay';
  overlay.innerHTML = `
    <style>
      #grabtext-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.3);
        cursor: crosshair;
        z-index: 2147483647;
        user-select: none;
      }
      
      #grabtext-selection {
        position: absolute;
        border: 2px solid #3b82f6;
        background: rgba(59, 130, 246, 0.1);
        pointer-events: none;
      }
      
      #grabtext-instructions {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #1a1a1a;
        color: #f5f5f5;
        padding: 12px 24px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 2147483647;
      }
      
      #grabtext-instructions kbd {
        background: #333;
        padding: 2px 6px;
        border-radius: 4px;
        margin: 0 4px;
      }
    </style>
    <div id="grabtext-instructions">
      Alanı seçmek için sürükleyin • <kbd>ESC</kbd> iptal
    </div>
    <div id="grabtext-selection"></div>
  `;

  document.body.appendChild(overlay);

  const selection = document.getElementById('grabtext-selection');
  let startX, startY, isSelecting = false;

  overlay.addEventListener('mousedown', (e) => {
    if (e.target.id !== 'grabtext-overlay') return;

    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;

    selection.style.left = startX + 'px';
    selection.style.top = startY + 'px';
    selection.style.width = '0';
    selection.style.height = '0';
    selection.style.display = 'block';
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!isSelecting) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    selection.style.left = left + 'px';
    selection.style.top = top + 'px';
    selection.style.width = width + 'px';
    selection.style.height = height + 'px';
  });

  overlay.addEventListener('mouseup', (e) => {
    if (!isSelecting) return;
    isSelecting = false;

    const rect = selection.getBoundingClientRect();

    if (rect.width < 10 || rect.height < 10) {
      cleanup();
      return;
    }

    chrome.runtime.sendMessage({
      action: 'captureArea',
      area: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        devicePixelRatio: window.devicePixelRatio
      }
    });

    cleanup();
  });

  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      cleanup();
      document.removeEventListener('keydown', escHandler);
      chrome.runtime.sendMessage({ action: 'selectionCancelled' });
    }
  });

  function cleanup() {
    const overlay = document.getElementById('grabtext-overlay');
    if (overlay) overlay.remove();
  }
})();
