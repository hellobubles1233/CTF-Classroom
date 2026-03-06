const statusEl = document.getElementById('status');
const userBadgeEl = document.getElementById('userBadge');
const signupPanelEl = document.getElementById('signupPanel');
const signupFormEl = document.getElementById('signupForm');
const nameInputEl = document.getElementById('name');
const challengeAreaEl = document.getElementById('challengeArea');

const progressBarsEl = document.getElementById('progressBars');
const challengeListEl = document.getElementById('challengeList');
const currentTitleEl = document.getElementById('currentTitle');
const currentMetaEl = document.getElementById('currentMeta');
const currentBriefEl = document.getElementById('currentBrief');
const currentGuideEl = document.getElementById('currentGuide');
const currentHintEl = document.getElementById('currentHint');
const currentResultsEl = document.getElementById('currentResults');
const manualCheckBtnEl = document.getElementById('manualCheckBtn');

let pollTimer = null;

function setStatus(text) {
  statusEl.textContent = text;
}

function setSignedInUI(session) {
  signupPanelEl.hidden = Boolean(session && session.name);
}

function setUserBadge(session) {
  if (!session || !session.name) {
    userBadgeEl.textContent = 'Not signed in';
    return;
  }

  const mode = session.offline || !session.studentId ? 'offline' : 'online';
  userBadgeEl.textContent = mode === 'offline'
    ? `${session.name} (local)`
    : session.name;
}

function renderProgressBars(bars) {
  progressBarsEl.innerHTML = '';

  (bars || []).forEach((bar) => {
    const row = document.createElement('div');
    row.className = 'progress-row';

    const label = document.createElement('div');
    label.className = 'progress-label';
    label.textContent = `${bar.label} (${bar.done}/${bar.total})`;

    const track = document.createElement('div');
    track.className = 'progress-track';

    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = `${bar.percent}%`;
    fill.textContent = `${bar.percent}%`;

    track.appendChild(fill);
    row.appendChild(label);
    row.appendChild(track);
    progressBarsEl.appendChild(row);
  });
}

function renderChallengeList(challenges) {
  challengeListEl.innerHTML = '';

  (challenges || []).forEach((challenge) => {
    const li = document.createElement('li');
    li.className = `challenge-item status-${challenge.status}`;

    const name = document.createElement('span');
    name.className = 'challenge-name';
    name.textContent = `${challenge.id} - ${challenge.title}`;

    const meta = document.createElement('span');
    meta.className = 'challenge-meta';
    meta.textContent = `${challenge.category}/${challenge.level} • ${challenge.points} pts • ${challenge.status}`;

    li.appendChild(name);
    li.appendChild(meta);
    challengeListEl.appendChild(li);
  });
}

function renderCurrentChallenge(state) {
  const current = state.currentChallenge;

  if (state.allCompleted) {
    currentTitleEl.textContent = 'All Challenges Completed';
    currentMetaEl.textContent = `${state.completedCount}/${state.totalCount} done`;
    currentBriefEl.textContent = 'Great work. You finished all currently configured challenges.';
    currentGuideEl.innerHTML = '';
    currentHintEl.textContent = '';
    currentResultsEl.innerHTML = '';
    return;
  }

  if (!current) {
    currentTitleEl.textContent = 'Current Challenge';
    currentMetaEl.textContent = '';
    currentBriefEl.textContent = 'No challenge available yet.';
    currentGuideEl.innerHTML = '';
    currentHintEl.textContent = '';
    currentResultsEl.innerHTML = '';
    return;
  }

  currentTitleEl.textContent = `${current.id}: ${current.title}`;
  currentMetaEl.textContent = `${current.category}/${current.level} • ${current.points} pts`;
  currentBriefEl.textContent = current.brief || '';

  currentGuideEl.innerHTML = '';
  (current.guide || []).forEach((step) => {
    const li = document.createElement('li');
    li.textContent = step;
    currentGuideEl.appendChild(li);
  });

  currentHintEl.textContent = current.hint ? `Hint: ${current.hint}` : '';

  currentResultsEl.innerHTML = '';
  (current.results || []).forEach((result) => {
    const li = document.createElement('li');
    li.className = result.pass ? 'result-pass' : 'result-fail';
    li.textContent = `${result.pass ? 'PASS' : 'FAIL'} - ${result.message}`;
    currentResultsEl.appendChild(li);
  });
}

function renderChallengeState(payload) {
  challengeAreaEl.hidden = false;
  renderProgressBars(payload.progressBars || []);
  renderChallengeList(payload.challenges || []);
  renderCurrentChallenge(payload);

  if (payload.allCompleted) {
    setStatus(`Completed ${payload.completedCount}/${payload.totalCount} challenges.`);
    return;
  }

  setStatus(`Progress: ${payload.completedCount}/${payload.totalCount} completed.`);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    void refreshChallengeState(false);
  }, 4000);
}

async function refreshChallengeState(manual) {
  const endpoint = manual ? '/api/challenges/check' : '/api/challenges/state';
  const options = manual
    ? {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      }
    : {};

  const res = await fetch(endpoint, options);

  if (res.status === 401) {
    challengeAreaEl.hidden = true;
    setSignedInUI(null);
    stopPolling();
    return;
  }

  const data = await res.json();
  if (!res.ok || !data.ok) {
    setStatus(`Challenge error: ${data.error || 'Unable to load state'}`);
    return;
  }

  setUserBadge(data.session);
  setSignedInUI(data.session);
  renderChallengeState(data);
}

async function loadStatus() {
  const res = await fetch('/api/status');
  const data = await res.json();

  setUserBadge(data.session);
  setSignedInUI(data.session);

  if (data.session) {
    if (data.session.offline || !data.session.studentId) {
      const details = data.session.lastCentralError ? ` Last error: ${data.session.lastCentralError}` : '';
      setStatus(`Signed in locally as ${data.session.name}. Central sync pending.${details}`);
    } else {
      setStatus(`Signed in as ${data.session.name}.`);
    }

    nameInputEl.value = data.session.name;
    await refreshChallengeState(false);
    startPolling();
  } else {
    challengeAreaEl.hidden = true;
    setSignedInUI(null);
    setStatus('Not signed in yet. Enter your name to join.');
  }
}

signupFormEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInputEl.value.trim();

  const res = await fetch('/api/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name })
  });

  const data = await res.json();

  if (!res.ok && !data.session) {
    setSignedInUI(null);
    setStatus(`Error: ${data.error || 'Signup failed'}`);
    return;
  }

  setUserBadge(data.session);
  setSignedInUI(data.session);

  if (data.offline || (data.session && !data.session.studentId)) {
    const details = data.error ? ` Details: ${data.error}` : '';
    setStatus(`Joined locally as ${data.session.name}. Central unreachable.${details}`);
  } else if (data.session) {
    setStatus(`Ready: ${data.session.name} joined.`);
  }

  await refreshChallengeState(true);
  startPolling();
});

manualCheckBtnEl.addEventListener('click', async () => {
  manualCheckBtnEl.disabled = true;
  try {
    await refreshChallengeState(true);
  } finally {
    manualCheckBtnEl.disabled = false;
  }
});

void loadStatus();
