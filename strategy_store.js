const fs = require("fs");
const path = require("path");

const DEFAULT_QUESTS = [
  {
    id: "q1",
    title: "감정 패턴 3줄 기록",
    xp: 30,
    done: false,
    body: "오늘 반복된 감정 하나를 적고, 그 감정이 어떤 선택을 만들었는지 봅니다.",
  },
  {
    id: "q2",
    title: "중요한 말 하루 늦게 보내기",
    xp: 45,
    done: false,
    body: "즉시 반응하지 않고, 내일 다시 읽은 뒤 보낼 문장을 정리합니다.",
  },
  {
    id: "q3",
    title: "돈의 기준 하나 정하기",
    xp: 50,
    done: false,
    body: "오늘 지출 하나를 고르고, 가격이 아니라 가치 기준으로 평가합니다.",
  },
];

const DEFAULT_SKILLS = [
  { id: "s1", title: "오행 기초", done: false },
  { id: "s2", title: "십성 이해", done: false },
  { id: "s3", title: "용신 전략", done: false },
  { id: "s4", title: "대운 World Map", done: false },
  { id: "s5", title: "관계 사례분석", done: false },
  { id: "s6", title: "상담 윤리", done: false },
  { id: "s7", title: "Action 설계", done: false },
  { id: "s8", title: "Certificate", done: false },
];

const DEFAULT_SETTINGS = {
  aiConsent: true,
  briefingNotice: true,
  soundEnabled: false,
  reduceMotion: false,
};

function createStrategyStore(baseDir) {
  const dataDir = process.env.SAJUWAR_DATA_DIR || path.join(baseDir, "data");
  const statesPath = path.join(dataDir, "strategy_states.json");
  const guildPath = path.join(dataDir, "strategy_guild.json");

  function ensureJsonFile(filePath, fallback) {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), "utf8");
  }

  function readJson(filePath, fallback) {
    ensureJsonFile(filePath, fallback);
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(filePath, value) {
    ensureJsonFile(filePath, Array.isArray(value) ? [] : {});
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  function defaultState(user = {}) {
    return {
      user_id: user.id || "",
      profile: null,
      weapon: null,
      xp: 0,
      level: 1,
      quests: DEFAULT_QUESTS.map((item) => ({ ...item })),
      skills: DEFAULT_SKILLS.map((item) => ({ ...item })),
      guild: [],
      settings: { ...DEFAULT_SETTINGS },
      chat: [],
      updated_at: new Date().toISOString(),
    };
  }

  function readStates() {
    const parsed = readJson(statesPath, {});
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }

  function writeStates(states) {
    writeJson(statesPath, states);
  }

  function getGuildPosts() {
    const parsed = readJson(guildPath, []);
    return Array.isArray(parsed) ? parsed : [];
  }

  function getState(user) {
    const states = readStates();
    const current = states[user.id] || defaultState(user);
    return normalizeState({ ...defaultState(user), ...current, user_id: user.id });
  }

  function saveState(user, state) {
    const states = readStates();
    states[user.id] = normalizeState({
      ...state,
      user_id: user.id,
      updated_at: new Date().toISOString(),
    });
    writeStates(states);
    return states[user.id];
  }

  function normalizeState(state) {
    const questsById = new Map((state.quests || []).map((item) => [item.id, item]));
    const skillsById = new Map((state.skills || []).map((item) => [item.id, item]));
    return {
      ...state,
      xp: Number(state.xp || 0),
      level: Math.max(1, Math.floor(Number(state.xp || 0) / 120) + 1),
      quests: DEFAULT_QUESTS.map((item) => ({ ...item, ...(questsById.get(item.id) || {}) })),
      skills: DEFAULT_SKILLS.map((item) => ({ ...item, ...(skillsById.get(item.id) || {}) })),
      settings: { ...DEFAULT_SETTINGS, ...(state.settings || {}) },
      chat: Array.isArray(state.chat) ? state.chat.slice(-40) : [],
      guild: getGuildPosts().slice(-30),
    };
  }

  function chooseWeapon(profile = {}) {
    const map = {
      career: {
        name: "Calm Commander",
        title: "선택을 구조화하는 사람",
        copy: "당신은 혼란한 상황에서 기준을 세울 때 가장 강해집니다.",
      },
      relationship: {
        name: "Relation Navigator",
        title: "거리감을 설계하는 사람",
        copy: "당신은 사람의 신호를 읽고 관계의 방향을 조율할 때 강해집니다.",
      },
      money: {
        name: "Golden Builder",
        title: "자원을 전략으로 바꾸는 사람",
        copy: "당신은 흩어진 자원을 모아 현실적인 구조를 만들 때 강해집니다.",
      },
      study: {
        name: "Deep Signal Reader",
        title: "깊은 신호를 읽는 사람",
        copy: "당신은 남들이 지나치는 의미를 오래 관찰할 때 강해집니다.",
      },
      business: {
        name: "Pattern Breaker",
        title: "반복을 깨고 시장을 보는 사람",
        copy: "당신은 익숙한 방식을 의심하고 새 경로를 만들 때 강해집니다.",
      },
    };
    return map[profile.focus] || map.career;
  }

  function updateProfile(user, profile) {
    const cleanProfile = {
      name: String(profile.name || user.name || "전략가").trim(),
      birth: String(profile.birth || "").trim(),
      time: String(profile.time || "").trim(),
      gender: String(profile.gender || "female").trim(),
      calendarType: String(profile.calendarType || "solar").trim(),
      focus: String(profile.focus || "career").trim(),
      focusLabel: String(profile.focusLabel || "커리어").trim(),
      reality: String(profile.reality || "").trim(),
      goal: String(profile.goal || "").trim(),
    };
    const state = getState(user);
    state.profile = cleanProfile;
    state.weapon = chooseWeapon(cleanProfile);
    if (state.xp === 0) state.xp = 100;
    return saveState(user, state);
  }

  function completeQuest(user, questId) {
    const state = getState(user);
    const quest = state.quests.find((item) => item.id === questId);
    if (!quest) return null;
    if (!quest.done) {
      quest.done = true;
      state.xp += Number(quest.xp || 0);
    }
    return saveState(user, state);
  }

  function completeSkill(user, skillId) {
    const state = getState(user);
    const skill = state.skills.find((item) => item.id === skillId);
    if (!skill) return null;
    if (!skill.done) {
      skill.done = true;
      state.xp += 25;
    }
    return saveState(user, state);
  }

  function addGuildPost(user, body) {
    const safeBody = String(body || "").trim();
    if (!safeBody) return null;
    const posts = getGuildPosts();
    const post = {
      id: `GUILD_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      user_id: user.id,
      name: user.name || "익명 전략가",
      body: safeBody,
      at: new Date().toLocaleDateString("ko-KR"),
      created_at: new Date().toISOString(),
    };
    posts.push(post);
    writeJson(guildPath, posts.slice(-200));

    const state = getState(user);
    state.xp += 20;
    return saveState(user, state);
  }

  function updateSettings(user, settings) {
    const state = getState(user);
    state.settings = { ...state.settings, ...(settings || {}) };
    return saveState(user, state);
  }

  function appendChat(user, message, reply) {
    const state = getState(user);
    state.chat = [
      ...(state.chat || []),
      { role: "user", content: String(message || ""), at: new Date().toISOString() },
      { role: "assistant", content: String(reply || ""), at: new Date().toISOString() },
    ].slice(-40);
    return saveState(user, state);
  }

  function resetState(user) {
    return saveState(user, defaultState(user));
  }

  return {
    appendChat,
    chooseWeapon,
    completeQuest,
    completeSkill,
    getState,
    addGuildPost,
    resetState,
    updateProfile,
    updateSettings,
  };
}

module.exports = { createStrategyStore };
