import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { WordRoll, SlippyWords } from "performative-ui";

const wordroll = document.getElementById("pui-wordroll");
if (wordroll) {
  const words = wordroll.dataset.words.split("|");
  wordroll.textContent = "";
  createRoot(wordroll).render(h(WordRoll, { words, intervalMs: 2200 }));
}

const slippy = document.getElementById("pui-slippy");
if (slippy) {
  const tools = ["Python", "R", "JavaScript", "Flutter", "React", "Node.js", "Next.js", "TMB", "XGBoost", "VADER", "Azure AI Foundry"];
  const topics = ["Data Science", "Statistics", "Mixed-Effects Models", "Neural Networks", "Sentiment Analysis", "Mobile Apps", "Web Systems", "Trail Running", "Genralis AI", "Research Papers"];
  // Repeat each row so the sliding never exposes an empty edge.
  const fill = (words) => [...words, ...words].map((label, i) => ({ label, key: `${label}-${i}` }));
  createRoot(slippy).render(
    h(SlippyWords, {
      fade: true,
      intensity: 260,
      rows: [fill(tools), fill(topics)],
    })
  );
}
