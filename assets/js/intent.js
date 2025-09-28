import { INTENT_KEYWORDS } from "./utils.js";

export function parseIntent(text) {
  const lower = text.toLowerCase();
  const intents = new Set();
  Object.entries(INTENT_KEYWORDS).forEach(([intent, keywords]) => {
    if (keywords.some((keyword) => lower.includes(keyword))) {
      intents.add(intent);
    }
  });
  if (!intents.size && text.trim()) {
    intents.add("explore");
  }
  return Array.from(intents);
}

export function intentToCards(intents) {
  const base = new Set();
  intents.forEach((intent) => {
    switch (intent) {
      case "spike":
        base.add("inflow");
        base.add("driver");
        base.add("trend");
        break;
      case "compare":
        base.add("compare");
        base.add("trend");
        break;
      case "csat":
        base.add("csat");
        base.add("driver");
        break;
      case "audit":
        base.add("audit");
        base.add("driver");
        break;
      case "sla":
        base.add("sla");
        base.add("trend");
        break;
      case "backlog":
        base.add("backlog");
        base.add("aging");
        break;
      case "agent":
        base.add("agent");
        base.add("outliers");
        break;
      case "escalation":
        base.add("escalation");
        base.add("trend");
        break;
      default:
        base.add("overview");
    }
  });
  if (!base.size) base.add("overview");
  return Array.from(base);
}

export function followUpSuggestions(intents) {
  const suggestions = [];
  if (intents.includes("sla")) suggestions.push("Drill into SLA drivers");
  if (intents.includes("csat")) suggestions.push("Export CSAT breakdown");
  if (intents.includes("spike")) suggestions.push("Segment by queue");
  if (intents.includes("audit")) suggestions.push("Show policy misses");
  if (intents.includes("agent")) suggestions.push("Highlight top outliers");
  return suggestions;
}
