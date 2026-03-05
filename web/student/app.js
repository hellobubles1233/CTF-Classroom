async function loadStatus() {
  const res = await fetch('/api/status');
  const data = await res.json();
  const status = document.getElementById('status');

  if (data.session) {
    if (data.session.offline || !data.session.studentId) {
      status.textContent = `Signed in locally as ${data.session.name}. Central sync pending; rejoin later.`;
    } else {
      status.textContent = `Signed in as ${data.session.name} (${data.session.studentId})`;
    }
    document.getElementById('name').value = data.session.name;
  } else {
    status.textContent = 'Not signed in yet. Enter your name to join.';
  }
}

document.getElementById('signupForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.getElementById('name').value.trim();

  const res = await fetch('/api/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name })
  });

  const data = await res.json();
  const status = document.getElementById('status');

  if (!res.ok) {
    status.textContent = `Error: ${data.error || 'Signup failed'}`;
    return;
  }

  if (data.offline || (data.session && !data.session.studentId)) {
    status.textContent = `Joined locally as ${data.session.name}. Central is unreachable right now; click Join / Rejoin later to sync.`;
    return;
  }

  status.textContent = `Ready: ${data.session.name} joined.`;
});

loadStatus();
