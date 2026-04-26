const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const OpenAI = require("openai");
const { calculateFourPillars } = require("manseryeok");
const { Solar } = require("lunar-javascript");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 시간 입력 처리
function parseTime(timeText) {
  if (!timeText) return { hour: 12, minute: 0 };

  const clean = String(timeText).replace(":", "").trim();

  if (clean.length === 4) {
    return {
      hour: Number(clean.slice(0, 2)),
      minute: Number(clean.slice(2, 4))
    };
  }

  if (clean.length <= 2) {
    return {
      hour: Number(clean),
      minute: 0
    };
  }

  return { hour: 12, minute: 0 };
}

// 년주 입춘 보정용
function getYearPillarByYear(sajuYear) {
  const gan = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
  const ji = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];

  const ganIndex = ((sajuYear - 4) % 10 + 10) % 10;
  const jiIndex = ((sajuYear - 4) % 12 + 12) % 12;

  return gan[ganIndex] + ji[jiIndex];
}

function getYearPillarByIpchun(year, month, day, hour, minute) {
  let sajuYear = year;

  if (month < 2) {
    sajuYear = year - 1;
  }

  if (month === 2) {
    if (day < 4) {
      sajuYear = year - 1;
    }

    if (day === 4) {
      const totalMinutes = hour * 60 + minute;
      const ipchunApproxMinutes = 12 * 60;

      if (totalMinutes < ipchunApproxMinutes) {
        sajuYear = year - 1;
      }
    }
  }

  return getYearPillarByYear(sajuYear);
}

// 성별 처리
function getGenderCode(gender) {
  const g = String(gender || "").trim();

  // lunar-javascript 기준: 보통 1 남자, 0 여자
  if (g.includes("남")) return 1;
  return 0;
}

function safeCall(obj, methodName) {
  if (!obj || typeof obj[methodName] !== "function") return "";
  return obj[methodName]();
}

// 대운 계산
function calculateDaewoon(year, month, day, hour, minute, gender) {
  try {
    const solar = Solar.fromYmdHms(year, month, day, hour, minute, 0);
    const lunar = solar.getLunar();
    const eightChar = lunar.getEightChar();

    const genderCode = getGenderCode(gender);
    const yun = eightChar.getYun(genderCode);

    const startYear = safeCall(yun, "getStartYear");
    const startMonth = safeCall(yun, "getStartMonth");
    const startDay = safeCall(yun, "getStartDay");

    const daYunRaw = yun.getDaYun();

    const daewoonList = daYunRaw
      .map((d) => ({
        ganji: safeCall(d, "getGanZhi"),
        startAge: safeCall(d, "getStartAge"),
        endAge: safeCall(d, "getEndAge"),
        startYear: safeCall(d, "getStartYear"),
        endYear: safeCall(d, "getEndYear")
      }))
      .filter((d) => d.ganji)
      .slice(0, 8);

    return {
      startInfo: `${startYear}년 ${startMonth}개월 ${startDay}일 후 대운 시작`,
      list: daewoonList
    };
  } catch (error) {
    console.error("대운 계산 오류:", error);
    return {
      startInfo: "대운 계산 실패",
      list: []
    };
  }
}

// 오행 계산
function splitGanji(ganji) {
  return {
    gan: ganji ? ganji[0] : "",
    ji: ganji ? ganji[1] : ""
  };
}

const ganElement = {
  "갑": "목", "을": "목",
  "병": "화", "정": "화",
  "무": "토", "기": "토",
  "경": "금", "신": "금",
  "임": "수", "계": "수"
};

const jiElement = {
  "자": "수",
  "축": "토",
  "인": "목",
  "묘": "목",
  "진": "토",
  "사": "화",
  "오": "화",
  "미": "토",
  "신": "금",
  "유": "금",
  "술": "토",
  "해": "수"
};

function calculateElementScores(pillars) {
  const scores = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  const list = [pillars.year, pillars.month, pillars.day, pillars.hour];

  list.forEach((ganji, index) => {
    const { gan, ji } = splitGanji(ganji);

    if (ganElement[gan]) {
      scores[ganElement[gan]] += 1;
    }

    if (jiElement[ji]) {
      scores[jiElement[ji]] += 1.5;
    }

    // 월지는 계절 세력이므로 추가 가중치
    if (index === 1 && jiElement[ji]) {
      scores[jiElement[ji]] += 1.5;
    }
  });

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  return {
    scores,
    strongest: sorted[0],
    second: sorted[1],
    weakest: sorted[sorted.length - 1]
  };
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/analyze", async (req, res) => {
  try {
    const { name, birth, time, gender } = req.body;

    if (!birth) {
      return res.status(400).json({
        result: "생년월일을 입력해주세요."
      });
    }

    const [year, month, day] = birth.split("-").map(Number);
    const { hour, minute } = parseTime(time);

    // 1. 만세력 계산
    const fourPillars = calculateFourPillars({
      year,
      month,
      day,
      hour,
      minute
    });

    const pillars = fourPillars.toObject();

    // 2. 년주 입춘 기준 보정
    pillars.year = getYearPillarByIpchun(year, month, day, hour, minute);

    // 3. 대운 계산
    const daewoon = calculateDaewoon(year, month, day, hour, minute, gender);

    const daewoonText = daewoon.list
      .map((d) => `${d.startAge}세~${d.endAge}세: ${d.ganji}대운 (${d.startYear}년~${d.endYear}년)`)
      .join("\n");

    // 4. 오행 세력 계산
    const elementPower = calculateElementScores(pillars);

    // 5. GPT 상담사급 해석
    const prompt = `
너는 현명역학원 실전 통변가이자 고급 사주 상담 리포트 작성가다.

중요 규칙:
- 아래 원국, 대운, 오행 세력은 이미 계산된 확정값이다.
- 절대 다시 계산하지 마라.
- 원국을 수정하지 마라.
- 오직 해석만 하라.
- 애매한 말 금지.
- 실제 상담가처럼 단정적으로 말하라.
- 반드시 구조 → 이유 → 현실 결과 순서로 설명하라.

고객 정보:
이름: ${name || "미입력"}
성별: ${gender || "미입력"}

확정 원국:
년주: ${pillars.year}
월주: ${pillars.month}
일주: ${pillars.day}
시주: ${pillars.hour}

오행 세력:
목: ${elementPower.scores.목}
화: ${elementPower.scores.화}
토: ${elementPower.scores.토}
금: ${elementPower.scores.금}
수: ${elementPower.scores.수}

가장 강한 오행: ${elementPower.strongest[0]} (${elementPower.strongest[1]})
두 번째 강한 오행: ${elementPower.second[0]} (${elementPower.second[1]})
가장 약한 오행: ${elementPower.weakest[0]} (${elementPower.weakest[1]})

대운 시작:
${daewoon.startInfo}

대운 목록:
${daewoonText}

아래 형식으로 작성하라.

[프리미엄 핵심 요약]
이 사주의 인생 구조를 5줄로 요약하라.
첫 줄은 반드시 결론형으로 작성하라.

[1. 원국 핵심 구조]
이 사주는 어떤 구조인지 단정하라.
강한 오행과 약한 오행이 삶에 어떤 영향을 주는지 설명하라.
왜 이런 성격, 돈 흐름, 인간관계가 생기는지 구조적으로 풀어라.

[2. 오행 세력 분석]
가장 강한 오행이 이 사람의 삶을 어떻게 끌고 가는지 설명하라.
두 번째 강한 오행이 어떤 방식으로 보조 작용하는지 설명하라.
가장 약한 오행 때문에 생기는 결핍, 약점, 반복 문제를 설명하라.

[3. 일간 본질]
일간을 중심으로 성향, 자존심, 감정 처리, 인간관계 방식을 설명하라.
단순 성격 설명이 아니라 실제 삶에서 어떻게 드러나는지 말하라.

[4. 재물운]
돈을 버는 방식, 돈이 새는 구조, 돈이 모이는 조건을 설명하라.
강한 오행과 약한 오행이 재물운에 어떤 영향을 주는지 연결해서 말하라.
직장 수입, 사업, 상담/교육/콘텐츠 수익 중 어떤 방향이 유리한지 판단하라.

[5. 직업운과 사업운]
이 사주가 직장형인지, 자영업형인지, 상담/교육/콘텐츠형인지 결론 내려라.
돈 되는 구조를 현실적으로 제시하라.

[6. 배우자운]
배우자 인연의 특징, 결혼에서 반복될 수 있는 문제, 좋은 인연 조건을 설명하라.
관계에서 조심해야 할 점을 현실적으로 말하라.

[7. 대운 흐름]
대운 목록을 바탕으로 인생 흐름을 설명하라.
언제 풀리고, 언제 막히고, 돈과 관계가 언제 바뀌는지 말하라.
대운별로 중요한 구간을 짚어라.

[8. 현재 시기 조언]
지금 이 사람이 집중해야 할 것, 피해야 할 것, 돈과 관계에서 선택해야 할 기준을 말하라.

[9. 최종 결론]
이 사주의 인생 방향을 한 문장으로 정리하라.
마지막에는 상담가처럼 현실적인 조언으로 마무리하라.

문체:
- 고급 상담 리포트 느낌
- 단정적이고 깊이 있게
- “~입니다” 말투
- 너무 짧지 않게
- 고객이 돈 주고 읽는 느낌으로
`;

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt
    });

    res.json({
      pillars,
      daewoon,
      elementPower,
      result: response.output_text || "결과 없음"
    });

  } catch (error) {
    console.error("서버 오류:", error);
    res.status(500).json({
      result: "서버 오류: " + error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`서버 실행됨 http://localhost:${PORT}`);
});