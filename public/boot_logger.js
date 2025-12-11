(function () {
    var logDiv = document.createElement('div');
    logDiv.style.position = 'fixed';
    logDiv.style.top = '0';
    logDiv.style.left = '0';
    logDiv.style.width = '100%';
    logDiv.style.height = 'auto';
    logDiv.style.maxHeight = '50%';
    logDiv.style.overflowY = 'scroll';
    logDiv.style.background = 'rgba(0,0,0,0.8)';
    logDiv.style.color = '#FF4444';
    logDiv.style.fontFamily = 'monospace';
    logDiv.style.fontSize = '12px'; // Smaller font for Pi
    logDiv.style.zIndex = '999999';
    logDiv.style.padding = '10px';
    logDiv.style.pointerEvents = 'none';
    logDiv.style.whiteSpace = 'pre-wrap';
    logDiv.id = 'boot-logger';

    // Add to body or html depending on what's available
    if (document.body) {
        document.body.appendChild(logDiv);
    } else {
        document.documentElement.appendChild(logDiv);
    }

    function log(msg) {
        // Timestamp
        var time = new Date().toLocaleTimeString();
        logDiv.innerText += '[' + time + '] ' + msg + '\n';
        console.log('[BOOT]', msg);
    }

    log('Boot Logger v1.0 Active');
    log('UA: ' + navigator.userAgent);

    window.onerror = function (msg, url, line, col, error) {
        var cleanUrl = url ? url.split('/').pop() : 'unknown';
        log('ERR: ' + msg + '\n  @ ' + cleanUrl + ':' + line + ':' + col);
        if (error && error.stack) log('  Stack: ' + error.stack);
        return false;
    };

    window.onunhandledrejection = function (e) {
        log('PROMISE ERR: ' + e.reason);
    };

    document.addEventListener('DOMContentLoaded', function () {
        log('DOM Ready');
        // Check if canvas exists
        var c = document.getElementById('gameCanvas');
        if (c) log('Canvas found'); else log('Canvas MISSING');
    });

    window.addEventListener('load', function () {
        log('Window Loaded (All assets)');
    });

})();
