import { computeLeaderboard, collectUserActivity, joinQuestionsWithAnswersAndRatings } from "./domain.js";
import { hasSupabaseConfig, supabase } from "./supabaseClient.js";

const HAPTIC_MS = 12;
const HAPTIC_GAP_MS = 55;
const HAPTIC_SELECTOR =
  "button, a, .chip, .nav-btn, .question-card, .answer-row, .leaderboard-item, .stat-card, input, textarea, select";

const state = {
  profiles: [],
  questions: [],
  answers: [],
  ratings: [],
  currentUser: null,
  authMode: "login",
  currentScreen: "home",
  lastHapticAt: 0,
};

const el = {
  authView: document.getElementById("authView"),
  appView: document.getElementById("appView"),
  sessionChip: document.getElementById("sessionChip"),
  showLoginBtn: document.getElementById("showLoginBtn"),
  showRegisterBtn: document.getElementById("showRegisterBtn"),
  authForm: document.getElementById("authForm"),
  authEmail: document.getElementById("authEmail"),
  registerUsernameWrap: document.getElementById("registerUsernameWrap"),
  registerUsername: document.getElementById("registerUsername"),
  authFullName: document.getElementById("authFullName"),
  authPassword: document.getElementById("authPassword"),
  fullNameWrap: document.getElementById("fullNameWrap"),
  authSubmitBtn: document.getElementById("authSubmitBtn"),
  authMessage: document.getElementById("authMessage"),
  askForm: document.getElementById("askForm"),
  askTitle: document.getElementById("askTitle"),
  askBody: document.getElementById("askBody"),
  askMessage: document.getElementById("askMessage"),
  feedList: document.getElementById("feedList"),
  leaderboardList: document.getElementById("leaderboardList"),
  profileStats: document.getElementById("profileStats"),
  profileHistory: document.getElementById("profileHistory"),
  logoutBtn: document.getElementById("logoutBtn"),
};

function sanitize(text) {
  return String(text || "").replace(/[<>]/g, "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeUsername(value) {
  return sanitize(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
}

function getAuthRedirectUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  if (url.pathname.endsWith("/index.html")) {
    url.pathname = url.pathname.slice(0, -"/index.html".length) || "/";
  }
  return url.toString();
}

function formatDate(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function showStatus(element, message, type = "") {
  element.textContent = message;
  element.classList.remove("error", "ok");
  if (type) {
    element.classList.add(type);
  }
}

function switchAuthMode(mode) {
  state.authMode = mode;
  const registerMode = mode === "register";
  el.showLoginBtn.classList.toggle("active", !registerMode);
  el.showRegisterBtn.classList.toggle("active", registerMode);
  el.registerUsernameWrap.classList.toggle("hidden", !registerMode);
  el.fullNameWrap.classList.toggle("hidden", !registerMode);
  el.authSubmitBtn.textContent = registerMode ? "Create Account" : "Log In";
  el.registerUsername.required = registerMode;
  el.authFullName.required = registerMode;
  showStatus(el.authMessage, "");
}

function showScreen(screenName) {
  state.currentScreen = screenName;
  document.querySelectorAll(".screen").forEach((node) => {
    node.classList.toggle("active", node.id === `screen-${screenName}`);
  });

  document.querySelectorAll(".nav-btn").forEach((node) => {
    node.classList.toggle("active", node.dataset.target === screenName);
  });
}

function getProfileById(userId) {
  return state.profiles.find((profile) => profile.id === userId) || null;
}

function getQuestionsView() {
  return joinQuestionsWithAnswersAndRatings(state.questions, state.answers, state.ratings);
}

function supportsHaptics() {
  if (!navigator || typeof navigator.vibrate !== "function") {
    return false;
  }
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  return true;
}

function hapticTap() {
  if (!supportsHaptics()) {
    return;
  }

  const now = Date.now();
  if (now - state.lastHapticAt < HAPTIC_GAP_MS) {
    return;
  }

  state.lastHapticAt = now;
  navigator.vibrate(HAPTIC_MS);
}

function clearPressed() {
  document.querySelectorAll(".is-pressed").forEach((node) => node.classList.remove("is-pressed"));
}

function installHaptics() {
  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target.closest(HAPTIC_SELECTOR);
      if (!target) {
        return;
      }
      target.classList.add("is-pressed");
      hapticTap();
    },
    { passive: true },
  );

  document.addEventListener("pointerup", clearPressed, { passive: true });
  document.addEventListener("pointercancel", clearPressed, { passive: true });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const target = event.target.closest(HAPTIC_SELECTOR);
    if (!target) {
      return;
    }
    hapticTap();
  });
}

async function loadAppData() {
  const [profilesRes, questionsRes, answersRes, ratingsRes] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("questions").select("*"),
    supabase.from("answers").select("*"),
    supabase.from("ratings").select("*"),
  ]);

  if (profilesRes.error) {
    throw profilesRes.error;
  }
  if (questionsRes.error) {
    throw questionsRes.error;
  }
  if (answersRes.error) {
    throw answersRes.error;
  }
  if (ratingsRes.error) {
    throw ratingsRes.error;
  }

  state.profiles = profilesRes.data || [];
  state.questions = questionsRes.data || [];
  state.answers = answersRes.data || [];
  state.ratings = ratingsRes.data || [];
}

async function fetchProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

async function createProfileWithRetries(userId, preferredUsername, preferredFullName, email) {
  const fallbackBase = normalizeUsername((email || "toki_user").split("@")[0]) || "toki_user";
  const requestedBase = normalizeUsername(preferredUsername) || fallbackBase;
  const fullName = sanitize(preferredFullName) || requestedBase;

  for (let i = 0; i < 6; i += 1) {
    const suffix = i === 0 ? "" : String(Math.floor(Math.random() * 9000) + 1000);
    const candidate = `${requestedBase}${suffix}`.slice(0, 24);

    const { error } = await supabase.from("profiles").insert({
      id: userId,
      username: candidate,
      full_name: fullName,
      bio: "Helping others every day.",
    });

    if (!error) {
      return;
    }

    if (error.code !== "23505") {
      throw error;
    }
  }

  throw new Error("Unable to create a unique username. Please try a different username.");
}

async function ensureProfileForCurrentUser(profileSeed = {}) {
  if (!state.currentUser) {
    return null;
  }

  const existing = await fetchProfile(state.currentUser.id);
  if (existing) {
    return existing;
  }

  const metadata = state.currentUser.user_metadata || {};
  await createProfileWithRetries(
    state.currentUser.id,
    profileSeed.username || metadata.username,
    profileSeed.fullName || metadata.full_name,
    state.currentUser.email,
  );

  return fetchProfile(state.currentUser.id);
}

function renderAuthView(message = "") {
  el.authView.classList.remove("hidden");
  el.appView.classList.add("hidden");
  el.sessionChip.classList.add("hidden");
  switchAuthMode(state.authMode);
  if (message) {
    showStatus(el.authMessage, message, "error");
  }
}

function buildFeed() {
  const currentUserId = state.currentUser?.id;
  const questions = getQuestionsView();

  if (!currentUserId || questions.length === 0) {
    el.feedList.innerHTML = '<p class="muted">No relationship questions yet. Be the first to ask for advice.</p>';
    return;
  }

  el.feedList.innerHTML = questions
    .map((question) => {
      const asker = getProfileById(question.asker_id);
      const answersHtml = (question.answers || [])
        .map((answer) => {
          const giver = getProfileById(answer.giver_id);
          const ratingControl =
            currentUserId === question.asker_id && answer.rating == null
              ? `<form class="inline-form" data-action="rate-answer" data-question-id="${escapeHtml(question.id)}" data-answer-id="${escapeHtml(answer.id)}">
                  <label>
                    Rate
                    <select name="rating" aria-label="Rate from one to ten">
                      ${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}
                    </select>
                  </label>
                  <button class="inline-btn" type="submit">Save</button>
                </form>`
              : answer.rating != null
                ? `<span class="rating-tag">Rated ${escapeHtml(answer.rating)}/10</span>`
                : "";

          return `<div class="answer-row">
              <p><strong>${escapeHtml(giver?.full_name || "Unknown")}</strong> (@${escapeHtml(giver?.username || "?")})</p>
              <p>${escapeHtml(answer.body)}</p>
              <div class="answer-foot">
                <span class="meta">${escapeHtml(formatDate(answer.created_at))}</span>
                ${ratingControl}
              </div>
            </div>`;
        })
        .join("");

      const canAnswer = currentUserId !== question.asker_id;
      const answerForm = canAnswer
        ? `<form class="answer-form" data-action="add-answer" data-question-id="${escapeHtml(question.id)}">
            <textarea name="answerText" minlength="8" maxlength="500" required placeholder="Share respectful relationship advice"></textarea>
            <button class="inline-btn" type="submit">Give Guidance</button>
          </form>`
        : "<p class='meta'>This is your question. Rate thoughtful replies to update rankings.</p>";

      return `<article class="question-card">
          <div class="question-head">
            <div>
              <h3>${escapeHtml(question.title)}</h3>
              <p class="meta">Asked by ${escapeHtml(asker?.full_name || "Unknown")} (@${escapeHtml(asker?.username || "?")})</p>
            </div>
            <span class="meta">${escapeHtml(formatDate(question.created_at))}</span>
          </div>
          <p>${escapeHtml(question.body)}</p>
          <div class="answer-block">
            <h4>Relationship Advice</h4>
            ${answersHtml || '<p class="muted">No advice yet. Add the first supportive response.</p>'}
            ${answerForm}
          </div>
        </article>`;
    })
    .join("");
}

function buildLeaderboard() {
  const rows = computeLeaderboard(state.profiles, getQuestionsView());

  if (rows.length === 0) {
    el.leaderboardList.innerHTML =
      "<li class='muted'>No ratings yet. Rate relationship guidance in Home to start the leaderboard.</li>";
    return;
  }

  el.leaderboardList.innerHTML = rows
    .map((row, idx) => {
      return `<li class="leaderboard-item">
          <div>
            <span class="lb-rank">#${idx + 1}</span>
            <strong>${escapeHtml(row.profile.full_name)}</strong> (@${escapeHtml(row.profile.username)})
          </div>
          <div class="meta">Avg ${escapeHtml(row.avg.toFixed(1))}/10 • ${escapeHtml(row.count)} rating${row.count > 1 ? "s" : ""}</div>
        </li>`;
    })
    .join("");
}

function buildProfile() {
  const currentUserId = state.currentUser?.id;
  const currentProfile = getProfileById(currentUserId);
  const questions = getQuestionsView();

  if (!currentUserId || !currentProfile) {
    el.profileStats.innerHTML = "";
    el.profileHistory.innerHTML = "<p class='muted'>Profile unavailable.</p>";
    return;
  }

  const { myQuestions, myAnswers } = collectUserActivity(currentUserId, questions);
  const ratedScores = myAnswers.map((item) => item.answer.rating).filter((score) => score != null);
  const avgRating =
    ratedScores.length > 0 ? ratedScores.reduce((sum, score) => sum + score, 0) / ratedScores.length : 0;

  const leaderboard = computeLeaderboard(state.profiles, questions);
  const rank = leaderboard.findIndex((row) => row.profile.id === currentUserId);

  el.profileStats.innerHTML = `
    <article class="stat-card">
      <div class="label">Questions Asked</div>
      <div class="value">${myQuestions.length}</div>
    </article>
    <article class="stat-card">
      <div class="label">Guidance Given</div>
      <div class="value">${myAnswers.length}</div>
    </article>
    <article class="stat-card">
      <div class="label">Average Rating</div>
      <div class="value">${ratedScores.length ? avgRating.toFixed(1) : "-"}</div>
    </article>
    <article class="stat-card">
      <div class="label">Leaderboard Rank</div>
      <div class="value">${rank >= 0 ? `#${rank + 1}` : "Unranked"}</div>
    </article>
  `;

  const recentAnswers = [...myAnswers]
    .sort((a, b) => new Date(b.answer.created_at) - new Date(a.answer.created_at))
    .slice(0, 6)
    .map((item) => {
      const ratingText = item.answer.rating == null ? "Not rated yet" : `Rated ${item.answer.rating}/10`;
      return `<li>${escapeHtml(item.question.title)} - ${escapeHtml(ratingText)}</li>`;
    })
    .join("");

  const recentQuestions = [...myQuestions]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 6)
    .map((question) => {
      const count = question.answers.length;
      return `<li>${escapeHtml(question.title)} (${count} answer${count === 1 ? "" : "s"})</li>`;
    })
    .join("");

  el.profileHistory.innerHTML = `
    <h3>Recent Activity</h3>
    <p class="meta">Bio: ${escapeHtml(currentProfile.bio || "No bio yet")}</p>
    <p class="meta">Member since ${escapeHtml(formatDate(currentProfile.created_at))}</p>
    <h3>Your Relationship Advice</h3>
    <ul>${recentAnswers || "<li>No advice posted yet.</li>"}</ul>
    <h3>Your Questions</h3>
    <ul>${recentQuestions || "<li>No questions posted yet.</li>"}</ul>
  `;
}

function renderAppView() {
  const currentUserId = state.currentUser?.id;
  const currentProfile = getProfileById(currentUserId);

  if (!currentUserId || !currentProfile) {
    renderAuthView();
    return;
  }

  el.authView.classList.add("hidden");
  el.appView.classList.remove("hidden");
  el.sessionChip.classList.remove("hidden");
  el.sessionChip.textContent = `Signed in: @${currentProfile.username}`;

  showScreen(state.currentScreen);
  buildFeed();
  buildLeaderboard();
  buildProfile();
}

async function refreshAndRender() {
  await loadAppData();
  renderAppView();
}

async function bootstrapAuthenticatedState(profileSeed = {}) {
  await ensureProfileForCurrentUser(profileSeed);
  await refreshAndRender();
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  if (!supabase) {
    showStatus(el.authMessage, "Missing Supabase keys in .env.local", "error");
    return;
  }

  const email = el.authEmail.value.trim().toLowerCase();
  const password = el.authPassword.value.trim();

  if (!email || !password) {
    showStatus(el.authMessage, "Email and password are required.", "error");
    return;
  }

  try {
    if (state.authMode === "register") {
      const username = normalizeUsername(el.registerUsername.value);
      const fullName = sanitize(el.authFullName.value);

      if (username.length < 3) {
        showStatus(el.authMessage, "Please choose a username with at least 3 letters or numbers.", "error");
        return;
      }

      if (fullName.length < 2) {
        showStatus(el.authMessage, "Please provide your full name.", "error");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            full_name: fullName,
          },
          emailRedirectTo: getAuthRedirectUrl(),
        },
      });
      if (error) {
        showStatus(el.authMessage, error.message, "error");
        return;
      }

      if (!data.user) {
        showStatus(el.authMessage, "Could not create account. Please try again.", "error");
        return;
      }

      if (!data.session) {
        showStatus(el.authMessage, "Account created. Confirm email, then log in.", "ok");
        switchAuthMode("login");
        return;
      }

      state.currentUser = data.user;
      await bootstrapAuthenticatedState({ username, fullName });
      el.authForm.reset();
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      showStatus(el.authMessage, error.message, "error");
      return;
    }

    state.currentUser = data.user;
    await bootstrapAuthenticatedState();
    el.authForm.reset();
  } catch (error) {
    showStatus(el.authMessage, error.message || "Authentication failed.", "error");
  }
}

async function handleAskSubmit(event) {
  event.preventDefault();

  if (!state.currentUser) {
    return;
  }

  const title = sanitize(el.askTitle.value);
  const body = sanitize(el.askBody.value);

  if (title.length < 4 || body.length < 12) {
    showStatus(el.askMessage, "Please add a clearer topic and details.", "error");
    return;
  }

  try {
    const { error } = await supabase.from("questions").insert({
      asker_id: state.currentUser.id,
      title,
      body,
    });

    if (error) {
      throw error;
    }

    el.askForm.reset();
    showStatus(el.askMessage, "Question posted.", "ok");
    await refreshAndRender();
    showScreen("home");
  } catch (error) {
    showStatus(el.askMessage, error.message || "Could not post question.", "error");
  }
}

async function handleFeedActions(event) {
  const form = event.target.closest("form[data-action]");
  if (!form || !state.currentUser) {
    return;
  }

  event.preventDefault();

  const questionId = form.dataset.questionId;
  const questions = getQuestionsView();
  const question = questions.find((item) => item.id === questionId);

  if (!question) {
    return;
  }

  try {
    if (form.dataset.action === "add-answer") {
      if (state.currentUser.id === question.asker_id) {
        return;
      }

      const text = sanitize(form.elements.answerText.value || "");
      if (text.length < 8) {
        return;
      }

      const { error } = await supabase.from("answers").insert({
        question_id: question.id,
        giver_id: state.currentUser.id,
        body: text,
      });

      if (error) {
        throw error;
      }

      await refreshAndRender();
      return;
    }

    if (form.dataset.action === "rate-answer") {
      if (state.currentUser.id !== question.asker_id) {
        return;
      }

      const answer = question.answers.find((item) => item.id === form.dataset.answerId);
      if (!answer || answer.rating != null) {
        return;
      }

      const ratingValue = Number(form.elements.rating.value);
      if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 10) {
        return;
      }

      const { error } = await supabase.from("ratings").insert({
        answer_id: answer.id,
        asker_id: state.currentUser.id,
        score: ratingValue,
      });

      if (error) {
        throw error;
      }

      await refreshAndRender();
    }
  } catch (error) {
    showStatus(el.askMessage, error.message || "Action failed.", "error");
  }
}

function attachEvents() {
  el.showLoginBtn.addEventListener("click", () => switchAuthMode("login"));
  el.showRegisterBtn.addEventListener("click", () => switchAuthMode("register"));
  el.authForm.addEventListener("submit", (event) => {
    void handleAuthSubmit(event);
  });
  el.askForm.addEventListener("submit", (event) => {
    void handleAskSubmit(event);
  });
  el.feedList.addEventListener("submit", (event) => {
    void handleFeedActions(event);
  });

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => {
      showScreen(button.dataset.target);
    });
  });

  el.logoutBtn.addEventListener("click", async () => {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      showStatus(el.authMessage, error.message, "error");
      return;
    }

    state.currentUser = null;
    state.profiles = [];
    state.questions = [];
    state.answers = [];
    state.ratings = [];
    renderAuthView();
  });

  installHaptics();
}

async function init() {
  attachEvents();

  if (!hasSupabaseConfig || !supabase) {
    renderAuthView("Missing Supabase env vars. Add them to .env.local and restart npm run dev.");
    return;
  }

  switchAuthMode("login");

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    renderAuthView(error.message);
    return;
  }

  if (session?.user) {
    state.currentUser = session.user;
    await bootstrapAuthenticatedState();
  } else {
    renderAuthView();
  }

  supabase.auth.onAuthStateChange((_event, nextSession) => {
    if (!nextSession?.user) {
      state.currentUser = null;
      state.profiles = [];
      state.questions = [];
      state.answers = [];
      state.ratings = [];
      renderAuthView();
      return;
    }

    state.currentUser = nextSession.user;
    void bootstrapAuthenticatedState();
  });
}

void init();
