// ---------------------------------------------------------------------------
// localDb.js – localStorage-backed data layer replacing Base44 SDK
// ---------------------------------------------------------------------------

const STORAGE_KEYS = {
  quizzes: 'wiz_quizzes',
  flashcards: 'wiz_flashcards',
  files: 'wiz_files',
  user: 'wiz_user',
  session: 'wiz_session',
};

// ---- helpers ---------------------------------------------------------------

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let _nextId = Date.now();
function nextId() {
  return String(++_nextId);
}

// ---- generic CRUD factory --------------------------------------------------

function createEntityStore(storageKey) {
  function getAll() {
    return read(storageKey) || [];
  }

  function saveAll(items) {
    write(storageKey, items);
  }

  return {
    /** list(sortField?) – returns all items, optionally sorted.
     *  Prefix sortField with "-" for descending. */
    async list(sortField) {
      let items = getAll();
      if (sortField) {
        const desc = sortField.startsWith('-');
        const field = desc ? sortField.slice(1) : sortField;
        items = [...items].sort((a, b) => {
          const av = a[field] ?? '';
          const bv = b[field] ?? '';
          if (av < bv) return desc ? 1 : -1;
          if (av > bv) return desc ? -1 : 1;
          return 0;
        });
      }
      return items;
    },

    async filter(query) {
      const items = getAll();
      return items.filter((item) =>
        Object.entries(query).every(([k, v]) => item[k] === v),
      );
    },

    async get(id) {
      return getAll().find((i) => i.id === id) || null;
    },

    async create(data) {
      const items = getAll();
      const item = { id: nextId(), created_date: new Date().toISOString(), ...data };
      items.push(item);
      saveAll(items);
      return item;
    },

    async update(id, patch) {
      const items = getAll();
      const idx = items.findIndex((i) => i.id === id);
      if (idx === -1) throw new Error('Item not found');
      items[idx] = { ...items[idx], ...patch };
      saveAll(items);
      return items[idx];
    },

    async delete(id) {
      let items = getAll();
      items = items.filter((i) => i.id !== id);
      saveAll(items);
      return {};
    },
  };
}

// ---- seed data -------------------------------------------------------------

function seedFlashcardsIfEmpty() {
  const existing = read(STORAGE_KEYS.flashcards);
  if (existing && existing.length > 0) return;

  const cards = [
    { id: nextId(), category: 'Cell Biology', front: 'What is the powerhouse of the cell?', back: 'The mitochondria. It produces ATP through oxidative phosphorylation, providing energy for cellular processes.', mastered: false, difficulty: null, interval: null },
    { id: nextId(), category: 'Cell Biology', front: 'What is the function of the Golgi apparatus?', back: 'The Golgi apparatus modifies, sorts, and packages proteins and lipids for transport to their final destinations within or outside the cell.', mastered: false, difficulty: null, interval: null },
    { id: nextId(), category: 'Cell Biology', front: 'Define osmosis.', back: 'Osmosis is the passive movement of water molecules across a selectively permeable membrane from an area of lower solute concentration to higher solute concentration.', mastered: false, difficulty: null, interval: null },
    { id: nextId(), category: 'Biochemistry', front: 'What are the products of the Krebs Cycle?', back: '2 ATP, 6 NADH, 2 FADH₂, and 4 CO₂ per glucose molecule (two turns of the cycle).', mastered: false, difficulty: null, interval: null },
    { id: nextId(), category: 'Biochemistry', front: 'What enzyme catalyzes the first step of glycolysis?', back: 'Hexokinase. It phosphorylates glucose to glucose-6-phosphate using one ATP molecule.', mastered: true, difficulty: 'Easy', interval: '4 days' },
    { id: nextId(), category: 'Genetics', front: 'What is the Central Dogma of molecular biology?', back: 'DNA → RNA → Protein. Information flows from DNA through transcription to mRNA, then through translation to protein.', mastered: false, difficulty: null, interval: null },
  ];
  write(STORAGE_KEYS.flashcards, cards);
}

seedFlashcardsIfEmpty();

// ---- auth ------------------------------------------------------------------

const auth = {
  async isAuthenticated() {
    return !!read(STORAGE_KEYS.session);
  },

  async me() {
    const session = read(STORAGE_KEYS.session);
    if (!session) return null;
    return session;
  },

  async register({ email, password }) {
    // Store user
    const users = read('wiz_users') || [];
    if (users.find((u) => u.email === email)) {
      throw new Error('An account with this email already exists');
    }
    const user = {
      id: nextId(),
      email,
      password,
      full_name: email.split('@')[0],
      role: 'user',
      major: null,
      class_year: null,
      default_difficulty: 'Medium',
      created_at: new Date().toISOString(),
    };
    users.push(user);
    write('wiz_users', users);
    // Auto-login
    const { password: _, ...session } = user;
    write(STORAGE_KEYS.session, session);
    return session;
  },

  async loginViaEmailPassword(email, password) {
    const users = read('wiz_users') || [];
    const user = users.find((u) => u.email === email && u.password === password);
    if (!user) throw new Error('Invalid email or password');
    const { password: _, ...session } = user;
    write(STORAGE_KEYS.session, session);
    return session;
  },

  loginWithProvider(/* provider, returnTo */) {
    // No-op for offline mode
    throw new Error('Social sign-in is not available in offline mode');
  },

  async updateMe(patch) {
    const session = read(STORAGE_KEYS.session);
    if (!session) throw new Error('Not authenticated');
    const updated = { ...session, ...patch };
    write(STORAGE_KEYS.session, updated);
    // Also update in users list
    const users = read('wiz_users') || [];
    const idx = users.findIndex((u) => u.id === session.id);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...patch };
      write('wiz_users', users);
    }
    return updated;
  },

  async logout() {
    localStorage.removeItem(STORAGE_KEYS.session);
  },

  redirectToLogin() {
    window.location.hash = '#/login';
  },

  async resetPasswordRequest(/* email */) {
    // No-op: always succeed silently
  },

  async resetPassword({ resetToken, newPassword }) {
    // In offline mode, just succeed
    void resetToken;
    void newPassword;
  },

  async verifyOtp() {
    // No-op
    return {};
  },

  async resendOtp() {
    // No-op
  },

  setToken() {
    // No-op
  },
};

// ---- integrations ----------------------------------------------------------

const integrations = {
  Core: {
    async UploadFile({ file }) {
      const file_url = URL.createObjectURL(file);
      return { file_url };
    },
  },
};

// ---- public API ------------------------------------------------------------

export const localDb = {
  auth,
  entities: {
    Quiz: createEntityStore(STORAGE_KEYS.quizzes),
    Flashcard: createEntityStore(STORAGE_KEYS.flashcards),
    File: createEntityStore(STORAGE_KEYS.files),
  },
  integrations,
};

export default localDb;
