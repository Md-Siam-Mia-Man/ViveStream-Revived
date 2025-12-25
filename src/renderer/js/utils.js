export function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const date = new Date(0);
  date.setSeconds(seconds);
  const timeString = date.toISOString().substr(11, 8);
  return seconds < 3600 ? timeString.substr(3) : timeString;
}

export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function levenshtein(s1, s2) {
  if (s1.length < s2.length) {
    return levenshtein(s2, s1);
  }

  if (s2.length === 0) {
    return s1.length;
  }

  let previousRow = Array.from({ length: s2.length + 1 }, (_, i) => i);

  for (let i = 0; i < s1.length; i++) {
    let currentRow = [i + 1];
    for (let j = 0; j < s2.length; j++) {
      let insertions = previousRow[j + 1] + 1;
      let deletions = currentRow[j] + 1;
      let substitutions = previousRow[j] + (s1[i] !== s2[j]);
      currentRow.push(Math.min(insertions, deletions, substitutions));
    }
    previousRow = currentRow;
  }
  return previousRow[previousRow.length - 1];
}

export function fuzzySearch(term, items, keys) {
  const lowerTerm = term.toLowerCase();
  if (!lowerTerm) return items;

  const weights = {
    EXACT_MATCH: 100,
    INCLUDES_PRIMARY: 80,
    INCLUDES_SECONDARY: 60,
    SIMILARITY_THRESHOLD: 0.4,
    SIMILARITY_SCORE_MULTIPLIER: 40,
  };

  const results = items
    .map((item) => {
      let bestScore = 0;

      for (const key of keys) {
        const value = item[key]?.toLowerCase();
        if (!value) continue;

        let score = 0;
        const isPrimaryField = key === 'title' || key === 'name';

        if (value === lowerTerm) {
          score = weights.EXACT_MATCH;
        } else if (value.includes(lowerTerm)) {
          score = isPrimaryField
            ? weights.INCLUDES_PRIMARY
            : weights.INCLUDES_SECONDARY;
          score -= value.length / 10;
        } else {
          const distance = levenshtein(lowerTerm, value);
          const similarity =
            1 - distance / Math.max(lowerTerm.length, value.length);
          if (similarity > weights.SIMILARITY_THRESHOLD) {
            score = similarity * weights.SIMILARITY_SCORE_MULTIPLIER;
          }
        }
        if (score > bestScore) {
          bestScore = score;
        }
      }

      if (bestScore > 0) {
        return { ...item, score: bestScore };
      }
      return null;
    })
    .filter(Boolean);

  return results.sort((a, b) => b.score - a.score);
}
