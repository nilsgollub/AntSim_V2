function logError(text) {
    var div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.top = '0';
    div.style.left = '0';
    div.style.width = '100%';
    div.style.background = 'rgba(200, 0, 0, 0.8)';
    div.style.color = 'white';
    div.style.padding = '5px';
    div.style.zIndex = '999999';
    div.style.fontSize = '12px';
    div.style.fontFamily = 'monospace';
    div.style.borderBottom = '1px solid white';
    div.innerText = text;
    document.body.appendChild(div);
}

window.onerror = function (msg, url, lineNo) {
    logError('JS: ' + msg + ' @ ' + lineNo);
    return false;
};

window.addEventListener('error', function (e) {
    if (e.target && (e.target.tagName === 'SCRIPT' || e.target.tagName === 'LINK' || e.target.tagName === 'IMG')) {
        logError('RES: Load fail ' + (e.target.src || e.target.href));
    }
}, true);
