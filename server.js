const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const OpenAI = require("openai");
const { Solar, Lunar } = require("lunar-javascript");

const app = express();
const PORT = process.env.PORT || 3000;
const adminKey = process.env.SAJUWAR_ADMIN_KEY || "";
const developerModeEnabled =
  process.env.SAJUWAR_ENABLE_DEVELOPER_MODE === "true" && Boolean(adminKey);
const reviewDatasetPath =
  process.env.SAJUWAR_REVIEW_DATASET_PATH || path.join(__dirname, "review_dataset.jsonl");
const goldenDatasetPath =
  process.env.SAJUWAR_GOLDEN_DATASET_PATH || path.join(__dirname, "golden_dataset");

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  const requestPath = req.path.replace(/\\/g, "/");
  if (requestPath === "/review_dataset.jsonl" || requestPath.startsWith("/golden_dataset/")) {
    return res.status(404).send("Not found");
  }
  return next();
});
app.use(express.static(__dirname));

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function isDeveloperPreviewRequest(req) {
  if (!developerModeEnabled) return false;
  const providedKey =
    req.get("x-sajuwar-admin-key") ||
    req.body?.adminKey ||
    req.query?.adminKey ||
    "";
  return providedKey === adminKey;
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

function readGoldenDataset() {
  if (!fs.existsSync(goldenDatasetPath)) return [];
  return fs
    .readdirSync(goldenDatasetPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const sectionPath = path.join(goldenDatasetPath, entry.name);
      return fs
        .readdirSync(sectionPath, { withFileTypes: true })
        .filter((file) => file.isFile() && /^golden_\d+\.md$/i.test(file.name))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((file) => ({
          section: entry.name,
          file: file.name,
          content: fs.readFileSync(path.join(sectionPath, file.name), "utf8").trim(),
        }));
    })
    .filter((item) => item.content);
}

function buildGoldenDatasetGuidance() {
  const goldenItems = readGoldenDataset();
  if (!goldenItems.length) return "";
  return [
    "아래는 현명역학원이 직접 검수 완료한 최고 품질 정답 리포트다.",
    "AI는 Review Dataset, RAG, Knowledge Rule보다 이 golden_dataset의 문체, 구성, 판단 깊이, 상담톤을 우선 따라야 한다.",
    "golden_dataset은 수정 기록이 아니라 반드시 따라야 하는 기준 데이터다.",
    "",
    goldenItems
      .map((item, index) => {
        return [
          `[Golden ${index + 1}]`,
          `section: ${item.section}`,
          `file: ${item.file}`,
          item.content,
        ].join("\n");
      })
      .join("\n\n"),
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

function buildDeveloperDebugPayload({ report, prompt, ragContext, sources, gptResponse, finalMarkdown }) {
  return {
    full_paid_report: report,
    prompt,
    rag_context: ragContext,
    sources,
    gpt_response: gptResponse,
    final_markdown: finalMarkdown,
    golden_dataset_guidance: buildGoldenDatasetGuidance() || "등록된 golden_dataset 없음",
    review_dataset_guidance: buildReviewDatasetGuidance() || "승인된 리뷰 데이터 없음",
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

function fallbackReport({ name, pillars, daewoon, sewoon }) {
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
    const { name, birth, time, gender, calendarType } = req.body;

    if (!name || !birth || !time || !gender) {
      return res.status(400).json({
        result: "이름, 생년월일, 시간, 성별을 모두 입력해주세요.",
      });
    }

    const safeCalendar = calendarType || "solar";
    const [year, month, day] = birth.split("-");
    const [hour, minute] = time.split(":");

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
    const goldenDatasetGuidance = buildGoldenDatasetGuidance();
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
            "우선순위:",
            "1. golden_dataset: 현명역학원이 검수 완료한 최고 품질 정답 데이터",
            "2. review_dataset: 현명역학원이 승인한 수정 기록",
            "3. RAG: 계산/검색/참고 문맥",
            "4. Knowledge Rule: 기본 작성 규칙과 세계관",
            "",
            "현명역학원 Golden Dataset 최우선 참고:",
            goldenDatasetGuidance || "등록된 golden_dataset 없음",
            "",
            "현명역학원 Review Dataset 우선 참고:",
            reviewDatasetGuidance || "승인된 리뷰 데이터 없음",
          ].join("\n"),
          ragContext,
          sources,
          gptResponse: "local fallback report",
          finalMarkdown: report,
        });
      }
      return res.json({
        ...response,
      });
    }

    let prompt = `
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
${makeHiddenItemSummary(pillars)}

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
- 전체 분량은 충분히 길게, 유료 리포트처럼 밀도 있게 작성한다.
`;

    prompt += [
      "",
      "우선순위:",
      "1. golden_dataset: 현명역학원이 검수 완료한 최고 품질 정답 데이터",
      "2. review_dataset: 현명역학원이 승인한 수정 기록",
      "3. RAG: 계산/검색/참고 문맥",
      "4. Knowledge Rule: 기본 작성 규칙과 세계관",
      "",
      "현명역학원 Golden Dataset 최우선 참고:",
      goldenDatasetGuidance || "등록된 golden_dataset 없음",
      "",
      "현명역학원 Review Dataset 우선 참고:",
      reviewDatasetGuidance || "승인된 리뷰 데이터 없음",
      "",
      "RAG Context:",
      ragContext,
    ].join("\n");

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "너는 명리학 기반 사주 리포트를 사주전쟁 세계관으로 해석하는 프리미엄 리포트 작가다. 우선순위는 golden_dataset, review_dataset, RAG, Knowledge Rule 순서다. golden_dataset이 있으면 현명역학원이 검수 완료한 정답 데이터로 보고 가장 먼저 따른다. 그 다음 승인된 Review Dataset의 수정 기준을 따른다. 운명을 겁주지 말고, 원국의 구조와 지장간 아이템, 대운 스위치, 세운 타이밍을 행동 전략으로 연결한다.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 10000,
      temperature: 0.75,
    });

    const report = completion.choices[0].message.content;
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
        prompt,
        ragContext,
        sources,
        gptResponse: report,
        finalMarkdown: report,
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
    const [year, month, day] = birth.split("-");
    const [hour, minute] = time.split(":");
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

app.post("/analyze", handleAnalyze);
app.post("/api/saju", handleAnalyze);
app.post("/api/manse", handleManse);

app.listen(PORT, () => {
  console.log(`사주전쟁 서버 실행 중: http://localhost:${PORT}`);
});
