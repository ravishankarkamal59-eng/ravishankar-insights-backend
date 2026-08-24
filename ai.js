const { GoogleGenAI } = require("@google/genai");

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("WARNING: GEMINI_API_KEY is not set.");
}

const ai = new GoogleGenAI({
  apiKey
});

// ======================================================
// MODEL CONFIG
// ======================================================

const PRIMARY_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.7-flash";

const FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash";

// ======================================================
// DETECT CURRENT / WEB QUESTIONS
// ======================================================

function needsWebSearch(message) {
  const text = String(message || "").toLowerCase();

  const keywords = [
    "latest",
    "today",
    "current",
    "now",
    "recent",
    "news",
    "breaking",
    "live",
    "update",
    "updates",
    "this week",
    "yesterday",
    "tomorrow",

    "अभी",
    "आज",
    "आज की",
    "ताजा",
    "ताज़ा",
    "लेटेस्ट",
    "वर्तमान",
    "हाल की",
    "हाल का",
    "न्यूज़",
    "न्यूज",
    "समाचार",
    "खबर",
    "ख़बर",
    "ब्रेकिंग",
    "अपडेट",
    "इस समय",
    "अभी क्या",
    "आज क्या"
  ];

  return keywords.some(keyword => text.includes(keyword));
}

// ======================================================
// DETECT EXAM / EDUCATION QUESTIONS
// ======================================================

function detectTopic(message) {
  const text = String(message || "").toLowerCase();

  if (
    /net|jrf|ugc|political science|राजनीति विज्ञान|net-jrf/.test(text)
  ) {
    return "NET-JRF / Political Science";
  }

  if (/upsc|ias|civil services/.test(text)) {
    return "UPSC";
  }

  if (/uppcs|pcs|uppsc/.test(text)) {
    return "UPPCS";
  }

  if (/ssc|mts|cgl|chsl|gd/.test(text)) {
    return "SSC";
  }

  if (/railway|rrb|ntpc|group d|रेलवे/.test(text)) {
    return "Railway";
  }

  if (/bank|banking|ibps|sbi|rrb clerk|rrb po/.test(text)) {
    return "Banking";
  }

  if (/ba|b\.a\.|graduation/.test(text)) {
    return "BA / Graduation";
  }

  if (/ma|m\.a\.|post graduation/.test(text)) {
    return "MA / Post Graduation";
  }

  if (/history|इतिहास/.test(text)) {
    return "History";
  }

  if (/geography|भूगोल/.test(text)) {
    return "Geography";
  }

  if (
    /polity|constitution|संविधान|राजव्यवस्था|political science|राजनीति विज्ञान/.test(
      text
    )
  ) {
    return "Political Science / Indian Polity";
  }

  if (/economics|अर्थशास्त्र|economy|अर्थव्यवस्था/.test(text)) {
    return "Economics";
  }

  if (/science|विज्ञान|physics|chemistry|biology/.test(text)) {
    return "Science";
  }

  if (/computer|कंप्यूटर|computer awareness/.test(text)) {
    return "Computer";
  }

  if (/gk|gs|general knowledge|general awareness|सामान्य ज्ञान/.test(text)) {
    return "GK / GS";
  }

  return "General Knowledge";
}

// ======================================================
// GOOGLE NEWS RSS SEARCH
// ======================================================

async function searchNews(query) {
  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=hi&gl=IN&ceid=IN:hi";

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      "News search failed: HTTP " + response.status
    );
  }

  const xml = await response.text();

  const matches =
    xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  const blockedSources = [
    "facebook.com",
    "youtube.com",
    "instagram.com",
    "twitter.com",
    "x.com"
  ];

  const preferredSources = [
    "Reuters",
    "The Hindu",
    "Indian Express",
    "NDTV",
    "Aaj Tak",
    "Hindustan Times",
    "Times of India",
    "India Today",
    "BBC",
    "ANI",
    "PTI",
    "Dainik Bhaskar",
    "Amar Ujala",
    "Navbharat Times",
    "Zee News",
    "Zee Business",
    "Economic Times",
    "Business Standard"
  ];

  function decodeHtml(value) {
    return String(value || "")
      .replace(/<!\[CDATA\[/g, "")
      .replace(/\]\]>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
  }

  const items = [];

  for (const item of matches.slice(0, 25)) {
    const title = decodeHtml(
      (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1]
    );

    const link = decodeHtml(
      (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1]
    );

    const pubDate = decodeHtml(
      (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]
    );

    const source = decodeHtml(
      (item.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1]
    );

    if (!title || !link) continue;

    const sourceLower = source.toLowerCase();

    if (
      blockedSources.some(blocked =>
        sourceLower.includes(blocked)
      )
    ) {
      continue;
    }

    const preferred = preferredSources.some(name =>
      sourceLower.includes(name.toLowerCase())
    );

    items.push({
      title,
      link,
      source: source || "News source",
      pubDate,
      preferred
    });
  }

  // Remove duplicate headlines.
  const seen = new Set();

  const unique = items.filter(item => {
    const key = item.title
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  // Preferred publishers first.
  unique.sort((a, b) => {
    if (a.preferred && !b.preferred) return -1;
    if (!a.preferred && b.preferred) return 1;
    return 0;
  });

  return unique.slice(0, 10);
}

// ======================================================
// GEMINI GENERATION WITH FALLBACK
// ======================================================

async function generateAI(contents, config = {}) {
  try {
    return await ai.models.generateContent({
      model: PRIMARY_MODEL,
      contents,
      config
    });
  } catch (primaryError) {
    console.error(
      "Primary Gemini model failed:",
      primaryError.message
    );

    if (
      FALLBACK_MODEL &&
      FALLBACK_MODEL !== PRIMARY_MODEL
    ) {
      console.log(
        "Trying fallback Gemini model:",
        FALLBACK_MODEL
      );

      return await ai.models.generateContent({
        model: FALLBACK_MODEL,
        contents,
        config
      });
    }

    throw primaryError;
  }
}

// ======================================================
// SYSTEM INSTRUCTION
// ======================================================

const systemInstruction = `
You are Ravishankar AI, the AI assistant of
The Ravishankar Insights.

You are created for The Ravishankar Insights website.
You may use AI models and APIs provided by third-party technology providers,
but you are NOT Google's official AI assistant and must NOT claim that
Google created or officially operates Ravishankar AI.

Your job is to be a helpful, accurate and educational AI assistant.

You can answer questions about:

GENERAL KNOWLEDGE:
- General knowledge
- General studies
- Current affairs when current search results are supplied
- India
- World
- Government
- Society
- Culture

EDUCATION:
- BA
- MA
- NET-JRF
- UGC NET
- UPSC
- UPPCS
- SSC
- Railway
- Banking
- Competitive examinations

ACADEMIC SUBJECTS:
- Political Science
- Indian Constitution
- Indian Polity
- History
- Geography
- Economics
- Sociology
- Philosophy
- Science
- Computer
- Environment
- International Relations

QUESTION TYPES:
- Normal questions
- Definitions
- Explanations
- Comparisons
- Short notes
- Long answers
- Exam answers
- MCQs
- Practice questions
- Revision notes
- Summaries
- Step-by-step explanations

LANGUAGE:
- Hindi question -> Hindi answer
- Hinglish question -> Hinglish answer
- English question -> English answer

STYLE:
- Be clear.
- Be useful.
- Use headings when helpful.
- Use bullet points when helpful.
- For exam questions, give structured exam-ready answers.
- Explain difficult concepts simply.
- Do not unnecessarily make answers extremely long.
- If the user asks for detail, provide detail.
- If the user asks for a short answer, keep it short.

ACCURACY:
- Never knowingly invent facts.
- Never invent sources.
- Never invent URLs.
- If you are uncertain about a fact, clearly say that you are uncertain.
- For current information, rely on the supplied current search results.
- Do not present old information as today's information.

IMPORTANT:
You are not limited to one subject.
Try to understand the user's actual question and answer it directly.
`;

// ======================================================
// MAIN RAVISHANKAR AI
// ======================================================

async function askRavishankarAI(message) {
  if (!message || !String(message).trim()) {
    throw new Error("Message is required.");
  }

  const userMessage = String(message).trim();
  const topic = detectTopic(userMessage);
  const useSearch = needsWebSearch(userMessage);

  // ====================================================
  // CURRENT / NEWS QUESTION
  // ====================================================

  if (useSearch) {
    let newsResults = [];

    try {
      newsResults = await searchNews(userMessage);
    } catch (error) {
      console.error(
        "Google News RSS error:",
        error.message
      );
    }

    // If search gives results, ground the answer in them.
    if (newsResults.length) {
      const newsContext = newsResults
        .map(
          (item, index) =>
            `${index + 1}. ${item.title}
Publisher: ${item.source}
Published: ${item.pubDate}
URL: ${item.link}`
        )
        .join("\n\n");

      const prompt = `
User question:
${userMessage}

Detected topic:
${topic}

Current Google News search results:

${newsContext}

Answer the user's question using the supplied current search results.

STRICT RULES:
1. Answer in the user's language.
2. Do not invent facts.
3. Do not invent sources.
4. Do not invent URLs.
5. Treat the supplied results as current-search evidence, not as guaranteed truth.
6. If the results do not adequately answer the question, clearly say that the available results are insufficient.
7. Do not turn unrelated old articles into "today's news".
8. If dates are available, mention them when useful.
9. Give a concise but useful summary.
10. Do not copy entire news articles.
`;

      const response = await generateAI(
        prompt,
        {
          systemInstruction
        }
      );

      let answer = response.text || "";

      // Add sources separately so the model cannot invent them.
      answer += "\n\n### Sources\n";

      newsResults
        .slice(0, 5)
        .forEach((item, index) => {
          answer +=
            `${index + 1}. ${item.source} — ${item.title}\n` +
            `${item.link}\n`;
        });

      return answer;
    }

    // Search failed/no results: still answer, but disclose limitation.
    const fallbackPrompt = `
User question:
${userMessage}

The current-news search did not return usable results.

Answer the user as helpfully as possible using your general knowledge,
but clearly state that current search results were unavailable.
Do not claim that general knowledge is today's verified news.
`;

    const response = await generateAI(
      fallbackPrompt,
      {
        systemInstruction
      }
    );

    return response.text || "";
  }

  // ====================================================
  // NORMAL QUESTION
  // ====================================================

  const prompt = `
User question:
${userMessage}

Relevant subject/topic:
${topic}

Answer this question directly.

If this is an academic or competitive-exam question:
- explain the concept clearly;
- use suitable headings;
- include important points;
- give examples where useful;
- make it exam-friendly.

If the user asks for MCQs:
- provide questions with options;
- provide the correct answer;
- provide a brief explanation when useful.

If the user asks for comparison:
- clearly explain similarities and differences.

If the question is simple:
- do not overcomplicate the answer.
`;

  const response = await generateAI(
    prompt,
    {
      systemInstruction
    }
  );

  return response.text || "";
}

// ======================================================
// EXPORT
// ======================================================

module.exports = {
  askRavishankarAI
};
