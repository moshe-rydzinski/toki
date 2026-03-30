(function installTokiSupabaseMock() {
  function clone(value) {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
  }

  function makeError(message, code = "MOCK_ERROR") {
    return { message, code, details: null, hint: null };
  }

  const db = {
    users: [],
    profiles: [],
    questions: [],
    answers: [],
    ratings: [],
    session: null,
    listeners: [],
  };

  function publicUser(user) {
    return {
      id: user.id,
      email: user.email,
      user_metadata: clone(user.user_metadata || {}),
    };
  }

  function activeUserId() {
    return db.session?.user?.id || null;
  }

  function emitAuth(eventName) {
    const sessionClone = clone(db.session);
    db.listeners.forEach((listener) => {
      listener(eventName, sessionClone);
    });
  }

  function runSelect(tableName, filters, singleMode) {
    const source = db[tableName];
    if (!Array.isArray(source)) {
      return Promise.resolve({ data: null, error: makeError(`Unknown table ${tableName}`) });
    }

    const filtered = source.filter((row) => {
      return filters.every((filter) => row[filter.column] === filter.value);
    });

    if (!singleMode) {
      return Promise.resolve({ data: clone(filtered), error: null });
    }

    if (filtered.length === 0) {
      return Promise.resolve({ data: null, error: null });
    }

    return Promise.resolve({ data: clone(filtered[0]), error: null });
  }

  function createSelectQuery(tableName) {
    const filters = [];
    const query = {
      eq(column, value) {
        filters.push({ column, value });
        return query;
      },
      maybeSingle() {
        return runSelect(tableName, filters, true);
      },
      then(resolve, reject) {
        return runSelect(tableName, filters, false).then(resolve, reject);
      },
    };
    return query;
  }

  function insertProfiles(rows) {
    const userId = activeUserId();
    if (!userId) {
      return { data: null, error: makeError("Not authenticated", "401") };
    }

    const inserted = [];
    for (const row of rows) {
      if (row.id !== userId) {
        return { data: null, error: makeError("Cannot create profile for another user", "403") };
      }

      const usernameTaken = db.profiles.some((profile) => profile.username === row.username);
      if (usernameTaken) {
        return { data: null, error: makeError("duplicate key value violates unique constraint", "23505") };
      }

      const newRow = {
        id: row.id,
        username: row.username,
        full_name: row.full_name,
        bio: row.bio || "",
        created_at: row.created_at || nowIso(),
      };
      db.profiles.push(newRow);
      inserted.push(newRow);
    }
    return { data: clone(inserted), error: null };
  }

  function insertQuestions(rows) {
    const userId = activeUserId();
    if (!userId) {
      return { data: null, error: makeError("Not authenticated", "401") };
    }

    const inserted = [];
    for (const row of rows) {
      if (row.asker_id !== userId) {
        return { data: null, error: makeError("Cannot create question for another user", "403") };
      }

      const newRow = {
        id: row.id || uid("q"),
        asker_id: row.asker_id,
        title: row.title,
        body: row.body,
        created_at: row.created_at || nowIso(),
      };
      db.questions.push(newRow);
      inserted.push(newRow);
    }
    return { data: clone(inserted), error: null };
  }

  function insertAnswers(rows) {
    const userId = activeUserId();
    if (!userId) {
      return { data: null, error: makeError("Not authenticated", "401") };
    }

    const inserted = [];
    for (const row of rows) {
      if (row.giver_id !== userId) {
        return { data: null, error: makeError("Cannot create answer for another user", "403") };
      }

      const question = db.questions.find((item) => item.id === row.question_id);
      if (!question) {
        return { data: null, error: makeError("Question not found", "404") };
      }

      const newRow = {
        id: row.id || uid("a"),
        question_id: row.question_id,
        giver_id: row.giver_id,
        body: row.body,
        created_at: row.created_at || nowIso(),
      };
      db.answers.push(newRow);
      inserted.push(newRow);
    }
    return { data: clone(inserted), error: null };
  }

  function insertRatings(rows) {
    const userId = activeUserId();
    if (!userId) {
      return { data: null, error: makeError("Not authenticated", "401") };
    }

    const inserted = [];
    for (const row of rows) {
      if (row.asker_id !== userId) {
        return { data: null, error: makeError("Cannot create rating for another user", "403") };
      }

      const answer = db.answers.find((item) => item.id === row.answer_id);
      if (!answer) {
        return { data: null, error: makeError("Answer not found", "404") };
      }

      const question = db.questions.find((item) => item.id === answer.question_id);
      if (!question || question.asker_id !== row.asker_id) {
        return { data: null, error: makeError("Only the asker can rate this answer", "403") };
      }

      const alreadyRated = db.ratings.some((rating) => rating.answer_id === row.answer_id);
      if (alreadyRated) {
        return { data: null, error: makeError("Answer already rated", "23505") };
      }

      const score = Number(row.score);
      if (!Number.isInteger(score) || score < 1 || score > 10) {
        return { data: null, error: makeError("Score must be 1..10", "400") };
      }

      const newRow = {
        id: row.id || uid("r"),
        answer_id: row.answer_id,
        asker_id: row.asker_id,
        score,
        created_at: row.created_at || nowIso(),
      };
      db.ratings.push(newRow);
      inserted.push(newRow);
    }
    return { data: clone(inserted), error: null };
  }

  function insertRows(tableName, payload) {
    const rows = Array.isArray(payload) ? payload : [payload];
    if (tableName === "profiles") {
      return insertProfiles(rows);
    }
    if (tableName === "questions") {
      return insertQuestions(rows);
    }
    if (tableName === "answers") {
      return insertAnswers(rows);
    }
    if (tableName === "ratings") {
      return insertRatings(rows);
    }
    return { data: null, error: makeError(`Unknown table ${tableName}`) };
  }

  function findUserByEmail(email) {
    return db.users.find((user) => user.email === String(email || "").trim().toLowerCase()) || null;
  }

  const supabaseMock = {
    auth: {
      async signUp({ email, password, options = {} }) {
        const normalizedEmail = String(email || "").trim().toLowerCase();
        if (!normalizedEmail || !password) {
          return { data: { user: null, session: null }, error: makeError("Email and password are required") };
        }

        if (findUserByEmail(normalizedEmail)) {
          return { data: { user: null, session: null }, error: makeError("User already registered") };
        }

        const user = {
          id: uid("u"),
          email: normalizedEmail,
          password,
          user_metadata: clone(options.data || {}),
        };
        db.users.push(user);

        db.session = { user: publicUser(user) };
        emitAuth("SIGNED_IN");
        return { data: { user: publicUser(user), session: clone(db.session) }, error: null };
      },

      async signInWithPassword({ email, password }) {
        const normalizedEmail = String(email || "").trim().toLowerCase();
        const user = findUserByEmail(normalizedEmail);
        if (!user || user.password !== password) {
          return { data: { user: null, session: null }, error: makeError("Invalid login credentials") };
        }

        db.session = { user: publicUser(user) };
        emitAuth("SIGNED_IN");
        return { data: { user: publicUser(user), session: clone(db.session) }, error: null };
      },

      async signOut() {
        db.session = null;
        emitAuth("SIGNED_OUT");
        return { error: null };
      },

      async getSession() {
        return { data: { session: clone(db.session) }, error: null };
      },

      onAuthStateChange(callback) {
        db.listeners.push(callback);
        return {
          data: {
            subscription: {
              unsubscribe() {
                const idx = db.listeners.indexOf(callback);
                if (idx >= 0) {
                  db.listeners.splice(idx, 1);
                }
              },
            },
          },
        };
      },
    },

    from(tableName) {
      return {
        select() {
          return createSelectQuery(tableName);
        },

        insert(payload) {
          return Promise.resolve(insertRows(tableName, payload));
        },
      };
    },
  };

  window.__TOKI_SUPABASE_MOCK__ = supabaseMock;
})();
