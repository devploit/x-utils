// ---------------------------------------------------------------------------
// Snapshots in localStorage, used to diff lists between runs.
// ---------------------------------------------------------------------------

function snapshotKey(kind, owner) {
  return `xu:snapshot:${kind}:${String(owner || "unknown").toLowerCase()}`;
}

function loadSnapshot(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSnapshot(key, snapshot) {
  try {
    localStorage.setItem(key, JSON.stringify(snapshot));
    return true;
  } catch (err) {
    log.warn("Could not persist the snapshot in localStorage:", err && err.message);
    return false;
  }
}

// Reduces a user record to what a snapshot needs to identify it later.
function snapshotUser(user) {
  return { id: user.id || null, handle: user.handle, name: user.name || null };
}

function makeSnapshot(kind, owner, users) {
  return { version: 1, kind, owner, takenAt: new Date().toISOString(), count: users.length, users: users.map(snapshotUser) };
}

// ---- count history (one point per run, for trend charts) -----------------

function historyKey(kind, owner) {
  return `xu:history:${kind}:${String(owner || "unknown").toLowerCase()}`;
}

function loadHistory(key) {
  const raw = loadSnapshot(key);
  return Array.isArray(raw) ? raw : [];
}

// Appends { takenAt, count } and keeps the newest `limit` points. Returns the new history.
function appendHistory(key, point, limit = 200) {
  const history = loadHistory(key).filter((p) => p && p.takenAt && typeof p.count === "number");
  history.push({ takenAt: point.takenAt, count: point.count });
  const trimmed = history.slice(-limit);
  saveSnapshot(key, trimmed);
  return trimmed;
}

// Compares two user lists. Identity is the numeric ID when both sides have it,
// otherwise the handle (case-insensitive). Detects renames when the ID matches
// but the handle changed.
function diffUserLists(previousUsers, currentUsers) {
  const prevById = new Map();
  const prevByHandle = new Map();
  for (const u of previousUsers) {
    if (u.id) prevById.set(String(u.id), u);
    if (u.handle) prevByHandle.set(u.handle.toLowerCase(), u);
  }
  const currById = new Map();
  const currByHandle = new Map();
  for (const u of currentUsers) {
    if (u.id) currById.set(String(u.id), u);
    if (u.handle) currByHandle.set(u.handle.toLowerCase(), u);
  }

  const added = [];
  const renamed = [];
  for (const u of currentUsers) {
    const byId = u.id ? prevById.get(String(u.id)) : null;
    const byHandle = u.handle ? prevByHandle.get(u.handle.toLowerCase()) : null;
    if (!byId && !byHandle) added.push(u);
    else if (byId && byId.handle && u.handle && byId.handle.toLowerCase() !== u.handle.toLowerCase()) renamed.push({ from: byId.handle, to: u.handle, id: u.id });
  }
  const removed = [];
  for (const u of previousUsers) {
    const byId = u.id ? currById.get(String(u.id)) : null;
    const byHandle = u.handle ? currByHandle.get(u.handle.toLowerCase()) : null;
    if (!byId && !byHandle) removed.push(u);
  }
  return { added, removed, renamed };
}
