import type { Layout } from "./types";

/* ------------------------------------------------------------------ */
/*  School template registry (PH students & teachers)                   */
/*                                                                      */
/*  Templates are DEFAULTS, not straitjackets: a keyword match seeds    */
/*  the outline skeleton (section flow + layouts + target length). The  */
/*  user can still change everything — clarify answers, follow-up chat  */
/*  ("make section 2 a timeline"), or the Outline tab layout switch.    */
/*  The planner is only ever padded toward the skeleton, never trimmed. */
/* ------------------------------------------------------------------ */

export type TemplateSection = {
  title: string;
  layout: Layout;
  points: string[];
};

export type DocTemplate = {
  id: string;
  label: string;
  /** Lowercase keyword phrases; multi-word hits score higher. */
  keywords: string[];
  docType: string;
  /** Sensible default pages when the user states no length. */
  targetLength: number;
  /** Content flow (cover/closing handled by normalization — omit them). */
  sections: TemplateSection[];
};

const T = (title: string, layout: Layout, points: string[]): TemplateSection => ({ title, layout, points });

export const TEMPLATES: DocTemplate[] = [
  {
    id: "essay",
    label: "Essay",
    keywords: ["essay", "explainer", "explain", "article", "composition", "sanaysay"],
    docType: "essay",
    targetLength: 3,
    sections: [
      T("Introduction & Thesis", "paragraph", ["Hook and context", "Clear thesis statement", "Roadmap of arguments"]),
      T("First Argument", "paragraph", ["Topic sentence", "Evidence and example", "Link back to thesis"]),
      T("Second Argument", "paragraph", ["Topic sentence", "Evidence and example", "Counterpoint addressed"]),
      T("Further Analysis", "bullets", ["Key insight", "Supporting detail", "Implication"]),
      T("Conclusion", "closing", ["Restated thesis", "Synthesis of arguments", "Final thought"]),
    ],
  },
  {
    id: "reaction-paper",
    label: "Reaction Paper",
    keywords: ["reaction paper", "reaction", "reflection paper", "refleksyon", "personal response"],
    docType: "reaction paper",
    targetLength: 2,
    sections: [
      T("Summary of the Work", "paragraph", ["Main points of the source", "Author's key arguments", "Context"]),
      T("Personal Reaction", "paragraph", ["Agreement or disagreement", "Personal experience connection", "Emotional/intellectual response"]),
      T("Critical Evaluation", "bullets", ["Strengths of the work", "Weaknesses or gaps", "Questions raised"]),
      T("Conclusion", "closing", ["Overall judgment", "Recommendation", "Closing insight"]),
    ],
  },
  {
    id: "book-report",
    label: "Book Report",
    keywords: ["book report", "novel report", "book review", "story report"],
    docType: "book report",
    targetLength: 3,
    sections: [
      T("Overview", "paragraph", ["Title, author, genre", "Setting and context", "One-line premise"]),
      T("Key Characters", "groups", ["Protagonist and traits", "Supporting characters", "Character growth"]),
      T("Plot Journey", "timeline", ["Exposition", "Rising action and climax", "Resolution"]),
      T("Themes & Lessons", "two-column", ["Theme one with example", "Theme two with example"]),
      T("Personal Recommendation", "closing", ["Overall rating", "Who should read it", "Final thought"]),
    ],
  },
  {
    id: "lab-report",
    label: "Lab / Investigatory Report",
    keywords: ["lab report", "laboratory report", "experiment report", "investigatory", "science project", "investigative project"],
    docType: "lab report",
    targetLength: 3,
    sections: [
      T("Aim & Hypothesis", "paragraph", ["Objective of the experiment", "Hypothesis", "Variables identified"]),
      T("Methodology", "timeline", ["Materials used", "Step-by-step procedure", "Controls and safety"]),
      T("Results", "table", ["Observations per trial", "Measurements", "Patterns noticed"]),
      T("Discussion & Analysis", "paragraph", ["Whether hypothesis held", "Sources of error", "Real-world meaning"]),
      T("Conclusion", "closing", ["Summary of findings", "Recommendation", "Further testing"]),
    ],
  },
  {
    id: "lesson-plan",
    label: "Lesson Plan (4As)",
    keywords: ["lesson plan", "lesson", "4as", "daily lesson", "dll", "lesson log", "teaching guide"],
    docType: "lesson plan",
    targetLength: 2,
    sections: [
      T("Learning Objectives", "bullets", ["Knowledge goal", "Skills goal", "Values goal"]),
      T("Materials & Preparation", "bullets", ["Board and markers", "Handouts or slides", "Setup needed"]),
      T("Procedure (4As)", "timeline", ["Activity — hook and recall", "Analysis — guided questions", "Abstraction — key concept", "Application — practice task"]),
      T("Assessment", "quiz", ["Mixed quick-check questions with answer key"]),
      T("Assignment & Wrap-up", "closing", ["Homework or extension", "Summary of the day"]),
    ],
  },
  {
    id: "research-paper",
    label: "Research Paper",
    keywords: ["research paper", "research", "thesis", "term paper", "concept paper", "review of related literature"],
    docType: "research paper",
    targetLength: 6,
    sections: [
      T("Abstract", "paragraph", ["Problem and purpose", "Method in one line", "Key finding"]),
      T("Introduction & Background", "paragraph", ["Context and problem statement", "Objectives", "Scope and limits"]),
      T("Methodology", "paragraph", ["Design and respondents", "Instruments", "Procedure"]),
      T("Findings", "groups", ["Result one with evidence", "Result two with evidence", "Result three with evidence"]),
      T("Analysis & Discussion", "paragraph", ["Interpretation", "Comparison with literature", "Implications"]),
      T("Conclusion & Recommendations", "closing", ["Summary of conclusions", "Recommendations", "Future work"]),
    ],
  },
  {
    id: "invoice",
    label: "Invoice / Receipt",
    keywords: ["invoice", "receipt", "billing statement", "payment terms", "line items", "bill to"],
    docType: "invoice",
    targetLength: 1,
    sections: [
      T("Invoice Header", "cover", ["Invoice number and date", "Seller name and contact", "Bill-to client and due date"]),
      T("Line Items", "table", ["Item description per row", "Quantity and rate columns", "One row per item"]),
      T("Totals", "stats", ["Subtotal", "Tax", "Total due"]),
      T("Payment Terms", "bullets", ["Accepted payment methods", "Due date", "Late fee or notes"]),
    ],
  },
  {
    id: "quiz",
    label: "Quiz / Worksheet",
    keywords: ["quiz", "worksheet", "exam", "test", "assessment", "mcq", "true or false", "identification", "long quiz", "short quiz"],
    docType: "quiz",
    targetLength: 1,
    sections: [
      T("Questions", "quiz", ["Mix of multiple choice, true/false and identification per user choice", "Clear numbering", "Space for answers"]),
      T("Answer Key", "bullets", ["Correct answer per number", "Brief basis where helpful"]),
    ],
  },
  {
    id: "summary-handout",
    label: "Summary / Reviewer Handout",
    keywords: ["summary", "summarize", "handout", "key concepts", "reviewer", "study notes", "recap"],
    docType: "summary",
    targetLength: 2,
    sections: [
      T("Overview", "paragraph", ["Topic in one paragraph", "Why it matters"]),
      T("Key Concepts", "bullets", ["Must-remember point", "Must-remember point", "Common misconception"]),
      T("Details That Matter", "two-column", ["Definition paired with example", "Cause paired with effect"]),
      T("Quick Review", "timeline", ["First idea to recall", "Second idea to recall", "How they connect"]),
      T("Next Steps", "bullets", ["What to study next", "Practice tip"]),
    ],
  },
  {
    id: "activity-sheet",
    label: "Classroom / Group Activity",
    keywords: ["classroom activity", "group activity", "activity sheet", "performance task", "group task", "task sheet", "gawain", "pangkatang gawain"],
    docType: "activity",
    targetLength: 1,
    sections: [
      T("Task Overview", "paragraph", ["What to do", "Grouping and time limit", "Expected output"]),
      T("Tasks", "timeline", ["Step-by-step tasks", "What to write per step", "How to present"]),
      T("Guide Questions", "bullets", ["Question to answer", "What good answers include"]),
      T("Scoring Guide", "table", ["Criteria per row", "Points per level", "What earns full marks"]),
    ],
  },
  {
    id: "position-paper",
    label: "Position Paper",
    keywords: ["position paper", "argumentative essay", "take a stand", "posisyong papel", "stand on the issue"],
    docType: "position paper",
    targetLength: 3,
    sections: [
      T("Background of the Issue", "paragraph", ["What the issue is", "Why it matters now"]),
      T("Stand on the Issue", "paragraph", ["Clear thesis", "Relevance and significance"]),
      T("Supporting Arguments", "bullets", ["Argument with evidence", "Argument with evidence", "Strongest point"]),
      T("Counterarguments & Rebuttal", "comparison", ["Objection and why it falls short", "Rebuttal with evidence"]),
      T("Conclusion", "closing", ["Restated stand", "Final thought"]),
    ],
  },
  {
    id: "case-study",
    label: "Case Study",
    keywords: ["case study", "case analysis", "business case", "company case"],
    docType: "case study",
    targetLength: 4,
    sections: [
      T("Background", "paragraph", ["Situation and context", "Why it matters"]),
      T("Key Problems & Findings", "groups", ["Problem with evidence", "Problem with evidence"]),
      T("Analysis with Theory", "paragraph", ["Concepts that explain the case", "Interpretation"]),
      T("Alternative Solutions", "comparison", ["Option with pros and cons", "Option with pros and cons"]),
      T("Recommendation", "closing", ["Chosen solution", "Why it wins", "Next step"]),
    ],
  },
  {
    id: "technical-report",
    label: "Technical / Business Report",
    keywords: ["technical report", "business report", "progress report", "narrative report", "accomplishment report", "incident report", "field report", "practicum report", "ojt report", "ulat"],
    docType: "technical report",
    targetLength: 4,
    sections: [
      T("Introduction", "paragraph", ["Purpose and scope", "Background"]),
      T("Methods & Data Gathered", "bullets", ["How data was gathered", "Sources used"]),
      T("Findings", "table", ["Findings per row", "Figures or observations", "Patterns noticed"]),
      T("Discussion", "paragraph", ["What the findings mean", "Comparison and implications"]),
      T("Conclusions & Recommendations", "closing", ["Summary of conclusions", "Recommended actions"]),
    ],
  },
  {
    id: "reflection-gibbs",
    label: "Reflection (Gibbs)",
    keywords: ["reflective essay", "reflective journal", "learning journal", "reflection journal", "gibbs", "repleksyon", "pagninilay", "what so what now what", "reflection"],
    docType: "reflection",
    targetLength: 2,
    sections: [
      T("What Happened", "paragraph", ["Description of the experience", "Context and people involved"]),
      T("Feelings & Evaluation", "paragraph", ["How it felt at the time", "What went well or poorly"]),
      T("Analysis with Theory", "paragraph", ["Why it happened", "Concepts that explain it"]),
      T("Lessons & Action Plan", "timeline", ["What was learned", "What to do differently", "Next steps"]),
    ],
  },
  {
    id: "narrative-essay",
    label: "Narrative / Descriptive",
    keywords: ["narrative essay", "descriptive essay", "short story", "maikling kwento", "anekdota", "pabula", "alamat", "personal narrative", "descriptive", "narrative"],
    docType: "narrative essay",
    targetLength: 2,
    sections: [
      T("Setting & Characters", "paragraph", ["Where and when", "Who is involved"]),
      T("Events", "timeline", ["Opening event", "Turning point", "Resolution"]),
      T("Ending & Reflection", "closing", ["How it ended", "What it means"]),
    ],
  },
  {
    id: "speech-talumpati",
    label: "Speech / News / Poem",
    keywords: ["speech", "talumpati", "declamation", "oration", "balita", "news article", "news report", "tula", "poem", "bugtong"],
    docType: "speech",
    targetLength: 1,
    sections: [
      T("Opening", "paragraph", ["Hook and greeting", "Topic in one line"]),
      T("Message", "bullets", ["Key point with example", "Key point with example", "Strongest line"]),
      T("Closing Call", "closing", ["Restated message", "Call to action"]),
    ],
  },
  {
    id: "syllabus",
    label: "Syllabus / Course Outline",
    keywords: ["syllabus", "course outline", "course syllabus", "subject outline"],
    docType: "syllabus",
    targetLength: 2,
    sections: [
      T("Course Description & Outcomes", "paragraph", ["What the course covers", "Learning outcomes"]),
      T("Weekly Schedule", "table", ["Week and topic per row", "Activities", "Assessments"]),
      T("Grading & Policies", "bullets", ["Grade breakdown", "Attendance and late work", "Classroom policies"]),
    ],
  },
  {
    id: "tos-rubric",
    label: "TOS / Rubric",
    keywords: ["table of specifications", "tos", "rubric", "scoring guide", "scoring rubric", "marking scheme", "pamantayan"],
    docType: "rubric",
    targetLength: 1,
    sections: [
      T("Coverage Map", "table", ["Topic per row", "Cognitive level", "Number of items"]),
      T("Scoring Levels", "table", ["Criteria per row", "What each level looks like", "Points"]),
      T("Notes for Raters", "bullets", ["How to use this guide", "Common pitfalls"]),
    ],
  },
  {
    id: "action-research-deped",
    label: "Action Research (DepEd)",
    keywords: ["action research", "classroom-based action research", "cbar", "berf"],
    docType: "action research",
    targetLength: 8,
    sections: [
      T("Context & Rationale", "paragraph", ["Problem and urgency with data", "Legal/curriculum basis"]),
      T("Innovation & Intervention", "paragraph", ["What was implemented", "Dates and task assignments"]),
      T("Research Questions", "bullets", ["Baseline question", "Intervention question", "Next-steps question"]),
      T("Methods", "paragraph", ["Participants and setting", "Instruments and procedure"]),
      T("Results & Discussion", "groups", ["Finding with evidence", "Finding with evidence"]),
      T("Reflection", "paragraph", ["What worked", "What to improve"]),
      T("Action Plan", "table", ["Objective per row", "Activities and persons", "Time frame"]),
      T("Recommendations", "closing", ["Summary of conclusions", "Next actions"]),
    ],
  },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Best keyword match for free text, or null. Word-boundary matching only —
 *  "example" must never match keyword "exam". Multi-word hits score higher.
 *  Ties break toward the earliest mention (the head noun usually comes first:
 *  "rubric for essay writing" is a rubric, not an essay). */
export function matchTemplate(text: string | undefined | null): DocTemplate | null {
  if (!text) return null;
  const hay = text.toLowerCase();
  let best: DocTemplate | null = null;
  let bestScore = 0;
  let bestIndex = Infinity;
  for (const t of TEMPLATES) {
    let score = 0;
    let firstIndex = Infinity;
    for (const kw of t.keywords) {
      const re = new RegExp(`\\b${kw.split(/\s+/).map(escapeRegExp).join("\\s+")}\\b`);
      const m = re.exec(hay);
      if (m) {
        score += kw.includes(" ") ? 3 : 1;
        if (m.index < firstIndex) firstIndex = m.index;
      }
    }
    if (score > bestScore || (score === bestScore && score > 0 && firstIndex < bestIndex)) {
      bestScore = score;
      bestIndex = firstIndex;
      best = t;
    }
  }
  return bestScore > 0 ? best : null;
}

/** One-line brief for prompt injection (section flow + layouts). */
export function templateBrief(t: DocTemplate): string {
  const flow = t.sections.map((s) => `${s.title} [${s.layout}]`).join(" → ");
  return `School template "${t.label}" (default ${t.targetLength} page${t.targetLength === 1 ? "" : "s"}): ${flow}. Mirror this section flow and these layouts unless the user explicitly customized them.`;
}

/**
 * Structural layouts are satisfied by layout alone (a quiz block is a quiz
 * block); generic ones (bullets/paragraph) also need title-word overlap, so a
 * random bullets section never counts as the quiz "Answer Key".
 */
const DISTINCTIVE_LAYOUTS = new Set(["quiz", "table", "timeline", "groups", "two-column", "stats", "quote", "comparison"]);

/**
 * Pad-only skeleton enforcement: append template sections missing from the
 * outline. Never removes, reorders or rewrites — user customizations survive.
 */
export function applyTemplateSkeleton(
  sections: { id: string; title: string; layout: string; points: string[] }[],
  template: DocTemplate,
  makeId: (base: string) => string,
): { id: string; title: string; layout: string; points: string[] }[] {
  const hasLayout = (layout: string) => sections.some((s) => s.layout === layout);
  const hasTitleWord = (title: string) => {
    const words = title.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
    return sections.some((s) => words.some((w) => s.title.toLowerCase().includes(w)));
  };
  const present = (ts: TemplateSection) =>
    DISTINCTIVE_LAYOUTS.has(ts.layout) ? hasLayout(ts.layout) : hasLayout(ts.layout) && hasTitleWord(ts.title);
  const out = [...sections];
  const closingIdx = () => out.findIndex((s) => s.layout === "closing");
  for (const ts of template.sections) {
    if (ts.layout === "cover" || ts.layout === "closing") continue;
    if (present(ts)) continue;
    const seeded = { id: makeId("tpl"), title: ts.title, layout: ts.layout, points: [...ts.points] };
    const ci = closingIdx();
    if (ci >= 0) out.splice(ci, 0, seeded);
    else out.push(seeded);
  }
  return out;
}
