const statusEl = document.getElementById('status');
const userBadgeEl = document.getElementById('userBadge');
const signupPanelEl = document.getElementById('signupPanel');
const howItWorksSectionEl = document.getElementById('howItWorksSection');
const signupFormEl = document.getElementById('signupForm');
const nameInputEl = document.getElementById('name');
const challengeAreaEl = document.getElementById('challengeArea');

const progressBarsEl = document.getElementById('progressBars');
const challengeListEl = document.getElementById('challengeList');
const currentTitleEl = document.getElementById('currentTitle');
const currentMetaEl = document.getElementById('currentMeta');
const currentBriefEl = document.getElementById('currentBrief');
const currentGuideEl = document.getElementById('currentGuide');
const currentCommandsEl = document.getElementById('currentCommands');
const currentHintEl = document.getElementById('currentHint');
const currentResultsEl = document.getElementById('currentResults');
const manualCheckBtnEl = document.getElementById('manualCheckBtn');
const toastEl = document.getElementById('toast');

const markdownSolutionSectionEl = document.getElementById('markdownSolutionSection');
const markdownCooldownTextEl = document.getElementById('markdownCooldownText');
const markdownSolutionWrapEl = document.getElementById('markdownSolutionWrap');
const markdownSolutionCodeEl = document.getElementById('markdownSolutionCode');
const copySolutionBtnEl = document.getElementById('copySolutionBtn');

let pollTimer = null;
let cooldownTimer = null;
let selectedChallengeId = null;
let lastState = null;
let toastTimer = null;
const markdownReadyAtById = Object.create(null);
const MARKDOWN_COOLDOWN_MS = 60_000;

const CATEGORY_LABELS = {
  markdown: 'Markdown',
  unix: 'Unix',
  git: 'Git',
  mixed: 'Gemischt'
};

const LEVEL_LABELS = {
  basic: 'einfach',
  intermediate: 'mittel',
  advanced: 'fortgeschritten'
};

const RESULT_TRANSLATIONS = [
  ['Missing path:', 'Pfad fehlt:'],
  ['File missing:', 'Datei fehlt:'],
  ['Text not found in', 'Text nicht gefunden in'],
  ['Regex not matched in', 'Regex passt nicht in'],
  ['Path should be missing:', 'Pfad sollte fehlen:'],
  ['Not a file:', 'Kein Datei-Pfad:'],
  ['Not a directory:', 'Kein Ordner-Pfad:'],
  ['Command pattern not logged:', 'Befehlsmuster nicht protokolliert:'],
  ['SKIP command_logged', 'ÜBERSPRUNGEN command_logged'],
  ['Restored from saved progress:', 'Aus gespeichertem Fortschritt wiederhergestellt:'],
  ['Unknown check type:', 'Unbekannter Check-Typ:'],
  ['Error in check', 'Fehler im Check'],
  ['OK ', 'OK ']
];

const UI_LABEL_TRANSLATIONS = {
  completed: 'abgeschlossen',
  current: 'aktuell',
  locked: 'gesperrt'
};

const CHALLENGE_TRANSLATIONS = {
  'md-01': {
    title: 'Markdown-Datei erstellen',
    brief: 'Erstelle Markdown.md in deinem Markdown-Arbeitsbereich.',
    hint: 'Erstelle die Datei in workspaces/{user}/markdown/Markdown.md.'
  },
  'md-02': {
    title: 'Überschriften und Listen',
    brief: 'Füge H1-H6, eine Aufzählung und eine nummerierte Liste mit Unterpunkten hinzu.',
    hint: 'Nutze # bis ###### sowie - und 1. mit eingerückten Unterpunkten.'
  },
  'md-03': {
    title: 'Callout und PowerShell-Block',
    brief: 'Füge einen Callout (>) und einen PowerShell-Codeblock mit Hello World ein.',
    hint: 'Nutze > für den Callout und ```powershell für den Codeblock.'
  },
  'md-04': {
    title: 'Klickbarer Link',
    brief: 'Füge mindestens einen klickbaren Markdown-Link ein.',
    hint: 'Format: [Text](https://beispiel.de)'
  },
  'md-05': {
    title: 'Bild einbetten',
    brief: 'Füge ein eingebettetes Bild in Markdown ein.',
    hint: 'Format: ![Alt-Text](https://beispiel.de/bild.png)'
  },
  'md-06': {
    title: 'Markdown-Tabelle',
    brief: 'Füge eine Tabelle mit Kopfzeile, Trenner und Datenzeile ein.',
    hint: 'Nutze die Pipe-Syntax mit mindestens zwei Spalten.'
  },
  'unix-01': {
    title: 'Ordnerstruktur bauen',
    brief: 'Erstelle den Ordner und die Datei im richtigen Pfad.',
    hint: 'Nutze mkdir -p, cd und touch.'
  },
  'unix-02': {
    title: 'Umbenennen und schreiben',
    brief: 'Benenne die Datei um und schreibe eine Zeile hinein.',
    hint: 'Nutze mv und echo "..." > datei.'
  },
  'unix-03': {
    title: 'Pipeline-Profi',
    brief: 'Zähle Zeilen mit einer Pipeline und speichere das Ergebnis.',
    hint: 'Beispiel: cat datei | wc -l > count.txt'
  },
  'git-01': {
    title: 'Init und erster Commit',
    brief: 'Erstelle ein Git-Repo mit erstem Commit im Workspace.',
    hint: 'git init, git add, git commit -m ...'
  },
  'git-02': {
    title: 'Branch-Workflow',
    brief: 'Erstelle einen Feature-Branch und committe darauf.',
    hint: 'git checkout -b feature/docs'
  },
  'git-03': {
    title: 'Zurück mergen',
    brief: 'Merge feature/docs zurück nach main mit Merge-Commit.',
    hint: 'git merge --no-ff feature/docs -m "merge: feature/docs"'
  },
  'boss-01': {
    title: 'Release-Notes Boss',
    brief: 'Erstelle Release Notes in Markdown und committe sie per Git.',
    hint: 'Kombiniere Markdown + Git-Commit mit passender Message.'
  }
};

const MARKDOWN_SOLUTIONS = {
  'md-01': `# Meine erste Markdown-Challenge\n`,
  'md-02': `# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6\n\n- Punkt A\n- Punkt B\n\n1. Schritt Eins\n  - Unterpunkt\n2. Schritt Zwei\n`,
  'md-03': `> Hinweis: Das ist ein Callout\n\n\`\`\`powershell\nWrite-Output "Hello World"\n\`\`\`\n`,
  'md-04': `[StackBlitz](https://stackblitz.com)\n`,
  'md-05': `![Beispielbild](https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200)\n`,
  'md-06': `| Thema | Status |\n| --- | --- |\n| Markdown | Fertig |\n`
};

function tChallenge(challenge) {
  if (!challenge) return challenge;
  const tr = CHALLENGE_TRANSLATIONS[challenge.id];
  if (!tr) return challenge;
  return {
    ...challenge,
    title: tr.title || challenge.title,
    brief: tr.brief || challenge.brief,
    hint: tr.hint || challenge.hint
  };
}

function translateCheckMessage(message) {
  let out = String(message || '');
  for (const [from, to] of RESULT_TRANSLATIONS) {
    out = out.replace(from, to);
  }
  return out;
}

function showToast(message) {
  if (!toastEl) {
    setStatus(message);
    return;
  }

  toastEl.textContent = message;
  toastEl.hidden = false;
  toastEl.classList.add('show');

  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
    toastEl.hidden = true;
  }, 1800);
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setSignedInUI(session) {
  const signedIn = Boolean(session && session.name);
  signupPanelEl.hidden = signedIn;
  howItWorksSectionEl.hidden = signedIn;
}

function setUserBadge(session) {
  if (!session || !session.name) {
    userBadgeEl.textContent = 'Nicht angemeldet';
    return;
  }

  const mode = session.offline || !session.studentId ? 'lokal' : 'online';
  userBadgeEl.textContent = `${session.name} (${mode})`;
}

function renderProgressBars(bars) {
  progressBarsEl.innerHTML = '';

  (bars || []).forEach((bar) => {
    const row = document.createElement('div');
    row.className = 'progress-row';

    const label = document.createElement('div');
    label.className = 'progress-label';
    const labelText = CATEGORY_LABELS[bar.key] || bar.label || bar.key;
    label.textContent = `${labelText}: ${bar.done}/${bar.total}`;

    const track = document.createElement('div');
    track.className = 'progress-track';

    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = `${bar.percent}%`;

    track.appendChild(fill);
    row.appendChild(label);
    row.appendChild(track);
    progressBarsEl.appendChild(row);
  });
}

function isNavigableChallenge(challenge) {
  return challenge.status === 'completed' || challenge.status === 'current';
}

function renderChallengeList(challenges, currentId) {
  challengeListEl.innerHTML = '';

  (challenges || []).forEach((raw) => {
    const challenge = tChallenge(raw);
    const li = document.createElement('li');
    li.className = `challenge-item status-${challenge.status}`;

    const titleBtn = document.createElement('button');
    titleBtn.type = 'button';
    titleBtn.className = 'challenge-nav';
    titleBtn.disabled = !isNavigableChallenge(challenge);
    titleBtn.textContent = `${challenge.id} - ${challenge.title}`;

    if (challenge.id === currentId) {
      titleBtn.classList.add('is-selected');
    }

    titleBtn.addEventListener('click', async () => {
      if (!isNavigableChallenge(challenge)) return;
      selectedChallengeId = challenge.id;
      await refreshChallengeState(false);
    });

    const meta = document.createElement('span');
    meta.className = 'challenge-meta';
    const statusText = UI_LABEL_TRANSLATIONS[challenge.status] || challenge.status;
    const categoryLabel = CATEGORY_LABELS[challenge.category] || challenge.category;
    const levelLabel = LEVEL_LABELS[challenge.level] || challenge.level;
    meta.textContent = `${categoryLabel}/${levelLabel} • ${challenge.points} Punkte • ${statusText}`;

    li.appendChild(titleBtn);
    li.appendChild(meta);
    challengeListEl.appendChild(li);
  });
}

function toCopyButton(text, label = 'Befehl kopieren') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy-item';
  button.title = 'Klicken zum Kopieren';

  const code = document.createElement('code');
  code.textContent = text;

  const sub = document.createElement('span');
  sub.className = 'copy-label';
  sub.textContent = label;

  button.appendChild(code);
  button.appendChild(sub);

  button.addEventListener('click', async () => {
    await navigator.clipboard.writeText(text);
    showToast('Unix-Befehl kopiert.');
  });

  return button;
}

function extractUnixCommands(challenge) {
  const cmds = [];
  for (const step of challenge.guide || []) {
    const text = String(step || '');
    const match = text.match(/^Run:\s*(.+)$/i);
    if (match) {
      cmds.push(match[1].trim());
    }
  }
  return cmds;
}

function updateMarkdownSolutionUI(challenge) {
  if (!challenge || challenge.category !== 'markdown') {
    markdownSolutionSectionEl.hidden = true;
    return;
  }

  markdownSolutionSectionEl.hidden = false;
  if (!markdownReadyAtById[challenge.id]) {
    markdownReadyAtById[challenge.id] = Date.now() + MARKDOWN_COOLDOWN_MS;
  }

  const now = Date.now();
  const readyAt = markdownReadyAtById[challenge.id];
  const remainingMs = Math.max(0, readyAt - now);
  const remainingSec = Math.ceil(remainingMs / 1000);

  if (remainingMs > 0) {
    markdownCooldownTextEl.textContent = `Musterlösung in ${remainingSec}s verfügbar.`;
    markdownSolutionWrapEl.hidden = true;
    return;
  }

  markdownCooldownTextEl.textContent = 'Musterlösung verfügbar.';
  markdownSolutionWrapEl.hidden = false;

  const solution = MARKDOWN_SOLUTIONS[challenge.id] || '# Lösung\n\nBitte später definieren.';
  markdownSolutionCodeEl.textContent = solution;
}

function renderCurrentChallenge(state) {
  const raw = state.viewChallenge || state.currentChallenge;
  const challenge = tChallenge(raw);

  if (state.allCompleted && !challenge) {
    currentTitleEl.textContent = 'Alle Challenges abgeschlossen';
    currentMetaEl.textContent = `${state.completedCount}/${state.totalCount} erledigt`;
    currentBriefEl.textContent = 'Stark. Du hast alle aktuell definierten Challenges geschafft.';
    currentGuideEl.innerHTML = '';
    currentCommandsEl.innerHTML = '';
    currentHintEl.textContent = '';
    currentResultsEl.innerHTML = '';
    markdownSolutionSectionEl.hidden = true;
    return;
  }

  if (!challenge) {
    currentTitleEl.textContent = 'Aktuelle Challenge';
    currentMetaEl.textContent = '';
    currentBriefEl.textContent = 'Keine Challenge verfügbar.';
    currentGuideEl.innerHTML = '';
    currentCommandsEl.innerHTML = '';
    currentHintEl.textContent = '';
    currentResultsEl.innerHTML = '';
    markdownSolutionSectionEl.hidden = true;
    return;
  }

  const currentTag = challenge.isCurrent ? 'aktuell' : 'abgeschlossen';
  const categoryLabel = CATEGORY_LABELS[challenge.category] || challenge.category;
  const levelLabel = LEVEL_LABELS[challenge.level] || challenge.level;

  currentTitleEl.textContent = `${challenge.id}: ${challenge.title}`;
  currentMetaEl.textContent = `${categoryLabel}/${levelLabel} • ${challenge.points} Punkte • ${currentTag}`;
  currentBriefEl.textContent = challenge.brief || '';

  currentGuideEl.innerHTML = '';
  (challenge.guide || []).forEach((step) => {
    const li = document.createElement('li');
    li.textContent = step;
    currentGuideEl.appendChild(li);
  });

  currentCommandsEl.innerHTML = '';
  if (challenge.category === 'unix') {
    const commands = extractUnixCommands(challenge);
    commands.forEach((cmd) => {
      currentCommandsEl.appendChild(toCopyButton(cmd, 'Unix-Befehl kopieren'));
    });
  }

  currentHintEl.textContent = challenge.hint ? `Hinweis: ${challenge.hint}` : '';

  currentResultsEl.innerHTML = '';
  (challenge.results || []).forEach((result) => {
    const li = document.createElement('li');
    li.className = result.pass ? 'result-pass' : 'result-fail';
    const msg = translateCheckMessage(result.message);
    const prefix = result.pass ? 'BESTANDEN' : 'NICHT BESTANDEN';
    li.title = `${prefix} - ${msg}`;

    const dot = document.createElement('span');
    dot.className = 'result-dot';
    dot.setAttribute('aria-label', li.title);
    li.appendChild(dot);

    const label = document.createElement('span');
    label.className = 'result-label';
    label.textContent = result.pass ? 'Bestanden' : 'Fehlgeschlagen';
    li.appendChild(label);

    currentResultsEl.appendChild(li);
  });

  updateMarkdownSolutionUI(challenge);
}

function renderChallengeState(payload) {
  challengeAreaEl.hidden = false;
  lastState = payload;

  if (!selectedChallengeId) {
    selectedChallengeId = payload.viewChallengeId || (payload.currentChallenge && payload.currentChallenge.id) || null;
  }

  renderProgressBars(payload.progressBars || []);
  renderChallengeList(payload.challenges || [], payload.viewChallengeId);
  renderCurrentChallenge(payload);

  if (payload.allCompleted) {
    setStatus(`Fertig: ${payload.completedCount}/${payload.totalCount} Challenges abgeschlossen.`);
    return;
  }

  setStatus(`Fortschritt: ${payload.completedCount}/${payload.totalCount} abgeschlossen.`);
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

function startCooldownTimer() {
  if (cooldownTimer) return;
  cooldownTimer = setInterval(() => {
    if (!lastState) return;
    const raw = lastState.viewChallenge || lastState.currentChallenge;
    if (!raw || raw.category !== 'markdown') return;
    updateMarkdownSolutionUI(tChallenge(raw));
  }, 1000);
}

async function refreshChallengeState(manual) {
  const endpoint = manual ? '/api/challenges/check' : '/api/challenges/state';
  const viewChallengeId = selectedChallengeId ? String(selectedChallengeId) : '';

  const options = manual
    ? {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ viewChallengeId })
      }
    : {};

  const url = manual
    ? endpoint
    : `${endpoint}${viewChallengeId ? `?viewChallengeId=${encodeURIComponent(viewChallengeId)}` : ''}`;

  const res = await fetch(url, options);

  if (res.status === 401) {
    challengeAreaEl.hidden = true;
    setSignedInUI(null);
    stopPolling();
    return;
  }

  const data = await res.json();
  if (!res.ok || !data.ok) {
    setStatus(`Fehler bei Challenge-Status: ${data.error || 'Unbekannter Fehler'}`);
    return;
  }

  setUserBadge(data.session);
  setSignedInUI(data.session);

  selectedChallengeId = data.viewChallengeId || selectedChallengeId;
  renderChallengeState(data);
}

async function loadStatus() {
  const res = await fetch('/api/status');
  const data = await res.json();

  setUserBadge(data.session);
  setSignedInUI(data.session);

  if (data.session) {
    if (data.session.offline || !data.session.studentId) {
      const details = data.session.lastCentralError ? ` Letzter Fehler: ${data.session.lastCentralError}` : '';
      setStatus(`Lokal angemeldet als ${data.session.name}. Zentrale Synchronisierung ausstehend.${details}`);
    } else {
      setStatus(`Angemeldet als ${data.session.name}.`);
    }

    nameInputEl.value = data.session.name;
    selectedChallengeId = null;
    await refreshChallengeState(false);
    startPolling();
  } else {
    challengeAreaEl.hidden = true;
    setSignedInUI(null);
    setStatus('Noch nicht angemeldet. Bitte Namen eingeben.');
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
    setStatus(`Fehler: ${data.error || 'Anmeldung fehlgeschlagen'}`);
    return;
  }

  setUserBadge(data.session);
  setSignedInUI(data.session);

  if (data.offline || (data.session && !data.session.studentId)) {
    const details = data.error ? ` Details: ${data.error}` : '';
    setStatus(`Lokal angemeldet als ${data.session.name}. Zentrale derzeit nicht erreichbar.${details}`);
  } else if (data.session) {
    setStatus(`Bereit: ${data.session.name} ist angemeldet.`);
  }

  selectedChallengeId = null;
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

copySolutionBtnEl.addEventListener('click', async () => {
  const value = markdownSolutionCodeEl.textContent || '';
  await navigator.clipboard.writeText(value);
  showToast('Musterlösung kopiert.');
});

startCooldownTimer();
void loadStatus();
