export function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
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

export function fuzzySearch(term, items, keys) {
  const lowerTerm = term.toLowerCase();
  if (!lowerTerm) return items;

  const threshold = Math.floor(lowerTerm.length / 4);

  return items.filter((item) => {
    return keys.some((key) => {
      const value = item[key]?.toLowerCase();
      if (!value) return false;
      if (value.includes(lowerTerm)) return true;
      return levenshtein(lowerTerm, value) <= threshold;
    });
  });
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
