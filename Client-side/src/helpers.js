export const AiTask = {
  Generate: 'Generate',
  Rephrase: 'Rephrase',
  Translate: 'Translate',
  Grammar: 'Grammar',
};

export function buildPrompt(task, text, {
  tone = 'Professional',
  format = 'Paragraph',
  length = 'Medium',
  fromLang = 'English',
  toLang = 'French',
  checks = [],
  userHint = '',
} = {}) {
  const safeText = text || '';
  switch (task) {
    case AiTask.Generate:
      return `generate ${format.toLowerCase()} in ${tone.toLowerCase()} tone, length ${length.toLowerCase()}:
${safeText}

Return only an HTML fragment (use <h2>, <p>, <ul><li> etc. as needed). No explanations.`;
    case AiTask.Rephrase: {
      const extra = userHint?.trim() ? ` Target suggestion: ${userHint.trim()}` : '';
      return `rephrase to ${tone.toLowerCase()} tone, ${format.toLowerCase()} style, length ${length.toLowerCase()}:${extra}
${safeText}

Return only an HTML fragment. No preface, no numbering.`;
    }
    case AiTask.Translate:
      return `translate ${fromLang} to ${toLang}:
${safeText}

Return only the translated HTML fragment. No other text.`;
    case AiTask.Grammar: {
      const filter = checks && checks.length > 0 ? ` focusing on: ${checks.join(', ')}.` : '.';
      return `fix grammar and clarity${filter}
${safeText}

Return only the corrected HTML fragment. Do not explain the changes.`;
    }
    default:
      return safeText;
  }
}

export function levenshtein(a, b) {
  const dp = Array(a.length + 1).fill(0).map(() => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}
export function isSimilar(a, b, threshold = 1) {
  if (!a || !b) return false;
  return levenshtein(a, b) <= threshold;
}
export function highlightDifferences(original, modified) {
  const oWords = (original || '').split(/\s+/);
  const mWords = (modified || '').split(/\s+/);
  const lcs = Array(oWords.length + 1).fill(0).map(() => Array(mWords.length + 1).fill(0));
  for (let i = 0; i < oWords.length; i++) {
    for (let j = 0; j < mWords.length; j++) {
      if (oWords[i] === mWords[j] || isSimilar(oWords[i], mWords[j])) lcs[i + 1][j + 1] = lcs[i][j] + 1;
      else lcs[i + 1][j + 1] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const unchanged = new Set();
  let x = oWords.length, y = mWords.length;
  while (x > 0 && y > 0) {
    if (oWords[x - 1] === mWords[y - 1] || isSimilar(oWords[x - 1], mWords[y - 1])) { unchanged.add(`${x - 1}|${y - 1}`); x--; y--; }
    else if (lcs[x - 1][y] >= lcs[x][y - 1]) x--;
    else y--;
  }
  const highlightedOriginal = oWords.map((w, i) =>
    [...unchanged].some(k => k.startsWith(`${i}|`)) ? w : `<span class="e-original-word">${w}</span>`).join(' ');
  const highlightedModified = mWords.map((w, j) =>
    [...unchanged].some(k => k.endsWith(`|${j}`)) ? w : `<span class="e-improved-word">${w}</span>`).join(' ');
  return { highlightedOriginal, highlightedModified };
}