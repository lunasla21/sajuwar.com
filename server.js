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

function getSaju(year, month, day, hour, minute, calendarType) {
  let solar;

  if (calendarType === "lunar") {
    const lunar = Lunar.fromYmdHms(
      Number(year),
      Number(month),
      Number(day),
      Number(hour),
      Number(minute || 0),
      0
    );

    solar = lunar.getSolar();
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
  };
}

function makeDaewoon(year) {
  const y = Number(year);

  return {
    startInfo:
      "대운은 현재 테스트 버전입니다. 추후 성별·음양·절기 기준으로 정밀 계산 예정입니다.",
    list: [
      { startAge: 5, endAge: 14, ganji: "갑자", startYear: y + 5, endYear: y + 14 },
      { startAge: 15, endAge: 24, ganji: "을축", startYear: y + 15, endYear: y + 24 },
      { startAge: 25, endAge: 34, ganji: "병인", startYear: y + 25, endYear: y + 34 },
      { startAge: 35, endAge: 44, ganji: "정묘", startYear: y + 35, endYear: y + 44 },
      { startAge: 45, endAge: 54, ganji: "무진", startYear: y + 45, endYear: y + 54 },
    ],
  };
}

async function handleAnalyze(req, res) {
  try {
    const { name, birth, time, gender, calendarType } = req.body;

    if (!name || !birth || !time || !gender || !calendarType) {
      return res.status(400).json({
        result: "입력값이 부족합니다.",
      });
    }

    const [year, month, day] = birth.split("-");
    const [hour, minute] = time.split(":");

    const pillars = getSaju(year, month, day, hour, minute, calendarType);
    const daewoon = makeDaewoon(pillars.solarDate.slice(0, 4));

    const calendarLabel = calendarType === "lunar" ? "음력" : "양력";

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

이 사람의 사주를 "사주전쟁" 세계관 + 명리전 이론 기반으로 프리미엄 리포트 형태로 작성하라.

핵심 세계관:
- 사주 원국은 전쟁터다.
- 오행은 전장의 세력이다.
- 강한 오행은 이미 장악한 병력이다.
- 약한 오행은 지원이 필요한 전선이다.
- 지장간은 겉으로 드러나지 않은 숨겨진 아이템이다.
- 대운은 그 아이템을 켜는 스위치다.
- 세운은 아이템을 실제로 꺼내 쓰는 타이밍이다.
- 원국이 불리해도 지장간 아이템과 대운 스위치, 세운 타이밍이 맞으면 인생의 판이 바뀔 수 있다.
- 사람은 움직이고 도전할 때 자기 아이템을 현실에서 쓸 수 있다.
- 나쁜 사주는 있어도 쓸모없는 사주는 없다.

반드시 아래 구조로 작성하라.

1. 전장 배치, 원국 분석
- 이 사람이 어떤 전장에서 태어났는지 설명하라.
- 년주, 월주, 일주, 시주가 각각 어떤 전선인지 설명하라.
- 월지가 전장의 계절과 배경이라는 점을 설명하라.
- 강한 기운과 약한 기운을 구분하라.
- 단순히 좋다/나쁘다로 말하지 말고 구조적으로 설명하라.

2. 세력 분석, 오행 전쟁
- 목, 화, 토, 금, 수를 각각 병력처럼 설명하라.
- 어떤 세력이 전장을 장악하고 있는지 설명하라.
- 어떤 세력이 부족하거나 눌려 있는지 설명하라.
- 부족한 기운이 현실에서 어떤 결핍, 갈증, 반복 문제로 나타나는지 설명하라.
- 과한 기운이 현실에서 어떤 장점과 위험으로 나타나는지 설명하라.

3. 일간 캐릭터, 주인공 분석
- 일간을 이 사주의 주인공 캐릭터처럼 설명하라.
- 이 사람이 세상을 대하는 방식, 돈을 대하는 방식, 관계를 대하는 방식을 설명하라.
- 장점과 약점을 모두 말하되, 반드시 전략으로 연결하라.

4. 숨겨진 아이템, 지장간 분석
- 지장간이 왜 숨겨진 아이템인지 설명하라.
- 재성 아이템은 돈과 현실 자원으로, 관성 아이템은 직업과 자리로, 식상 아이템은 표현과 생산으로, 인성 아이템은 공부와 보호로 해석하라.
- 지장간 아이템은 평소에는 잠들어 있다가 대운과 세운에서 켜질 수 있음을 설명하라.

5. 대운 스위치
- 대운을 인생의 10년 단위 스위치로 설명하라.
- 현재 대운이 테스트 버전이라도, 주어진 대운 목록을 바탕으로 상징적 흐름을 설명하라.
- 어떤 시기에 어떤 아이템이 켜질 수 있는지 설명하라.

6. 세운 타이밍
- 세운은 실제 사건이 들어오는 타이밍이라고 설명하라.
- 돈, 직업, 관계, 이동, 도전의 타이밍을 상징적으로 설명하라.
- 단정적인 예언처럼 쓰지 말고, 가능성과 전략의 언어로 작성하라.

7. 현실 번역
- 이 사주 구조가 실제 삶에서 어떻게 나타나는지 설명하라.
- 직업, 돈, 인간관계, 가족, 자존감, 도전 방식으로 나누어 설명하라.

8. 전투 전략, 행동 가이드
- 지금 당장 해야 할 행동을 제시하라.
- 피해야 할 선택을 제시하라.
- 30일 전략, 90일 전략, 1년 전략으로 나누어 작성하라.

9. 프리미엄 결론
- 이 사람은 고정된 운명의 피해자가 아니라, 자기 아이템을 꺼내야 하는 플레이어라는 메시지로 마무리하라.

작성 규칙:
- 한국어로 작성하라.
- 최소 4000자 이상 작성하라.
- 절대 짧게 요약하지 말라.
- 각 항목마다 최소 3문단 이상 작성하라.
- 지나친 공포 마케팅은 금지한다.
- 근거 없는 확정 예언은 금지한다.
- 판매용 프리미엄 리포트처럼 길고 깊게 작성하라.
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
      max_tokens: 5000,
      temperature: 0.75,
    });

    res.json({
      result: completion.choices[0].message.content,
      pillars,
      daewoon,
      calendarType,
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
