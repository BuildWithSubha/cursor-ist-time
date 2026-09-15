'use strict';

const STORAGE_KEY = 'convertToIst';

const toggle = document.getElementById('toggle');
const status = document.getElementById('status');

function setStatus(on) {
  status.textContent = on
    ? 'On — UTC timestamps on cursor.com are shown in IST.'
    : 'Off — original UTC text is restored. No reload needed.';
}

chrome.storage.sync.get({ [STORAGE_KEY]: true }, (result) => {
  const on = result[STORAGE_KEY] !== false;
  toggle.checked = on;
  setStatus(on);
});

toggle.addEventListener('change', () => {
  const on = toggle.checked;
  chrome.storage.sync.set({ [STORAGE_KEY]: on }, () => {
    setStatus(on);
  });
});
