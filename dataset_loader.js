const fs = require("fs");
const path = require("path");

const DATASET_ORDER = [
  "master_rules",
  "decision_priority",
  "golden_dataset",
  "brain_dataset",
  "consultation_strategy",
  "action_strategy",
  "language_style",
  "evidence_dataset",
  "review_dataset",
];

function readText(filePath) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return "";
  return fs.readFileSync(filePath, "utf8").trim();
}

function readJsonl(filePath) {
  return readText(filePath)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
}

function listFilesRecursive(rootPath, matcher = () => true) {
  if (!rootPath || !fs.existsSync(rootPath)) return [];
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) return listFilesRecursive(entryPath, matcher);
    return entry.isFile() && matcher(entryPath) ? [entryPath] : [];
  });
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function scoreText(text, queryTokens) {
  const tokens = new Set(tokenize(text));
  let score = 0;
  queryTokens.forEach((token) => {
    if (tokens.has(token)) score += 1;
  });
  return score;
}

function selectRelevantItems(items, queryText, limit) {
  const queryTokens = new Set(tokenize(queryText));
  return items
    .map((item) => {
      const text = typeof item === "string" ? item : JSON.stringify(item);
      return { item, text, score: scoreText(text, queryTokens) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function trimBlock(text, maxChars) {
  const value = String(text || "").trim();
  return value.length > maxChars ? `${value.slice(0, maxChars)}\n...[trimmed]` : value;
}

function readGoldenCases(goldenDatasetPath) {
  return listFilesRecursive(goldenDatasetPath, (filePath) =>
    /(?:golden_\d+\.md|case_\d+\.ya?ml)$/i.test(path.basename(filePath))
  )
    .sort((a, b) => a.localeCompare(b))
    .map((filePath) => ({
      file: path.relative(goldenDatasetPath, filePath).replace(/\\/g, "/"),
      content: readText(filePath),
    }))
    .filter((item) => item.content);
}

function extractYamlBlock(content, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(
    new RegExp(
      `(?:^|\\n)(\\s*)${escapedKey}:([\\s\\S]*?)(?=\\n\\1[a-zA-Z_]+:|\\n[^\\s][a-zA-Z_]+:|$)`
    )
  );
  return match ? match[2].trim() : "";
}

function loadExistingDatasetPaths(rootDir, overrides = {}) {
  return {
    master_rules: overrides.masterRulesPath || path.join(rootDir, "master_rules"),
    decision_priority: overrides.decisionPriorityPath || path.join(rootDir, "decision_priority"),
    golden_dataset: overrides.goldenDatasetPath || path.join(rootDir, "golden_dataset"),
    review_dataset: overrides.reviewDatasetPath || path.join(rootDir, "review_dataset.jsonl"),
  };
}

function buildAiBrainContext(rootDir, overrides, customerContext) {
  const datasetPaths = loadExistingDatasetPaths(rootDir, overrides);
  const queryText = [
    customerContext.name,
    customerContext.genderLabel,
    customerContext.calendarLabel,
    customerContext.pillars?.year,
    customerContext.pillars?.month,
    customerContext.pillars?.day,
    customerContext.pillars?.hour,
    customerContext.hiddenSummary,
    customerContext.daewoon?.startInfo,
    customerContext.sewoon?.startInfo,
    customerContext.sewoon?.list?.map((item) => `${item.ganji} ${item.theme}`).join(" "),
  ]
    .filter(Boolean)
    .join(" ");

  const masterRuleItems = readJsonl(path.join(datasetPaths.master_rules, "all_rules.jsonl"));
  const decisionPriorityItems = readJsonl(path.join(datasetPaths.decision_priority, "all_priorities.jsonl"));
  const goldenCases = readGoldenCases(datasetPaths.golden_dataset);
  const reviewItems = readJsonl(datasetPaths.review_dataset).filter((item) => item.approved === true);

  const selectedMasterRules = selectRelevantItems(masterRuleItems, queryText, 12);
  const selectedDecisionPriorities = selectRelevantItems(decisionPriorityItems, queryText, 8);
  const selectedGolden = selectRelevantItems(goldenCases, queryText, 1)[0] || null;
  const selectedReviews = reviewItems.slice(-20);

  const goldenContent = selectedGolden?.item?.content || "";
  const brainDataset = extractYamlBlock(goldenContent, "brain");
  const consultationStrategy =
    extractYamlBlock(brainDataset, "consultation_strategy") ||
    extractYamlBlock(goldenContent, "consultation") ||
    "";
  const actionStrategy = extractYamlBlock(brainDataset, "action_guide");
  const evidenceDataset = extractYamlBlock(brainDataset, "evidence");
  const languageStyle =
    extractYamlBlock(goldenContent, "golden_answer") ||
    readText(path.join(datasetPaths.golden_dataset, "brain_prompt_order.md"));

  const sections = {
    master_rules: selectedMasterRules.map((entry) => entry.item),
    decision_priority: selectedDecisionPriorities.map((entry) => entry.item),
    golden_dataset: selectedGolden
      ? {
          file: selectedGolden.item.file,
          score: selectedGolden.score,
          content: trimBlock(selectedGolden.item.content, 6000),
        }
      : null,
    brain_dataset: trimBlock(brainDataset, 5000),
    consultation_strategy: trimBlock(consultationStrategy, 2500),
    action_strategy: trimBlock(actionStrategy, 2500),
    language_style: trimBlock(languageStyle, 2500),
    evidence_dataset: trimBlock(evidenceDataset, 2500),
    review_dataset: selectedReviews,
  };

  const usedDatasets = DATASET_ORDER.map((name) => ({
    name,
    used: Array.isArray(sections[name])
      ? sections[name].length > 0
      : Boolean(sections[name] && String(JSON.stringify(sections[name])).trim()),
    source:
      name === "brain_dataset" ||
      name === "consultation_strategy" ||
      name === "action_strategy" ||
      name === "language_style" ||
      name === "evidence_dataset"
        ? "golden_dataset/cases/*.yaml"
        : datasetPaths[name] || datasetPaths.golden_dataset,
  }));

  const prompt = [
    "[AI Brain Dataset Context]",
    "Use the following datasets in this exact order. Do not copy private case details from examples.",
    "",
    "1. Master Rule",
    JSON.stringify(sections.master_rules, null, 2),
    "",
    "2. Decision Priority",
    JSON.stringify(sections.decision_priority, null, 2),
    "",
    "3. Golden Brain Case",
    sections.golden_dataset ? JSON.stringify(sections.golden_dataset, null, 2) : "No golden case selected.",
    "",
    "4. Consultation Strategy",
    sections.consultation_strategy || "No consultation_strategy field found in selected golden case.",
    "",
    "5. Action Strategy",
    sections.action_strategy || "No action_guide field found in selected golden case.",
    "",
    "6. Language Style",
    sections.language_style || "No language style reference found.",
    "",
    "7. Evidence",
    sections.evidence_dataset || "No evidence field found in selected golden case.",
    "",
    "8. Review Dataset",
    JSON.stringify(sections.review_dataset, null, 2),
    "",
    "9. Customer Information",
    "",
    "[Counseling Output Contract]",
    "Write like a counselor speaking to the customer, not like an encyclopedia explaining a chart.",
    "Every chapter must follow this paragraph order: why this is so -> how it appears in real life -> what the customer should do next.",
    "Use real-life examples before technical Chinese-character explanations. Keep hanja explanations short and only when needed.",
    "Reduce repeated formal endings such as '입니다'. Mix natural Korean counseling endings like '~해요', '~합니다', '~보면 좋습니다', and direct advice.",
    "Use the metaphors '전장', '군단', '스위치', and '아이템' only 2-3 times total in one report.",
    "Include at least three high-recognition sentences that make the customer feel '맞아.'",
    "End every chapter with one short counselor-style advice line.",
    "The final sentence must end with a practical action instruction, not a vague hopeful closing.",
  ].join("\n");

  return {
    dataset_order: DATASET_ORDER,
    dataset_paths: datasetPaths,
    used_datasets: usedDatasets,
    sections,
    prompt,
  };
}

module.exports = {
  DATASET_ORDER,
  buildAiBrainContext,
};
