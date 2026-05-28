const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const OpenAI = require("openai");
const { Solar, Lunar } = require("lunar-javascript");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    const genderCode = gender === "남자" ? 1 : 0;
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
      startInfo: `대운 시작: ${yun.getStartYear()}년 ${yun.getStartMonth()}개월 ${yun.getStartDay()}일 후 시작`,
      list,
    };
  } catch (error) {
    console.error("대운 계산 오류:", error);

    return {
      startInfo: "대운 계산 중 오류가 발생했습니다. 라이브러리 대운 API 확인이 필요합니다.",
      list: [],
    };
  }
}

function makeSewoon(startYear = new Date().getFullYear()) {
  const stems = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  const branches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

  const elementMap = {
    "甲": "목", "乙": "목", "丙": "화", "丁": "화", "戊": "토", "己": "토", "庚": "금", "辛": "금", "壬": "수", "癸": "수",
    "子": "수", "丑": "토", "寅": "목", "卯": "목", "辰": "토", "巳": "화", "午": "화", "未": "토", "申": "금", "酉": "금", "戌": "토", "亥": "수",
  };

  const themeMap = {
    목: "성장, 시작, 확장, 공부, 기획",
    화: "노출, 인기, 표현, 콘텐츠, 홍보",
    토: "현실화, 정리, 기반, 부동산, 안정",
    금: "결단, 정리, 기술, 계약, 구조화",
    수: "정보, 이동, 유통, 지식, 흐름",
  };

  const list = [];

  for (let i = 0; i < 10; i++) {
    const year = Number(startYear) + i;
    const stem = stems[(year - 4) % 10];
    const branch = branches[(year - 4) % 12];
    const ganji = stem + branch;

    const stemElement = elementMap[stem];
    const branchElement = elementMap[branch];

    list.push({
      year,
      ganji,
      stem,
      branch,
      stemElement,
      branchElement,
      theme: `${themeMap[stemElement]} / ${themeMap[branchElement]}`,
    });
  }

  return {
    startInfo: `${startYear}년부터 10년 세운 흐름입니다. 세운은 매년 들어오는 사건의 날씨이며, 실제 아이템을 꺼내 쓰는 타이밍입니다.`,
    list,
  };
}

async function handleAnalyze(req, res) {
  try {
    console.log("요청 데이터:", req.body);

    const { name, birth, time, gender, calendarType } = req.body;

    if (!name || !birth || !time || !gender) {
      return res.status(400).json({
        result: "입력값이 부족합니다.",
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

    const prompt = `
이름: ${name}
성별: ${gender}
입력 기준: ${calendarLabel}
입력 생년월일: ${year}년 ${month}월 ${day}일 ${hour}시 ${minute}분
양력 변환일: ${pillars.solarDate}

사주팔자:
년주: ${pillars.year}
월주: ${pillars.month}
일주: ${pillars.day}
시주: ${pillars.hour}

대운 정보:
${daewoon.startInfo}
${daewoon.list.map(d => `${d.startAge}세~${d.endAge}세: ${d.ganji}대운 (${d.startYear}년~${d.endYear}년)`).join("\n")}

세운 정보:
${sewoon.startInfo}
${sewoon.list.map(s => `${s.year}년 ${s.ganji}: 천간 ${s.stemElement}, 지지 ${s.branchElement} / ${s.theme}`).join("\n")}

너는 사주전쟁 SAJU WAR의 프리미엄 명리 리포트 작가다.

세계관:
- 원국은 타고난 전쟁터다.
- 천간은 겉으로 드러난 지휘부다.
- 지지는 현실의 전장이다.
- 지장간은 숨겨진 아이템이다.
- 대운은 인생의 스위치다.
- 세운은 아이템을 실제로 꺼내 쓰는 타이밍이다.
- 나쁜 사주는 있어도 쓸모없는 사주는 없다.
- 운명은 고정 판결문이 아니라 작전 지도다.

반드시 아래 순서로 길고 깊게 작성하라.

1. 전체 총평
이 사주의 핵심 구조를 프리미엄 리포트처럼 설명하라.

2. 원국 전장 분석
년주, 월주, 일주, 시주가 각각 어떤 역할을 하는지 설명하라.

3. 일간 캐릭터 분석
일간의 강점, 약점, 돈, 관계, 일 처리 방식을 설명하라.

4. 오행 세력 분석
목, 화, 토, 금, 수의 강약과 현실적 영향을 설명하라.

5. 지장간 아이템 분석
숨겨진 재능, 잠재력, 위기 때 나오는 능력을 설명하라.

6. 대운 스위치 분석
각 대운이 어떤 방향으로 인생을 움직이는지 설명하라.

7. 세운 타이밍 분석
향후 10년 중 중요한 기회와 주의 시기를 설명하라.

8. 재물운
돈이 들어오는 방식, 돈이 새는 방식, 수익화 전략을 설명하라.

9. 직업운과 사업운
직장, 사업, 브랜딩, 온라인 수익화 가능성을 설명하라.

10. 연애운과 결혼운
관계 패턴, 인연 방식, 배우자운을 설명하라.

11. 건강운
의학적 진단처럼 단정하지 말고 생활관리 관점으로 설명하라.

12. 개운 전략
이 사주가 현실에서 운을 쓰는 방법을 구체적으로 제안하라.

13. 최종 메시지
따뜻하지만 힘 있게 마무리하라.

작성 규칙:
- 한국어로 작성하라.
- 최소 6000자 이상 작성하라.
- 각 항목마다 최소 3문단 이상 작성하라.
- 너무 무섭게 단정하지 말라.
- 실제 상담사가 말하듯 구체적으로 작성하라.
- “좋다/나쁘다”보다 “어떻게 쓰느냐” 중심으로 작성하라.
- 사주전쟁 세계관 표현을 자연스럽게 섞어라.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "너는 명리학 기반으로 사주를 전쟁터, 병력, 지장간 아이템, 대운 스위치, 세운 타이밍의 세계관으로 해석하는 프리미엄 사주전쟁 리포트 작가다. 짧은 요약을 금지하고, 구조와 이유를 깊게 설명한다.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 7000,
      temperature: 0.75,
    });

    res.json({
      result: completion.choices[0].message.content,
      pillars,
      daewoon,
      sewoon,
      calendarType: safeCalendar,
    });
  } catch (error) {
    console.error("분석 오류:", error);
    res.status(500).json({
      result: "서버 오류가 발생했습니다. 터미널 로그를 확인해주세요.",
      error: error.message,
    });
  }
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/analyze", handleAnalyze);
app.post("/api/saju", handleAnalyze);

app.listen(PORT, () => {
  console.log(`서버 실행됨: ${PORT}`);
});