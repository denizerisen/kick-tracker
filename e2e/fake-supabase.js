// Stands in for supabase-js in the tests (served in place of the CDN script): a signed-in user and an
// in-memory server kept in localStorage, so it survives reloads. Covers only what app.js calls.
(() => {
  const DB_KEY = "__fakeSupabase.db";
  const user = { id: "user-1", email: "parent@example.com" };
  const load = () => JSON.parse(localStorage.getItem(DB_KEY) || '{"kicks":[],"profiles":[]}');
  const store = (db) => localStorage.setItem(DB_KEY, JSON.stringify(db));
  const keyOf = { kicks: "id", profiles: "user_id" };

  function from(table) {
    let op = "select", rows = [], ids = [], single = false;
    const run = () => {
      const db = load();
      const key = keyOf[table];
      if (op === "upsert") {
        for (const row of rows) {
          const i = db[table].findIndex((r) => r[key] === row[key]);
          if (i >= 0) db[table][i] = { ...db[table][i], ...row }; else db[table].push(row);
        }
        store(db);
        return { error: null };
      }
      if (op === "delete") {
        db[table] = db[table].filter((r) => !ids.includes(r[key]));
        store(db);
        return { error: null };
      }
      return { data: single ? db[table][0] ?? null : db[table], error: null };
    };
    const q = {
      select: () => q,
      limit: () => q,
      maybeSingle: () => { single = true; return q; },
      upsert: (r) => { op = "upsert"; rows = Array.isArray(r) ? r : [r]; return q; },
      delete: () => { op = "delete"; return q; },
      in: (_column, values) => { ids = values; return q; },
      then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject),
    };
    return q;
  }

  window.supabase = {
    createClient: () => ({
      from,
      auth: {
        onAuthStateChange(callback) {
          setTimeout(() => callback("INITIAL_SESSION", { user }));
          return { data: { subscription: { unsubscribe() {} } } };
        },
        signOut: async () => ({ error: null }),
        signInWithOtp: async () => ({ error: null }),
        verifyOtp: async () => ({ error: null }),
      },
    }),
  };
})();
