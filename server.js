const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const OpenAI = require("openai");
const { Solar, Lunar } = require("lunar-javascript");
const { buildAiBrainContext } = require("./dataset_loader");
const { PRODUCTS, createOrderStore } = require("./order_store");
const { createUserStore } = require("./user_store");
const { createStrategyStore } = require("./strategy_store");

const app = express();
const PORT = process.env.PORT || 3000;
const adminKey = process.env.SAJUWAR_ADMIN_KEY || "";
const developerModeEnabled =
  process.env.SAJUWAR_ENABLE_DEVELOPER_MODE === "true" && Boolean(adminKey);
const reviewDatasetPath =
  process.env.SAJUWAR_REVIEW_DATASET_PATH || path.join(__dirname, "review_dataset.jsonl");
const goldenDatasetPath =
  process.env.SAJUWAR_GOLDEN_DATASET_PATH || path.join(__dirname, "golden_dataset");
const masterRulesPath =
  process.env.SAJUWAR_MASTER_RULES_PATH || path.join(__dirname, "master_rules");
const decisionPriorityPath =
  process.env.SAJUWAR_DECISION_PRIORITY_PATH || path.join(__dirname, "decision_priority");
const bankAccount = {
  bankName: process.env.SAJUWAR_BANK_NAME || "은행명을 입력하세요",
  accountNumber: process.env.SAJUWAR_BANK_ACCOUNT || "계좌번호를 입력하세요",
  accountHolder: process.env.SAJUWAR_BANK_HOLDER || "예금주를 입력하세요",
};
const orderStore = createOrderStore(__dirname);
const userStore = createUserStore(__dirname);
const strategyStore = createStrategyStore(__dirname);
const PURCHASE_REQUIRED_MESSAGE = "구매가 완료되지 않았습니다.\n관리자 확인 후 이용 가능합니다.";

app.use(cors());
app.use(express.json());
function getAuthToken(req) {
  const header = req.get("authorization") || "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return req.query?.token || req.body?.token || "";
}

function getAuthUser(req) {
  return userStore.findByToken(getAuthToken(req));
}

function requireLogin(req, res) {
  const user = getAuthUser(req);
  if (user) return user;
  res.status(401).json({ error: "로그인이 필요합니다." });
  return null;
}

function canAccessProduct(req, productId) {
  const user = getAuthUser(req);
  if (!user) return false;
  return orderStore.hasPurchase({ user_id: user.id, product_id: productId });
}

function markProductAccess(req, productId, accessType = "view") {
  const user = getAuthUser(req);
  if (!user) return null;
  return orderStore.markPurchaseAccess({ user_id: user.id, product_id: productId, access_type: accessType });
}

function sendPurchaseRequired(res) {
  res.status(403).type("text/plain; charset=utf-8").send(PURCHASE_REQUIRED_MESSAGE);
}

app.use((req, res, next) => {
  const requestPath = req.path.replace(/\\/g, "/");
  if (
    requestPath === "/review_dataset.jsonl" ||
    requestPath.startsWith("/golden_dataset/") ||
    requestPath.startsWith("/master_rules/") ||
    requestPath.startsWith("/decision_priority/")
  ) {
    return res.status(404).send("Not found");
  }
  if (requestPath === "/admin-bank.html" && !isAdminRequest(req)) {
    return res.status(403).type("text/plain; charset=utf-8").send("Admin access required");
  }
  if (["/lecture.html", "/report", "/report.html", "/pdf"].includes(requestPath)) {
    const productId = requestPath === "/lecture.html" ? "saju_lecture" : "premium_report";
    if (!canAccessProduct(req, productId)) return sendPurchaseRequired(res);
    markProductAccess(req, productId, requestPath === "/pdf" ? "download" : "view");
  }
  return next();
});
app.use(express.static(__dirname));

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
const REPORT_GENERATION_TIMEOUT_MS =
  Number(process.env.SAJUWAR_REPORT_TIMEOUT_MS || "") || 55000;

function createChatCompletionWithTimeout(body) {
  return client.chat.completions.create(body, {
    timeout: REPORT_GENERATION_TIMEOUT_MS,
  });
}

function isDeveloperPreviewRequest(req) {
  if (!developerModeEnabled) return false;
  const providedKey =
    req.get("x-sajuwar-admin-key") ||
    req.body?.adminKey ||
    req.query?.adminKey ||
    "";
  return providedKey === adminKey;
}

function isAdminRequest(req) {
  if (!adminKey) return false;
  const providedKey =
    req.get("x-sajuwar-admin-key") ||
    req.body?.adminKey ||
    req.query?.adminKey ||
    "";
  return providedKey === adminKey;
}

function requireAdmin(req, res) {
  if (isAdminRequest(req)) return true;
  res.status(403).json({ error: "Admin access required" });
  return false;
}

function ensureReviewDatasetFile() {
  if (!fs.existsSync(reviewDatasetPath)) {
    fs.writeFileSync(reviewDatasetPath, "", "utf8");
  }
}

function readReviewDataset({ approvedOnly = false } = {}) {
  ensureReviewDatasetFile();
  return fs
    .readFileSync(reviewDatasetPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean)
    .filter((item) => !approvedOnly || item.approved === true);
}

function writeReviewDataset(items) {
  const content = items.map((item) => JSON.stringify(item)).join("\n");
  fs.writeFileSync(reviewDatasetPath, content ? `${content}\n` : "", "utf8");
}

function appendReviewRecord(payload) {
  ensureReviewDatasetFile();
  const reasons = Array.isArray(payload.reason)
    ? payload.reason.filter(Boolean).join(", ")
    : payload.reason || "";
  const record = {
    id: `review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    section: payload.section || "report",
    before: payload.before || "",
    after: payload.after || "",
    reason: reasons,
    reviewer: payload.reviewer || "현명역학원",
    created_at: new Date().toISOString(),
    approved: false,
  };
  fs.appendFileSync(reviewDatasetPath, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

function approveReviewRecord(id) {
  const items = readReviewDataset();
  const nextItems = items.map((item) =>
    item.id === id ? { ...item, approved: true, approved_at: new Date().toISOString() } : item
  );
  writeReviewDataset(nextItems);
  return nextItems.find((item) => item.id === id);
}

function buildReviewDatasetGuidance() {
  const approvedItems = readReviewDataset({ approvedOnly: true }).slice(-20);
  if (!approvedItems.length) return "";
  const examples = approvedItems
    .map((item, index) => {
      return [
        `[Review ${index + 1}]`,
        `review_id: ${item.id}`,
        `section: ${item.section}`,
        `reason: ${item.reason}`,
        `before: ${item.before}`,
        `after: ${item.after}`,
      ].join("\n");
    })
    .join("\n\n");
  return [
    "아래는 현명역학원이 직접 수정하고 승인한 문장 데이터다.",
    "다음 리포트 생성 시 after의 표현, 논리, 상담톤, 용어 선택을 before보다 우선한다.",
    "단순 복사보다 같은 기준을 새 리포트 전체에 일관되게 적용한다.",
    "",
    examples,
  ].join("\n");
}

function normalizeForReviewMatch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

function splitReportSentences(report) {
  return String(report || "")
    .split(/(?<=[.!?。！？]|[요다까죠니다세요합니다])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 8);
}

function reviewTextSimilarity(a, b) {
  const aTokens = new Set(normalizeForReviewMatch(a).split(/\s+/).filter(Boolean));
  const bTokens = new Set(normalizeForReviewMatch(b).split(/\s+/).filter(Boolean));
  if (!aTokens.size || !bTokens.size) return 0;
  let overlap = 0;
  aTokens.forEach((token) => {
    if (bTokens.has(token)) overlap += 1;
  });
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function findAppliedReviewSentence(report, expectedAfter) {
  const normalizedReport = normalizeForReviewMatch(report);
  const normalizedAfter = normalizeForReviewMatch(expectedAfter);
  if (!normalizedAfter) {
    return { applied: false, applied_sentence: "", match_type: "missing_after", similarity_score: 0 };
  }
  if (normalizedReport.includes(normalizedAfter)) {
    return {
      applied: true,
      applied_sentence: expectedAfter,
      match_type: "exact_after",
      similarity_score: 1,
    };
  }

  const best = splitReportSentences(report)
    .map((sentence) => ({
      sentence,
      score: reviewTextSimilarity(sentence, expectedAfter),
    }))
    .sort((a, b) => b.score - a.score)[0];

  const similarityScore = best?.score || 0;
  return {
    applied: similarityScore >= 0.45,
    applied_sentence: similarityScore >= 0.45 ? best.sentence : "",
    match_type: similarityScore >= 0.45 ? "similar_after" : "not_found",
    similarity_score: Math.round(similarityScore * 100) / 100,
  };
}

function evaluateReviewDatasetApplication(report, reviewItems = []) {
  const usedItems = Array.isArray(reviewItems) ? reviewItems : [];
  const normalizedReport = normalizeForReviewMatch(report);
  const comparisons = usedItems.map((item) => {
    const match = findAppliedReviewSentence(report, item.after);
    const beforeStillPresent = item.before
      ? normalizedReport.includes(normalizeForReviewMatch(item.before))
      : false;
    return {
      review_id: item.id,
      section: item.section || "report",
      reason: item.reason || "",
      before: item.before || "",
      expected_after: item.after || "",
      applied_sentence: match.applied_sentence,
      applied: match.applied,
      match_type: match.match_type,
      similarity_score: match.similarity_score,
      before_still_present: beforeStillPresent,
    };
  });
  const appliedCount = comparisons.filter((item) => item.applied).length;
  const applicationRate = usedItems.length ? Math.round((appliedCount / usedItems.length) * 100) : 0;
  return {
    used_review_dataset_count: usedItems.length,
    applied_review_dataset_count: appliedCount,
    applied_review_ids: comparisons.filter((item) => item.applied).map((item) => item.review_id),
    application_rate_percent: applicationRate,
    comparisons,
  };
}

function readGoldenDataset() {
  if (!fs.existsSync(goldenDatasetPath)) return [];
  return fs
    .readdirSync(goldenDatasetPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const sectionPath = path.join(goldenDatasetPath, entry.name);
      return fs
        .readdirSync(sectionPath, { withFileTypes: true })
        .filter((file) => file.isFile() && /^(golden_\d+\.md|case_\d+\.ya?ml)$/i.test(file.name))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((file) => ({
          section: entry.name,
          file: file.name,
          content: fs.readFileSync(path.join(sectionPath, file.name), "utf8").trim(),
        }));
    })
    .filter((item) => item.content);
}

function tokenizeGoldenText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w가-힣甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function buildGoldenSearchText({ name, genderLabel, calendarLabel, pillars, daewoon, sewoon }) {
  return [
    name,
    genderLabel,
    calendarLabel,
    pillars?.year,
    pillars?.month,
    pillars?.day,
    pillars?.hour,
    makeHiddenItemSummary(pillars || {}),
    daewoon?.startInfo,
    daewoon?.list?.map((item) => item.ganji).join(" "),
    sewoon?.startInfo,
    sewoon?.list?.map((item) => `${item.ganji} ${item.theme}`).join(" "),
    "전체 총평 원국 일간 오행 지장간 대운 세운 재물 직업 사업 브랜드 연애 관계 건강 개운 최종 메시지",
  ]
    .filter(Boolean)
    .join(" ");
}

function findMostSimilarGoldenReport(context) {
  const goldenItems = readGoldenDataset();
  if (!goldenItems.length) return null;

  const queryTokens = new Set(tokenizeGoldenText(buildGoldenSearchText(context)));
  const scoredItems = goldenItems.map((item) => {
    const contentTokens = new Set(tokenizeGoldenText(`${item.section} ${item.file} ${item.content}`));
    let score = 0;
    queryTokens.forEach((token) => {
      if (contentTokens.has(token)) score += 1;
    });
    if (queryTokens.has(item.section)) score += 5;
    return { ...item, score };
  });

  return scoredItems.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))[0] || null;
}

function buildGoldenDatasetGuidance(context = {}) {
  const selectedGolden = findMostSimilarGoldenReport(context);
  if (!selectedGolden) return "";
  return [
    "답변 생성 전에 golden_dataset에서 현재 요청과 가장 유사한 리포트 1개를 먼저 검색했다.",
    `선택된 Golden Report: ${selectedGolden.section}/${selectedGolden.file}`,
    `유사도 점수: ${selectedGolden.score}`,
    "이 Golden Report는 현명역학원이 직접 검수 완료한 최고 품질 정답 데이터다.",
    "생성 순서는 Decision Rule, Consultation Strategy, Golden Example, 고객 정보 순서다.",
    "AI는 brain.decision_rule과 brain.consultation_strategy를 먼저 사고 규칙으로 삼고, 그 다음 Golden Example의 문체, 문단 구조, 표현 방식, 현실 조언 방식, 결론 방식을 참고한다.",
    "Golden Report 안의 고객 고유 내용, 개인정보, 생년월일, 사건, 직업, 관계 사정, 구체 문장은 복사하지 않는다.",
    "목표는 사례를 재사용하는 것이 아니라 현명역학원처럼 판단하고 설명하는 것이다.",
    "golden_dataset은 review_dataset, RAG, Knowledge Rule보다 우선하는 AI 사고방식 최우선 기준이다.",
    "",
    "[Golden Brain + Example reference]",
    selectedGolden.content,
  ].join("\n");
}

function scoreReport(report) {
  const lengthScore = report && report.length > 4500 ? 100 : report && report.length > 2500 ? 88 : 72;
  return {
    quality_score: lengthScore,
    retrieval_score: 0,
    interpretation_score: report && report.length > 3000 ? 92 : 78,
    personalization_score: report && report.includes("님") ? 88 : 72,
  };
}

function getPaidReportChapterStats(report) {
  const lines = String(report || "").split(/\r?\n/);
  const chapters = [];
  let current = null;

  lines.forEach((line) => {
    const match = line.trim().match(/^(\d{1,2})[\.\)]\s*(.+)$/);
    if (match) {
      current = { number: match[1], title: match[2], body: [] };
      chapters.push(current);
      return;
    }
    if (current) current.body.push(line);
  });

  return chapters.map((chapter) => {
    const text = chapter.body.join("\n").replace(/\s/g, "");
    return {
      number: chapter.number,
      title: chapter.title,
      chars: text.length,
    };
  });
}

function findShortPaidReportChapters(report, minChars = 2000) {
  return getPaidReportChapterStats(report).filter((chapter) => chapter.chars < minChars);
}

function buildDeveloperDebugPayload({ report, prompt, ragContext, sources, gptResponse, finalMarkdown, goldenDatasetGuidance, aiBrainContext }) {
  const reviewDatasetApplication = evaluateReviewDatasetApplication(
    report,
    aiBrainContext?.sections?.review_dataset || []
  );
  return {
    full_paid_report: report,
    prompt,
    rag_context: ragContext,
    sources,
    gpt_response: gptResponse,
    final_markdown: finalMarkdown,
    golden_dataset_guidance: goldenDatasetGuidance || "등록된 golden_dataset 없음",
    review_dataset_guidance: buildReviewDatasetGuidance() || "승인된 리뷰 데이터 없음",
    dataset_order: aiBrainContext?.dataset_order || [],
    used_datasets: aiBrainContext?.used_datasets || [],
    dataset_sections: aiBrainContext?.sections || {},
    review_dataset_application: reviewDatasetApplication,
    ...scoreReport(report),
  };
}

const stemElement = {
  "甲": "목", "乙": "목",
  "丙": "화", "丁": "화",
  "戊": "토", "己": "토",
  "庚": "금", "辛": "금",
  "壬": "수", "癸": "수",
};

const branchElement = {
  "寅": "목", "卯": "목",
  "巳": "화", "午": "화",
  "辰": "토", "戌": "토", "丑": "토", "未": "토",
  "申": "금", "酉": "금",
  "亥": "수", "子": "수",
};

const hiddenStems = {
  "子": ["癸"],
  "丑": ["己", "癸", "辛"],
  "寅": ["甲", "丙", "戊"],
  "卯": ["乙"],
  "辰": ["戊", "乙", "癸"],
  "巳": ["丙", "戊", "庚"],
  "午": ["丁", "己"],
  "未": ["己", "丁", "乙"],
  "申": ["庚", "壬", "戊"],
  "酉": ["辛"],
  "戌": ["戊", "辛", "丁"],
  "亥": ["壬", "甲"],
};

const themeMap = {
  "목": "성장, 시작, 기획, 교육, 확장",
  "화": "표현, 노출, 인기, 콘텐츠, 홍보",
  "토": "현실화, 정리, 기반, 축적, 안정",
  "금": "결단, 기술, 구조화, 계약, 결과",
  "수": "정보, 이동, 유통, 학습, 지혜",
};

function getSaju(year, month, day, hour, minute, calendarType = "solar") {
  let solar;

  if (calendarType === "lunar") {
    const lunarInput = Lunar.fromYmdHms(
      Number(year),
      Number(month),
      Number(day),
      Number(hour),
      Number(minute || 0),
      0
    );
    solar = lunarInput.getSolar();
  } else {
    solar = Solar.fromYmdHms(
      Number(year),
      Number(month),
      Number(day),
      Number(hour),
      Number(minute || 0),
      0
    );
  }

  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();

  return {
    year: eightChar.getYear(),
    month: eightChar.getMonth(),
    day: eightChar.getDay(),
    hour: eightChar.getTime(),
    solarDate: `${solar.getYear()}-${String(solar.getMonth()).padStart(2, "0")}-${String(solar.getDay()).padStart(2, "0")}`,
    eightChar,
  };
}

function normalizeDateTimeParts(birth, time) {
  const [year, month, day] = String(birth || "").split("-");
  const [hour, minute] = String(time || "").split(":");
  return {
    year: String(year || "").padStart(4, "0"),
    month: String(month || "").padStart(2, "0"),
    day: String(day || "").padStart(2, "0"),
    hour: String(hour || "0").padStart(2, "0"),
    minute: String(minute || "0").padStart(2, "0"),
  };
}

function makeDaewoon(eightChar, gender) {
  try {
    const genderCode = gender === "male" ? 1 : 0;
    const yun = eightChar.getYun(genderCode);
    const daYunList = yun.getDaYun();

    const list = daYunList.slice(1, 9).map((dy) => {
      const startAge = dy.getStartAge();
      const startYear = dy.getStartYear();
      const ganji = dy.getGanZhi();

      return {
        startAge,
        endAge: startAge + 9,
        ganji,
        startYear,
        endYear: startYear + 9,
      };
    });

    return {
      startInfo: `대운 시작: ${yun.getStartYear()}년 ${yun.getStartMonth()}개월 ${yun.getStartDay()}일 무렵부터 흐름이 바뀝니다.`,
      list,
    };
  } catch (error) {
    console.error("대운 계산 오류:", error);
    return {
      startInfo: "대운 계산 중 오류가 발생했습니다. 입력값을 다시 확인해주세요.",
      list: [],
    };
  }
}

function makeSewoon(startYear = new Date().getFullYear()) {
  const stems = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  const branches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  const list = [];

  for (let i = 0; i < 10; i += 1) {
    const year = Number(startYear) + i;
    const stem = stems[(year - 4) % 10];
    const branch = branches[(year - 4) % 12];
    const stemEl = stemElement[stem];
    const branchEl = branchElement[branch];

    list.push({
      year,
      ganji: stem + branch,
      stem,
      branch,
      stemElement: stemEl,
      branchElement: branchEl,
      theme: `${themeMap[stemEl]} / ${themeMap[branchEl]}`,
    });
  }

  return {
    startInfo: `${startYear}년부터 10년간의 세운 흐름입니다. 세운은 실제로 아이템을 꺼내 쓰는 타이밍입니다.`,
    list,
  };
}

function makeHiddenItemSummary(pillars) {
  const keys = ["year", "month", "day", "hour"];
  const labels = { year: "년주", month: "월주", day: "일주", hour: "시주" };

  return keys.map((key) => {
    const pillar = pillars[key] || "";
    const branch = pillar[1];
    const hidden = hiddenStems[branch] || [];
    return `${labels[key]} ${pillar}: 지장간 ${hidden.join(", ") || "없음"}`;
  }).join("\n");
}

function buildCounselingStyleGuide(name) {
  return [
    "[Report Style Guide]",
    "새 기능을 만들지 말고 현재 Brain Dataset의 판단을 상담 말투로만 바꿔서 출력한다.",
    "설명체가 아니라 상담사가 고객에게 직접 말하듯 쓴다.",
    "'입니다' 반복을 줄이고, '~해요', '~합니다', '~보면 좋습니다', '~하세요'를 자연스럽게 섞는다.",
    "한자 풀이는 최소화하고, 고객이 실제 생활에서 겪는 장면을 먼저 말한다.",
    "각 챕터는 반드시 다음 순서로 쓴다: 왜 그런가 -> 현실에서는 어떻게 나타나는가 -> 그래서 어떻게 해야 하는가.",
    "전장, 군단, 스위치, 아이템 비유는 한 리포트 전체에서 합쳐 2~3회만 쓴다.",
    `고객이 '맞아.'라고 느낄 문장을 최소 3개 이상 넣는다. 예: '${name}님은 일이 많을 때보다 기준이 흐릴 때 더 지칩니다.'`,
    "각 챕터 마지막에는 상담사가 실제로 말하듯 한 줄 조언을 넣는다.",
    "최종 문장은 희망적인 마무리가 아니라 현실적인 행동 지침으로 끝낸다.",
    "샘플 패턴: IF 壬수가 반복되고 토가 받쳐주면 THEN 쉽게 흔들리지 않는다. 상담 표현은 '남들은 고집이라고 보지만, 실제로는 한번 책임지기로 한 일은 끝까지 끌고 가는 사람입니다.'처럼 쓴다. 행동 표현은 '중간에 방향을 자주 바꾸기보다 한 가지를 오래 가져갈수록 성과가 커집니다.'처럼 쓴다.",
  ].join("\n");
}

function fallbackReport({ name, pillars, daewoon, sewoon }) {
  return `${name}님의 사주 상담 리포트

1. 전체 흐름
왜 그런가: ${name}님 원국은 ${pillars.year}, ${pillars.month}, ${pillars.day}, ${pillars.hour}의 흐름이 함께 움직입니다. 한 가지 기질만 강한 사람이 아니라, 책임감과 반응 속도가 같이 올라오는 구조예요.

현실에서는 어떻게 나타나는가: 남들은 고집이라고 볼 때가 있지만, 실제로는 한번 책임지기로 한 일은 끝까지 끌고 가려는 쪽에 가깝습니다. 그래서 일이 많아서 힘든 것보다, 기준이 자꾸 바뀔 때 더 지칩니다. 이 말은 아마 ${name}님이 바로 "맞아." 하고 느낄 가능성이 큽니다.

그래서 어떻게 해야 하는가: 지금은 여러 방향을 동시에 넓히기보다 오래 가져갈 기준 하나를 먼저 정해야 해요.
상담사의 한 줄 조언: 흔들리는 사람처럼 보일 때도, 실제로는 기준을 다시 확인하는 시간이 필요한 사람입니다.

2. 성향과 일 처리 방식
왜 그런가: 겉으로 드러나는 기운과 안쪽에 숨어 있는 기운이 같이 작동합니다. 그래서 단순히 빠르다, 느리다로 보기 어렵고 상황을 끝까지 붙잡는 힘을 봐야 합니다.

현실에서는 어떻게 나타나는가: ${name}님은 처음에는 조용히 지켜보다가, 책임질 일이 생기면 갑자기 버티는 힘이 올라옵니다. 쉽게 포기하지 않는 대신, 마음속으로는 이미 여러 번 계산하고 있는 편이에요. 주변에서는 괜찮아 보인다고 하지만, 정작 본인은 머릿속이 쉬지 않는다고 느낄 수 있습니다.

그래서 어떻게 해야 하는가: 결정을 바꾸기 전에 최소한의 기준을 적어두세요. 감정이 올라왔을 때 결정하지 말고, 하루 뒤에도 같은 생각인지 확인하는 방식이 좋습니다.
상담사의 한 줄 조언: ${name}님에게 필요한 건 더 센 의지가 아니라, 바꾸지 않을 기준을 미리 정하는 일입니다.

3. 숨어 있는 가능성
왜 그런가: 지장간은 겉으로 바로 보이는 재능보다, 특정 시기와 상황에서 꺼내 쓰는 자원에 가깝습니다.

현실에서는 어떻게 나타나는가: 평소에는 티가 안 나다가도 마감, 책임, 약속 같은 압박이 생기면 집중력이 확 올라옵니다. 그래서 ${name}님은 편한 환경보다 역할이 분명한 환경에서 더 실력이 나오는 편이에요. 이 부분도 "맞아, 나는 애매할 때보다 해야 할 게 분명할 때 움직인다."라고 느낄 수 있습니다.

그래서 어떻게 해야 하는가: 숨어 있는 아이템을 꺼내려면 막연한 목표보다 체크리스트가 필요합니다. 이번 달에는 결과 하나, 이번 주에는 행동 세 개처럼 작게 쪼개세요.
상담사의 한 줄 조언: 가능성은 기분이 좋을 때보다, 해야 할 일이 선명할 때 더 잘 나옵니다.

4. 대운과 세운의 활용
왜 그런가: ${daewoon.startInfo} 대운은 없던 능력을 새로 만드는 흐름이 아니라, 이미 있던 회로에 전기가 들어오는 시기처럼 봐야 합니다.

현실에서는 어떻게 나타나는가: 세운은 올해부터 10년 흐름을 보여줍니다. ${sewoon.startInfo} 어떤 해에는 준비가 맞고, 어떤 해에는 제안과 실행이 맞습니다. 중요한 건 좋은 시기를 기다리는 게 아니라, 시기마다 해야 할 행동을 다르게 가져가는 거예요.

그래서 어떻게 해야 하는가: 올해는 큰 결론보다 작은 실행 기록을 남기세요. 제안할 일, 정리할 일, 관계를 넓힐 일을 구분해두면 흐름을 훨씬 현실적으로 쓸 수 있습니다.
상담사의 한 줄 조언: 운을 기다리지 말고, 시기마다 할 일을 다르게 배치하세요.

5. 최종 정리
왜 그런가: ${name}님은 쉽게 흔들리는 사람이 아니라, 한번 책임지기로 한 일을 오래 붙잡는 사람입니다. 다만 방향을 자주 바꾸면 그 장점이 피로로 바뀝니다.

현실에서는 어떻게 나타나는가: 남들이 보기에는 괜찮아 보여도, 실제로는 혼자 감당하는 일이 많을 수 있습니다. "내가 안 하면 결국 흐트러진다"는 생각 때문에 스스로 일을 더 떠안는 장면도 반복될 수 있어요. 이 부분은 ${name}님이 "맞아, 내가 결국 정리하게 된다."라고 느낄 수 있는 지점입니다.

그래서 어떻게 해야 하는가: 앞으로 30일 동안은 새 목표를 늘리지 말고, 이미 맡은 일 중 계속 가져갈 것 하나와 내려놓을 것 하나를 정하세요.
상담사의 한 줄 조언: 이번 달에는 더 잘하려고 애쓰기보다, 계속할 일 하나와 멈출 일 하나를 오늘 적으세요.`;
  return `${name}님의 사주전쟁 리포트

1. 전체 총평
이 원국은 하나의 판결문이 아니라 여러 기운이 주도권을 잡기 위해 움직이는 전장입니다. 겉으로 강하게 드러나는 세력이 있고, 그 세력 때문에 주변에서 오해받는 부분도 생깁니다. 하지만 사주전쟁의 핵심은 겉에 드러난 원국만으로 사람을 끝내 판단하지 않는 것입니다.

2. 원국 전장 분석
년주는 바깥에서 주어진 배경, 월주는 사회에서 가장 강하게 작동하는 전장, 일주는 내가 실제로 버티는 중심, 시주는 앞으로 꺼내야 할 가능성입니다. ${name}님의 원국은 ${pillars.year}, ${pillars.month}, ${pillars.day}, ${pillars.hour}의 조합으로 구성되어 있습니다.

3. 지장간 아이템
${makeHiddenItemSummary(pillars)}

지장간은 겉으로는 잘 보이지 않지만, 대운과 세운이 맞을 때 현실적인 아이템으로 바뀝니다. 원국이 불리해 보여도 지장간에 숨어 있는 재능을 움직여 꺼내는 순간 인생의 사용법이 달라집니다.

4. 대운 스위치
${daewoon.startInfo}
대운은 없던 능력을 갑자기 만들어주는 것이 아니라 이미 안에 있던 회로를 켜는 스위치입니다. 중요한 것은 스위치가 켜졌을 때 실제 행동을 시작하는 것입니다.

5. 세운 타이밍
${sewoon.startInfo}
올해의 세운은 준비만 하는 해인지, 밖으로 제안해야 하는 해인지, 관계를 확장해야 하는 해인지를 보여줍니다. 움직이는 사람이 자기 운의 아이템을 실제 결과로 바꿉니다.

6. 최종 메시지
나쁜 원국처럼 보이는 사주에도 그 사람만의 아이템은 있습니다. 핵심은 언제 켜지고, 어떤 세운에서 꺼내 쓰고, 어떤 행동으로 현실화할 것인지입니다. 사주전쟁은 운명을 겁주는 해석이 아니라 움직이게 만드는 전략입니다.`;
}

async function handleAnalyze(req, res) {
  try {
    const { name, birth, time, gender, calendarType, paidReport } = req.body;

    if (!name || !birth || !time || !gender) {
      return res.status(400).json({
        result: "이름, 생년월일, 시간, 성별을 모두 입력해주세요.",
      });
    }

    const safeCalendar = calendarType || "solar";
    if (paidReport) {
      const user = requireLogin(req, res);
      if (!user) return;
      try {
        orderStore.ensureReportProfileAccess({
          user_id: user.id,
          product_id: "premium_report",
          profile: { name, birth, time, gender, calendarType: safeCalendar },
        });
      } catch (error) {
        return res.status(error.status || 403).json({
          result: [
            "이 구매권한은 이미 다른 생년월일 리포트에 사용되었습니다.",
            "프리미엄 리포트 1회 구매는 최초 입력한 한 사람의 사주 리포트에만 적용됩니다.",
            "다른 생년월일로 보려면 새로 구매하거나 관리자에게 문의해주세요.",
          ].join("\n"),
          error: error.message,
          report_profile: error.report_profile || null,
        });
      }
    }
    const { year, month, day, hour, minute } = normalizeDateTimeParts(birth, time);

    const pillarsRaw = getSaju(year, month, day, hour, minute, safeCalendar);
    const daewoon = makeDaewoon(pillarsRaw.eightChar, gender);
    const sewoon = makeSewoon(new Date().getFullYear());

    const pillars = {
      year: pillarsRaw.year,
      month: pillarsRaw.month,
      day: pillarsRaw.day,
      hour: pillarsRaw.hour,
      solarDate: pillarsRaw.solarDate,
    };

    const calendarLabel = safeCalendar === "lunar" ? "음력" : "양력";
    const genderLabel = gender === "male" ? "남성" : "여성";
    const developerPreview = isDeveloperPreviewRequest(req);
    const hiddenSummary = makeHiddenItemSummary(pillars);
    const aiBrainContext = buildAiBrainContext(
      __dirname,
      {
        goldenDatasetPath,
        reviewDatasetPath,
        masterRulesPath,
        decisionPriorityPath,
      },
      {
        name,
        genderLabel,
        calendarLabel,
        pillars,
        hiddenSummary,
        daewoon,
        sewoon,
      }
    );
    const goldenDatasetGuidance = buildGoldenDatasetGuidance({
      name,
      genderLabel,
      calendarLabel,
      pillars,
      daewoon,
      sewoon,
    });
    const reviewDatasetGuidance = buildReviewDatasetGuidance();
    const ragContext = [
      "현재 홈페이지 버전은 외부 RAG 검색이 아니라 local 만세력 계산, 대운/세운 계산, GPT 프롬프트를 기반으로 리포트를 생성합니다.",
      `원국: ${pillars.year}, ${pillars.month}, ${pillars.day}, ${pillars.hour}`,
      `대운: ${daewoon.startInfo}`,
      `세운: ${sewoon.startInfo}`,
    ].join("\n");
    const sources = [
      {
        source_title: "SAJUWAR local saju calculator",
        source_type: "calculation",
        page: null,
        chunk_id: "local-pillars-daewoon-sewoon",
        relevance_score: 1,
        boosted_score: 1,
      },
    ];

    if (!paidReport && !developerPreview) {
      return res.json({
        result: fallbackReport({ name, pillars, daewoon, sewoon }),
        pillars,
        daewoon,
        sewoon,
        calendarType: safeCalendar,
      });
    }

    if (!client) {
      const report = fallbackReport({ name, pillars, daewoon, sewoon });
      const response = {
        result: report,
        pillars,
        daewoon,
        sewoon,
        calendarType: safeCalendar,
      };
      if (developerPreview) {
        response.developer_debug = buildDeveloperDebugPayload({
          report,
          prompt: [
            "local fallback: OpenAI API key is not configured",
            "",
            aiBrainContext.prompt,
            "",
            buildCounselingStyleGuide(name),
            "",
            "우선순위:",
            "1. golden_dataset: 현재 요청과 가장 유사한 검수 완료 리포트의 Decision Rule과 Consultation Strategy",
            "2. review_dataset: 현명역학원이 승인한 수정 기록",
            "3. RAG: 계산/검색/참고 문맥",
            "4. Knowledge Rule: 기본 작성 규칙과 세계관",
            "",
            "현명역학원 Golden Dataset 검색 결과 - Brain 우선 참고:",
            goldenDatasetGuidance || "등록된 golden_dataset 없음",
            "",
            "현명역학원 Review Dataset 우선 참고:",
            reviewDatasetGuidance || "승인된 리뷰 데이터 없음",
          ].join("\n"),
          ragContext,
          sources,
          gptResponse: "local fallback report",
          finalMarkdown: report,
          goldenDatasetGuidance,
          aiBrainContext,
        });
      }
      return res.json({
        ...response,
      });
    }

    let prompt = `${aiBrainContext.prompt}

${buildCounselingStyleGuide(name)}

이름: ${name}
성별: ${genderLabel}
입력 기준: ${calendarLabel}
입력 생년월일시: ${year}년 ${month}월 ${day}일 ${hour}시 ${minute}분
양력 변환일: ${pillars.solarDate}

사주 팔자:
년주: ${pillars.year}
월주: ${pillars.month}
일주: ${pillars.day}
시주: ${pillars.hour}

지장간:
${hiddenSummary}

대운 정보:
${daewoon.startInfo}
${daewoon.list.map((d) => `${d.startAge}세-${d.endAge}세 ${d.ganji} 대운 (${d.startYear}년-${d.endYear}년)`).join("\n")}

세운 정보:
${sewoon.startInfo}
${sewoon.list.map((s) => `${s.year}년 ${s.ganji}: 천간 ${s.stemElement}, 지지 ${s.branchElement} / ${s.theme}`).join("\n")}

너는 "사주전쟁 SAJU WAR"의 프리미엄 리포트 작가다.

핵심 세계관:
- 원국은 타고난 전장이다.
- 강한 세력은 그 사람의 타고난 팔자이지만, 동시에 오해의 원인이 된다.
- 지장간은 숨겨진 아이템이다. 내가 꿈꾸는 능력, 욕망, 가능성이 여기에 숨어 있다.
- 대운은 인생의 스위치다. 지장간 속 아이템 회로를 켠다.
- 세운은 실제로 아이템을 꺼내 쓰는 타이밍이다.
- 나쁜 원국처럼 보이는 사주에도 그 사람만의 쓰임과 아이템이 있다.
- 사람은 움직이고 도전할 때 자기 운을 현실화한다.

현명역학원 해석 원칙:
- 반드시 사주명리의 기본 논리인 음양, 오행, 천간, 지지, 지장간, 십성적 관계, 합충형해파, 대운과 세운의 작용 순서로 판단한다.
- 먼저 원국의 계절감과 월지의 힘을 보고, 그 다음 일간의 상태, 오행의 편중, 지장간의 실제 쓰임, 대운과 세운의 작동 순서로 해석한다.
- 철학적 해석은 사주 구조에서 출발해야 하며, 근거 없는 자기계발식 예시를 만들지 않는다.
- 계약, 사업, 브랜드, 연애, 투자 같은 예시는 해당 장의 주제와 사주 구조상 필요한 경우에만 제한적으로 사용한다.
- "무조건 성공", "반드시 돈이 된다", "타고난 운명이라 못 바꾼다" 같은 단정은 금지한다.
- 고객의 불안을 자극하지 말고, 원국에서 왜 그런 성향이 생기는지와 어떤 대운/세운에서 어떻게 조절할지 설명한다.
- 각 문단은 사주 근거 → 철학적 의미 → 현실 적용 → 조심할 점 → 실천법 순서로 쓴다.

아래 순서로 깊고 구체적인 한국어 리포트를 작성하라.

1. 전체 총평
2. 원국 전장 분석
3. 일간 캐릭터 분석
4. 오행 세력 분석
5. 지장간 아이템 분석
6. 대운 스위치 분석
7. 세운 타이밍 분석
8. 재물운과 돈의 아이템
9. 직업운, 사업운, 브랜드 전략
10. 연애운과 관계 패턴
11. 건강운은 진단처럼 말하지 말고 생활 관리 관점으로 설명
12. 개운 전략과 올해 행동 카드
13. 최종 메시지

작성 규칙:
- 무섭게 단정하지 말고, 움직이게 만드는 전략 문체로 쓴다.
- 각 항목마다 실제 행동 예시를 포함한다.
- "좋다/나쁘다"보다 "어떻게 쓰는가"를 중심으로 설명한다.
- 각 제목(1번부터 13번까지)마다 본문은 반드시 공백 제외 최소 2000자 이상 작성한다.
- 각 제목마다 최소 7개 이상의 긴 문단을 작성한다.
- 각 제목마다 현실 사례 3개, 실행 전략 3개, 주의할 점 2개, 상담사가 실제로 말하는 한 줄 조언 1개를 포함한다.
- 짧은 요약형 문단으로 끝내지 말고, 고객이 돈을 내고 받은 프리미엄 심화 리포트처럼 충분히 길고 구체적으로 작성한다.
- 분량 제한 때문에 줄일 필요가 있으면 항목 수를 줄이지 말고 각 항목을 모두 깊게 쓴다.
- 이상한 가상 사례나 고객 정보에 없는 직업/상황을 단정하지 않는다.
- 모든 예시는 "예를 들어 이런 흐름으로 나타날 수 있다"는 가능성 표현으로 쓰고, 반드시 사주 구조와 연결한다.
`;

    prompt += [
      "",
      "우선순위:",
      "1. golden_dataset: 현재 요청과 가장 유사한 검수 완료 리포트의 Decision Rule과 Consultation Strategy",
      "2. review_dataset: 현명역학원이 승인한 수정 기록",
      "3. RAG: 계산/검색/참고 문맥",
      "4. Knowledge Rule: 기본 작성 규칙과 세계관",
      "",
      "현명역학원 Golden Dataset 검색 결과 - Brain 우선 참고:",
      goldenDatasetGuidance || "등록된 golden_dataset 없음",
      "",
      "현명역학원 Review Dataset 우선 참고:",
      reviewDatasetGuidance || "승인된 리뷰 데이터 없음",
      "",
      "RAG Context:",
      ragContext,
    ].join("\n");

    prompt += [
      "",
      "[Authoritative Dataset Order Reminder]",
      "The paid report must use this final order: Master Rule -> Decision Priority -> Golden Brain Case -> Consultation Strategy -> Action Strategy -> Language Style -> Evidence -> Review Dataset -> Customer Information.",
      "Developer Mode and paid customer generation both use this same prompt and AI Brain dataset context.",
      "Make the paid report feel materially richer than a free reading: every numbered chapter must be at least 2000 Korean characters excluding spaces.",
      "Every numbered chapter must include at least three concrete real-life scenes, three practical next actions, two cautions, and one counselor-style closing line.",
      "Do not compress chapters into short summaries. Write long, premium, paid-report depth for every heading.",
      "All examples must be grounded in saju logic: yin-yang, five elements, stems, branches, hidden stems, ten-god relationships, seasonal strength, daewoon and sewoon. Do not invent random self-help, business, contract, branding, or relationship examples unless the chapter topic and saju structure justify them.",
      "Use Hyunmyung Yeokhakwon style: saju evidence first, philosophical meaning second, realistic application third, caution fourth, action fifth.",
      "Avoid a wall of text by using clear paragraph rhythm inside each long chapter: core judgment, why it happens, how it appears in daily life, what the customer should do next, cautions, and one counselor-style closing line.",
      "Use more practical detail for work, money, relationships, health management, yearly timing, and immediate action. Do not add new product features; only improve the report content quality.",
      "The final message must land like a decisive closing: name the year to start, the year by which the customer can secure the desired result, and the exact personal weapon/strength to use at that time.",
      "Output style must be counseling-first: why -> real-life manifestation -> next action in every chapter, at least three '맞아.' recognition sentences, restrained metaphor use, one counselor advice line per chapter, and a final practical action instruction.",
    ].join("\n");

    let report = "";
    let gptFallbackReason = "";

    try {
      const completion = await createChatCompletionWithTimeout({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "너는 현명역학원 명리 논리로 사주 리포트를 작성하는 프리미엄 상담가다. 해석은 반드시 음양, 오행, 천간, 지지, 지장간, 십성적 관계, 계절감, 월지의 힘, 대운, 세운의 순서로 판단한다. 사주 구조에서 출발하지 않는 자기계발식 예시나 뜬금없는 사업/계약/브랜드 예시는 금지한다. 우선순위는 golden_dataset, review_dataset, RAG, Knowledge Rule 순서다. 답변 생성 전에 현재 요청과 가장 유사한 Golden Report를 찾고, Decision Rule, Consultation Strategy, Golden Example, 고객 정보 순서로 사고한다. 단 Golden Report의 고객 고유 내용, 개인정보, 사건, 직업, 관계 사정, 구체 문장은 복사하지 말고 판단 규칙, 설명 순서, 문체, 문단 구조, 현실 조언 방식, 결론 방식만 재현한다. 운명을 겁주지 말고, 원국의 구조와 지장간, 대운, 세운을 철학적 판단과 현실 조절 전략으로 연결한다.",
          },
          {
            role: "system",
            content:
              "Authoritative generation order: Master Rule -> Decision Priority -> Golden Brain Case -> Consultation Strategy -> Action Strategy -> Language Style -> Evidence -> Review Dataset -> Customer Information. This order overrides any legacy priority text. Paid reports and Developer Mode previews must share this same AI Brain prompt context. Write in Hyunmyung Yeokhakwon saju-philosophy style, not generic self-help prose. Every numbered chapter must be at least 2000 Korean characters excluding spaces and must follow saju evidence -> philosophical meaning -> realistic manifestation -> next action -> cautions -> counselor closing line. Reduce repeated '입니다'. Prefer saju-grounded interpretation over random examples. Use 전장/군단/스위치/아이템 only 2-3 times total. Include at least three sentences that make the customer feel '맞아.' End each chapter with one counselor-style advice line. End the whole report with a concrete action instruction.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 24000,
        temperature: 0.75,
      });

      report = completion.choices[0].message.content;
      const shortChapters = findShortPaidReportChapters(report, 2000);
      if (shortChapters.length) {
        const expansion = await createChatCompletionWithTimeout({
          model: "gpt-4.1-mini",
          messages: [
            {
              role: "system",
              content:
                "너는 현명역학원 명리 논리로 프리미엄 유료 사주 리포트를 확장하는 편집자다. 기존 리포트의 사주 판단은 유지하되, 짧은 챕터를 대폭 확장한다. 모든 번호 제목은 유지하고, 각 제목 본문은 공백 제외 최소 2000자 이상이어야 한다. 각 챕터는 반드시 사주 근거(음양, 오행, 천간, 지지, 지장간, 십성적 관계, 계절감, 월지, 대운, 세운) -> 철학적 의미 -> 현실 적용 -> 주의점 -> 실천법 순서로 확장한다. 고객 정보에 없는 이상한 가상 사례나 자기계발식 예시는 금지한다.",
            },
            {
              role: "user",
              content: [
                "아래 유료 리포트는 일부 챕터가 너무 짧다.",
                "전체 1번부터 13번까지 모든 제목을 유지하면서, 각 제목 본문을 공백 제외 최소 2000자 이상으로 확장하라.",
                "특히 짧은 챕터:",
                shortChapters.map((chapter) => `${chapter.number}. ${chapter.title} (${chapter.chars}자)`).join("\n"),
                "",
                "[기존 리포트]",
                report,
              ].join("\n"),
            },
          ],
          max_tokens: 24000,
          temperature: 0.72,
        });
        report = expansion.choices[0].message.content;
      }
    } catch (error) {
      console.error("GPT 리포트 생성 실패, 로컬 폴백 사용:", error);
      gptFallbackReason = error.message || "GPT report generation failed";
      report = fallbackReport({ name, pillars, daewoon, sewoon });
    }
    const response = {
      result: report,
      pillars,
      daewoon,
      sewoon,
      calendarType: safeCalendar,
    };
    if (gptFallbackReason) {
      response.fallback = true;
      response.fallback_reason = gptFallbackReason;
    }
    if (developerPreview) {
      response.developer_debug = buildDeveloperDebugPayload({
        report,
        prompt,
        ragContext,
        sources,
        gptResponse: gptFallbackReason ? `fallback: ${gptFallbackReason}` : report,
        finalMarkdown: report,
        goldenDatasetGuidance,
        aiBrainContext,
      });
    }
    res.json(response);
  } catch (error) {
    console.error("분석 오류:", error);
    res.status(500).json({
      result: "서버 오류가 발생했습니다. 터미널 로그를 확인해주세요.",
      error: error.message,
    });
  }
}

function handleManse(req, res) {
  try {
    const { name, birth, time, calendarType } = req.body;

    if (!name || !birth || !time) {
      return res.status(400).json({
        result: "이름, 생년월일, 시간을 모두 입력해주세요.",
      });
    }

    const safeCalendar = calendarType || "solar";
    const { year, month, day, hour, minute } = normalizeDateTimeParts(birth, time);
    const pillarsRaw = getSaju(year, month, day, hour, minute || "0", safeCalendar);
    const pillars = {
      year: pillarsRaw.year,
      month: pillarsRaw.month,
      day: pillarsRaw.day,
      hour: pillarsRaw.hour,
      solarDate: pillarsRaw.solarDate,
    };

    res.json({
      name,
      pillars,
      hiddenSummary: makeHiddenItemSummary(pillars),
      calendarType: safeCalendar,
    });
  } catch (error) {
    console.error("만세력 계산 오류:", error);
    res.status(500).json({
      result: "만세력 계산 중 오류가 발생했습니다. 입력값을 다시 확인해주세요.",
      error: error.message,
    });
  }
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/developer-preview-config", (req, res) => {
  res.json({
    available: isDeveloperPreviewRequest(req),
    environment: process.env.SAJUWAR_ENV || "development",
  });
});

app.get("/api/review-dataset", (req, res) => {
  if (!isDeveloperPreviewRequest(req)) {
    return res.status(403).json({ error: "Developer Preview access required" });
  }
  res.json({ items: readReviewDataset().reverse() });
});

app.post("/api/review-dataset", (req, res) => {
  if (!isDeveloperPreviewRequest(req)) {
    return res.status(403).json({ error: "Developer Preview access required" });
  }
  if (!req.body?.before || !req.body?.after) {
    return res.status(400).json({ error: "before and after are required" });
  }
  const record = appendReviewRecord(req.body);
  res.json({ item: record });
});

app.post("/api/review-dataset/:id/approve", (req, res) => {
  if (!isDeveloperPreviewRequest(req)) {
    return res.status(403).json({ error: "Developer Preview access required" });
  }
  const item = approveReviewRecord(req.params.id);
  if (!item) {
    return res.status(404).json({ error: "review item not found" });
  }
  res.json({ item });
});

app.get("/api/review-dataset/export", (req, res) => {
  if (!isDeveloperPreviewRequest(req)) {
    return res.status(403).send("Developer Preview access required");
  }
  ensureReviewDatasetFile();
  res.setHeader("Content-Type", "application/jsonl; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=\"review_dataset.jsonl\"");
  res.send(fs.readFileSync(reviewDatasetPath, "utf8"));
});

app.post("/api/auth/signup", (req, res) => {
  try {
    res.json(userStore.signup(req.body));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    res.json(userStore.login(req.body));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post("/api/auth/logout", (req, res) => {
  userStore.logout(getAuthToken(req));
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: "로그인이 필요합니다." });
  res.json({ user });
});

app.get("/api/products", (req, res) => {
  res.json({ products: Object.values(PRODUCTS), bankAccount });
});

app.post("/api/orders/bank-transfer", (req, res) => {
  try {
    const user = requireLogin(req, res);
    if (!user) return;
    const order = orderStore.createBankTransferOrder({
      ...req.body,
      user_id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
    });
    res.json({ order, bankAccount });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, order: error.order });
  }
});

app.post("/api/orders/:id/deposit-complete", (req, res) => {
  try {
    const user = requireLogin(req, res);
    if (!user) return;
    const order = orderStore.markDepositWaiting(req.params.id, req.body?.depositor_name, user.id);
    if (!order) return res.status(404).json({ error: "order not found" });
    res.json({ order });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/my/orders", (req, res) => {
  const user = requireLogin(req, res);
  if (!user) return;
  res.json({ orders: orderStore.findUserOrders({ user_id: user.id }) });
});

app.get("/api/purchases/check", (req, res) => {
  const productId = req.query.product_id || "premium_report";
  const user = getAuthUser(req);
  res.json({
    product_id: productId,
    active: Boolean(user && orderStore.hasPurchase({ user_id: user.id, product_id: productId })),
  });
});

app.get("/api/report", (req, res) => {
  if (!canAccessProduct(req, "premium_report")) return sendPurchaseRequired(res);
  markProductAccess(req, "premium_report", "view");
  res.json({ ok: true, message: "report access granted" });
});

function getSeasonFromMonthBranch(branch) {
  const seasonMap = {
    "寅": "봄 초입",
    "卯": "봄 중심",
    "辰": "봄에서 여름으로 넘어가는 환절",
    "巳": "여름 초입",
    "午": "여름 중심",
    "未": "여름에서 가을로 넘어가는 환절",
    "申": "가을 초입",
    "酉": "가을 중심",
    "戌": "가을에서 겨울로 넘어가는 환절",
    "亥": "겨울 초입",
    "子": "겨울 중심",
    "丑": "겨울에서 봄으로 넘어가는 환절",
  };
  return seasonMap[branch] || "월지 확인 필요";
}

function countChartElements(pillars = {}) {
  const counts = { "목": 0, "화": 0, "토": 0, "금": 0, "수": 0 };
  ["year", "month", "day", "hour"].forEach((key) => {
    const pillar = pillars[key] || "";
    const stem = pillar[0];
    const branch = pillar[1];
    const stemEl = stemElement[stem];
    const branchEl = branchElement[branch];
    if (stemEl) counts[stemEl] += 1;
    if (branchEl) counts[branchEl] += 1;
    (hiddenStems[branch] || []).forEach((hidden) => {
      const hiddenEl = stemElement[hidden];
      if (hiddenEl) counts[hiddenEl] += 0.5;
    });
  });
  return counts;
}

function summarizeElementBalance(counts = {}) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const strong = entries.filter(([, value]) => value >= entries[0]?.[1]).map(([key]) => key);
  const weak = entries.filter(([, value]) => value <= entries[entries.length - 1]?.[1]).map(([key]) => key);
  return {
    counts,
    strong: strong.join(", "),
    weak: weak.join(", "),
  };
}

function buildStrategyRoomChart(profile = {}) {
  if (!profile.birth || !profile.time) return null;
  try {
    const { year, month, day, hour, minute } = normalizeDateTimeParts(profile.birth, profile.time);
    if (!year || !month || !day || !hour) return null;
    const pillarsRaw = getSaju(year, month, day, hour, minute || "0", profile.calendarType || "solar");
    const pillars = {
      year: pillarsRaw.year,
      month: pillarsRaw.month,
      day: pillarsRaw.day,
      hour: pillarsRaw.hour,
      solarDate: pillarsRaw.solarDate,
    };
    const dayMaster = pillars.day[0];
    const monthBranch = pillars.month[1];
    const daewoon = makeDaewoon(pillarsRaw.eightChar, profile.gender || "female");
    const sewoon = makeSewoon(new Date().getFullYear());
    return {
      pillars,
      dayMaster,
      dayMasterElement: stemElement[dayMaster] || "",
      season: getSeasonFromMonthBranch(monthBranch),
      hiddenSummary: makeHiddenItemSummary(pillars),
      elementBalance: summarizeElementBalance(countChartElements(pillars)),
      daewoon,
      sewoon,
    };
  } catch (error) {
    return { error: error.message };
  }
}

function fallbackStrategyReply(message, state = {}) {
  const text = String(message || "");
  const risky = /죽|자살|폭력|의료|투자|법률|소송|우울|극단|학대|중독/.test(text);
  if (risky) {
    return "[현실 분석]\n이 주제는 안전이 먼저입니다. 명리로 급박한 위험을 판단하거나 미래를 단정하지 않겠습니다. 지금 위험하거나 급박하다면 즉시 주변 사람, 전문가, 긴급 지원 기관의 도움을 받아주세요.\n\n[전략 제안]\n혼자 결론 내리지 말고 신뢰할 수 있는 사람에게 현재 상황을 공유하세요.\n\n[오늘의 퀘스트]\n오늘 안에 믿을 수 있는 사람 1명에게 현재 상황을 문자로 알리기.";
  }
  const profile = state.profile || {};
  const chart = buildStrategyRoomChart(profile);
  const chartLine = chart && !chart.error
    ? `원국은 년주 ${chart.pillars.year}, 월주 ${chart.pillars.month}, 일주 ${chart.pillars.day}, 시주 ${chart.pillars.hour}입니다. 일간은 ${chart.dayMaster}(${chart.dayMasterElement})이고, 월지는 ${chart.pillars.month[1]}로 ${chart.season}의 흐름입니다.`
    : "생년월일시가 부족해서 원국 판단은 보류합니다. 상담 전에 생년월일, 태어난 시간, 성별, 양/음력을 입력해야 합니다.";
  const realityLine = profile.reality || profile.goal
    ? `입력된 현실은 "${profile.reality || "미입력"}", 원하는 결과는 "${profile.goal || "미입력"}"입니다.`
    : "현실 정보가 아직 부족합니다. 현재 직업/상황, 선택지, 원하는 결과를 확인해야 조언의 정확도가 올라갑니다.";
  return `[사주 분석]\n${chartLine}\n\n[현실 분석]\n${realityLine}\n\n[전략 제안]\n지금은 결론을 단정하기보다 사주에서 보이는 성향과 실제 조건을 분리해 판단해야 합니다. 선택지는 1. 바로 결정하지 않고 기준을 적기, 2. 감정과 사실을 분리하기, 3. 작은 실험으로 확인하기입니다.\n\n[확인 질문]\n1. 지금 고민에서 실제 선택지는 무엇과 무엇입니까?\n2. 가장 두려운 손실은 무엇입니까?\n3. 3개월 뒤 원하는 결과는 무엇입니까?\n\n[오늘의 퀘스트]\n오늘 밤 10시까지 이 선택에서 가장 두려운 이유 1가지와 가장 원하는 결과 1가지를 각각 한 문장으로 적기.`;
}

async function buildStrategyReply(user, state, message) {
  const safeMessage = String(message || "").trim();
  if (!client) return fallbackStrategyReply(safeMessage, state);
  const profile = state.profile || {};
  const weapon = state.weapon || {};
  const chart = buildStrategyRoomChart(profile);
  const completion = await createChatCompletionWithTimeout({
    model: process.env.SAJUWAR_CHAT_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          [
            "너는 쭈쌤의 사주전쟁 상담 에이전트다. 챗봇처럼 행동하지 말고 사주명리 기반 라이프 전략가처럼 답한다.",
            "목적은 점괘가 아니라 자기 이해, 좋은 결정, 실행, 회고, 성장이다.",
            "운명을 단정하지 말고, 불안을 자극하지 말고, 사용자의 책임 있는 선택을 돕는다.",
            "중요한 조언 전에는 현실 정보가 부족하면 질문을 먼저 한다. 사주에서 보이는 것, 현실에서 확인된 것, 확인이 필요한 것을 절대 섞지 않는다.",
            "답변은 반드시 한국어로 작성하고 다음 제목을 이 순서로 사용한다: [사주 분석], [현실 분석], [전략 제안], [오늘의 퀘스트]. 필요한 경우 [확인 질문]을 [전략 제안] 앞에 둔다.",
            "사주 분석에는 원국, 년주, 월주, 일주, 시주, 일간, 월지 계절, 오행 균형, 지장간, 대운, 세운을 반영한다. 제공되지 않은 정보는 사실처럼 말하지 않는다.",
            "현실 분석에는 사용자가 입력한 직업, 돈, 관계, 가족, 건강, 사업, 목표 정보를 근거로 쓴다. 부족한 현실 정보는 질문으로 남긴다.",
            "전략 제안은 선택지, 조건, 위험, 실행 순서로 정리한다. 결혼, 이혼, 퇴사, 투자, 의료 판단을 대신 결정하지 않는다.",
            "오늘의 퀘스트는 작고, 구체적이고, 측정 가능해야 하며 마감시간과 성공 기준을 포함한다.",
            "의료, 법률, 투자, 자해, 폭력, 학대, 중독, 심각한 우울 등 고위험 주제는 전문가 또는 긴급 도움을 우선 안내한다.",
          ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          user: { name: user.name },
          profile,
          weapon,
          chart,
          level: state.level,
          xp: state.xp,
          recentMemory: (state.chat || []).slice(-8),
          question: safeMessage,
        }),
      },
    ],
    temperature: 0.5,
  });
  return completion.choices?.[0]?.message?.content?.trim() || fallbackStrategyReply(safeMessage, state);
}

app.get("/api/strategy-room/state", (req, res) => {
  const user = requireLogin(req, res);
  if (!user) return;
  res.json({ state: strategyStore.getState(user), user });
});

app.post("/api/strategy-room/profile", (req, res) => {
  try {
    const user = requireLogin(req, res);
    if (!user) return;
    res.json({ state: strategyStore.updateProfile(user, req.body || {}) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post("/api/strategy-room/quests/:id/complete", (req, res) => {
  const user = requireLogin(req, res);
  if (!user) return;
  const state = strategyStore.completeQuest(user, req.params.id);
  if (!state) return res.status(404).json({ error: "Quest not found" });
  res.json({ state });
});

app.post("/api/strategy-room/skills/:id/complete", (req, res) => {
  const user = requireLogin(req, res);
  if (!user) return;
  const state = strategyStore.completeSkill(user, req.params.id);
  if (!state) return res.status(404).json({ error: "Skill not found" });
  res.json({ state });
});

app.post("/api/strategy-room/guild", (req, res) => {
  const user = requireLogin(req, res);
  if (!user) return;
  const state = strategyStore.addGuildPost(user, req.body?.body);
  if (!state) return res.status(400).json({ error: "Guild post body is required" });
  res.json({ state });
});

app.patch("/api/strategy-room/settings", (req, res) => {
  const user = requireLogin(req, res);
  if (!user) return;
  res.json({ state: strategyStore.updateSettings(user, req.body?.settings || {}) });
});

app.post("/api/strategy-room/chat", async (req, res) => {
  try {
    const user = requireLogin(req, res);
    if (!user) return;
    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ error: "message is required" });
    const currentState = strategyStore.getState(user);
    const reply = await buildStrategyReply(user, currentState, message);
    const state = strategyStore.appendChat(user, message, reply);
    res.json({ reply, state });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post("/api/strategy-room/reset", (req, res) => {
  const user = requireLogin(req, res);
  if (!user) return;
  res.json({ state: strategyStore.resetState(user) });
});

app.get("/api/admin/orders", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const purchases = orderStore.listPurchases();
  const orders = orderStore.listOrders().map((order) => ({
    ...order,
    purchase: purchases.find((purchase) => purchase.order_id === order.id) || null,
  }));
  res.json({ orders });
});

app.post("/api/admin/orders/:id/confirm", (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const order = orderStore.findOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "order not found" });
    res.json(orderStore.activatePurchase(order));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post("/api/admin/orders/:id/cancel", (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const order = orderStore.cancelOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "order not found" });
    res.json({ order });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post("/api/admin/orders/:id/revoke", (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const result = orderStore.revokePurchase(req.params.id);
    if (!result) return res.status(404).json({ error: "order not found" });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post("/analyze", handleAnalyze);
app.post("/api/saju", handleAnalyze);
app.post("/api/manse", handleManse);

app.listen(PORT, () => {
  console.log(`사주전쟁 서버 실행 중: http://localhost:${PORT}`);
});
