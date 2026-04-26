const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const OpenAI = require("openai");
const { Solar } = require("lunar-javascript");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function getSaju(year, month, day, hour, minute) {
  const solar = Solar.fromYmdHms(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute || 0),
    0
  );

  const lunar = solar.getLunar();
  const eightChar = lunar.getEightChar();

  return {
    year: eightChar.getYear(),
    month: eightChar.getMonth(),
    day: eightChar.getDay(),
    hour: eightChar.getTime(),
  };
}

function makeDaewoon(year) {
  const y = Number(year);

  return {
    startInfo: "대운은 현재 테스트 버전입니다. 추후 성별·음양·절기 기준으로 정밀 계산 예정입니다.",
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
    const { name, birth, time, gender } = req.body;

    if (!name || !birth || !time || !gender) {
      return res.status(400).json({
        result: "입력값이 부족합니다.",
      });
    }

    const [year, month, day] = birth.split("-");
    const [hour, minute] = time.split(":");

    const pillars = getSaju(year, month, day, hour, minute);
    const daewoon = makeDaewoon(year);

    const prompt = `
이름: ${name}
성별: ${gender}
출생 정보: ${year}년 ${month}월 ${day}일 ${hour}시 ${minute}분

사주팔자:
년주: ${pillars.year}
월주: ${pillars.month}
일주: ${pillars.day}
시주: ${pillars.hour}

위 정보를 바탕으로 "사주전쟁" 컨셉의 프리미엄 리포트를 작성해줘.

반드시 아래 구조로 작성해줘.

1. 전장 배치
- 이 사람의 원국이 어떤 전쟁터인지 설명

2. 병력 구성
- 오행을 병력처럼 설명
- 강한 기운과 약한 기운 구분

3. 일간 캐릭터
- 일간을 주인공 캐릭터처럼 설명

4. 아이템 해금 시기
- 인생에서 기회가 열리는 시기를 상징적으로 설명
- 돈, 직업, 관계, 이동운 중심

5. 위험 구간
- 조심해야 할 선택, 관계, 감정 패턴

6. 전투 전략
- 지금부터 어떻게 움직이면 좋은지 현실적인 조언

7. 프리미엄 한 줄 결론
- 강렬한 문장으로 마무리

문체:
- 한국어
- 고급스럽고 몰입감 있게
- 게임처럼 너무 가볍지는 않게
- 명리 상담의 깊이를 유지
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "너는 명리학 기반으로 사주를 전쟁터, 병력, 아이템, 타이밍의 세계관으로 해석하는 프리미엄 사주 상담가다.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    res.json({
      result: completion.choices[0].message.content,
      pillars,
      daewoon,
    });
  } catch (error) {
    console.error("분석 오류:", error);
    res.status(500).json({
      result: "서버 오류가 발생했습니다. Render Logs를 확인해주세요.",
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
