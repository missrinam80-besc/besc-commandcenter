// Conservative lexical review, NOT a SQL parser or a behavior-equivalence proof.
// Quoted strings/identifiers are preserved byte-for-byte. Never used to authorize writes.
export function sqlReviewTokens(sql, { plpgsqlFinalSemicolon = false } = {}) {
  const tokens = [];
  let i = 0, gapNewline = false, previousString = false;
  while (i < sql.length) {
    if (/\s/.test(sql[i])) { gapNewline ||= /[\r\n]/.test(sql[i]); i++; continue; }
    if (sql.startsWith("--", i)) { const end = sql.indexOf("\n", i); i = end < 0 ? sql.length : end; continue; }
    if (sql.startsWith("/*", i)) {
      let depth = 1; i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith("/*", i)) { depth++; i += 2; }
        else if (sql.startsWith("*/", i)) { depth--; i += 2; }
        else { gapNewline ||= /[\r\n]/.test(sql[i]); i++; }
      }
      if (depth) throw Error("Unterminated SQL comment");
      continue;
    }
    const start = i;
    let token, isString = false;
    const escaped = /[eE]/.test(sql[i]) && sql[i + 1] === "'";
    if (sql[i] === "'" || sql[i] === '"' || escaped) {
      if (escaped) i++;
      const quote = sql[i++]; let closed = false;
      while (i < sql.length) {
        if (escaped && sql[i] === "\\") { i += 2; continue; }
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { i += 2; continue; }
          i++; closed = true; break;
        }
        i++;
      }
      if (!closed) throw Error("Unterminated SQL quoted value");
      isString = quote === "'";
      token = sql.slice(start, i);
    } else {
      const dollar = sql.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/)?.[0];
      if (dollar) {
        const end = sql.indexOf(dollar, i + dollar.length);
        if (end < 0) throw Error("Unterminated SQL dollar quote");
        i = end + dollar.length; token = sql.slice(start, i); isString = true;
      } else {
        const match = sql.slice(i).match(/^[a-zA-Z_][a-zA-Z_0-9$]*|^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|^[+\-*/<>=~!@#%^&|?:]+/);
        token = match ? match[0] : sql[i]; i += token.length;
        if (/^[a-zA-Z_]/.test(token)) token = token.toLowerCase();
      }
    }
    // PostgreSQL distinguishes adjacent string constants separated by a newline.
    if (previousString && isString) tokens.push(gapNewline ? "<string-newline>" : "<string-space>");
    tokens.push(token); previousString = isString; gapNewline = false;
  }
  if (plpgsqlFinalSemicolon && tokens.at(-1) === ";" && tokens.at(-2) === "end") tokens.pop();
  return tokens;
}

export function sameSqlForReview(left, right, options) {
  return JSON.stringify(sqlReviewTokens(left, options)) === JSON.stringify(sqlReviewTokens(right, options));
}
