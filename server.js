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


// ================= 사주 =================
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
    solarDate: `${solar.getYear()}-${String(solar.getMonth()).padStart(2,"0")}-${String(solar.getDay()).padStart(2,"0")}`,
    eightChar,
  };
}


// ================= 대운 =================
function makeDaewoon(eightChar, gender) {
  try {
    const genderCode = gender === "남자" ? 1 : 0;
    const yun = eightChar.getYun(genderCode);
    const list = yun.getDaYun().slice(1, 9).map(d => ({
      startAge: d.getStartAge(),
      endAge: d.getStartAge() + 9,
      ganji: d.getGanZhi(),
      startYear: d.getStartYear(),
      endYear: d.getStartYear() + 9,
    }));

    return {
      startInfo: `대운 시작: ${yun.getStartYear()}년 ${yun.getStartMonth()}개월`,
      list,
    };
  } catch (e) {
    console.error(e);
    return { startInfo: "대운 오류", list: [] };
  }
}


// ================= 세운 =================
function makeSewoon(startYear = new Date().getFullYear()) {
  const stems = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
  const branches = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];

  const list = [];

  for (let i = 0; i < 10; i++) {
    const year = startYear + i;
    list.push({
      year,
      ganji: stems[(year - 4) % 10] + branches[(year - 4) % 12],
    });
  }

  return { list };
}


// ================= 분석 =================
app.post("/analyze", async (req, res) => {
  try {
    const { name, birth, time, gender, calendarType } = req.body;

    const [y, m, d] = birth.split("-");
    const [h, min] = time.split(":");

    const raw = getSaju(y, m, d, h, min, calendarType);
    const daewoon = makeDaewoon(raw.eightChar, gender);
    const sewoon = makeSewoon();

    const ai = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "사주를 전쟁 전략처럼 해석하는 전문가",
        },
        {
          role: "user",
          content: `
이름:${name}
년주:${raw.year}
월주:${raw.month}
일주:${raw.day}
시주:${raw.hour}
대운:${JSON.stringify(daewoon)}
세운:${JSON.stringify(sewoon)}
프리미엄 리포트 작성
`,
        },
      ],
      max_tokens: 3000,
    });

    res.json({
      result: ai.choices[0].message.content,
      pillars: raw,
      daewoon,
      sewoon,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "분석 오류" });
  }
});


// ================= 결제 검증 =================
app.post("/verify-payment", async (req, res) => {
  try {
    const { paymentKey, orderId, amount } = req.body;

    const response = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(process.env.TOSS_SECRET_KEY + ":").toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });

    const data = await response.json();
    console.log("결제검증:", data);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
});


app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log("서버 실행:", PORT);
});
