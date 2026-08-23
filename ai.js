const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// ===============================
// Detect current/web questions
// ===============================
function needsWebSearch(message) {
  const text = message.toLowerCase();

  const keywords = [
    "latest",
    "today",
    "current",
    "now",
    "recent",
    "news",
    "breaking",
    "अभी",
    "आज",
    "ताजा",
    "ताज़ा",
    "लेटेस्ट",
    "वर्तमान",
    "हाल की",
    "न्यूज़",
    "समाचार"
  ];

  return keywords.some(keyword => text.includes(keyword));
}

// ===============================
// FREE GOOGLE NEWS RSS SEARCH
// ===============================
async function searchNews(query) {
  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=hi&gl=IN&ceid=IN:hi";

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("News search failed: HTTP " + response.status);
  }

  const xml = await response.text();
  const items = [];

  const matches = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  // Prefer established news publishers and avoid social-media results.
  const blockedSources = [
    "facebook.com",
    "youtube.com",
    "instagram.com",
    "x.com",
    "twitter.com"
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
    "Business Standard",
    "The Times of India"
  ];

  function clean(value) {
    return String(value || "")
      .replace(/<!\[CDATA\[/g, "")
      .replace(/\]\]>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  for (const item of matches.slice(0, 20)) {
    const title = clean(
      (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1]
    );

    const link = clean(
      (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1]
    );

    const pubDate = clean(
      (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]
    );

    const source = clean(
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

    items.push({
      title,
      link,
      source: source || "News source",
      pubDate,
      preferred: preferredSources.some(name =>
        sourceLower.includes(name.toLowerCase())
      )
    });
  }

  // Remove duplicate headlines.
  const seen = new Set();

  const unique = items.filter(item => {
    const key = item.title.toLowerCase().replace(/\s+/g, " ").trim();

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });

  // Put established publishers first.
  unique.sort((a, b) => {
    if (a.preferred && !b.preferred) return -1;
    if (!a.preferred && b.preferred) return 1;
    return 0;
  });

  return unique.slice(0, 8);
}

// ===============================
// MAIN RAVISHANKAR AI
// ===============================
async function askRavishankarAI(message) {
  if (!message || !message.trim()) {
    throw new Error("Message is required.");
  }

  const useSearch = needsWebSearch(message);

  const systemInstruction = `
You are Ravishankar AI, the official AI assistant of
The Ravishankar Insights.

Help users with:
- General information
- Education and exams
- History
- Geography
- Political Science
- Science
- Technology
- Jobs and careers
- Notes, summaries and MCQs

You can communicate in Hindi, Hinglish and English.

If the user asks in Hindi, answer in Hindi.
If the user asks in Hinglish, answer in Hinglish.
If the user asks in English, answer in English.

Give accurate, useful and clear answers.
Do not invent facts.
Do not invent sources or URLs.

When current web information is provided to you,
use that information carefully and clearly mention
that the information comes from the supplied search results.
`;

  // ===============================
  // CURRENT / NEWS QUESTION
  // ===============================
  if (useSearch) {
    const newsResults = await searchNews(message);

    if (!newsResults.length) {
      throw new Error("No current news results were found.");
    }

    const newsContext = newsResults
      .map((item, index) =>
        `${index + 1}. ${item.title}
Source: ${item.source}
Date: ${item.pubDate}
URL: ${item.link}`
      )
      .join("\n\n");

    const prompt = `
User question:
${message}

Here are current news search results:

${newsContext}

Answer the user's question using these results.

Rules:
1. Answer in the user's language.
2. Do not invent facts.
3. Do not invent sources.
4. If the results are insufficient, say so.
5. Keep the answer clear and useful.
6. Do not create fake URLs.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        systemInstruction
      }
    });

    let answer = response.text || "";

    // Add verified search-result sources programmatically
    answer += "\n\n### Sources\n";

    newsResults.slice(0, 5).forEach((item, index) => {
      answer += `${index + 1}. ${item.source || "News source"} — ${item.title}\n${item.link}\n`;
    });

    return answer;
  }

  // ===============================
  // NORMAL AI QUESTION
  // ===============================
  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: message,
    config: {
      systemInstruction
    }
  });

  return response.text;
}

module.exports = {
  askRavishankarAI
};
