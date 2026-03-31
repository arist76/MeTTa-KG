// Syntax highlighting tokenizer for Metta language
// Metta is a logic programming language similar to Prolog

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
}

export type TokenType =
  | "keyword"
  | "function"
  | "variable"
  | "atom"
  | "number"
  | "string"
  | "comment"
  | "punctuation"
  | "operator"
  | "bracket"
  | "newline"
  | "whitespace"
  | "plain";

// Token patterns for Metta language
const patterns: Array<{ type: TokenType; regex: RegExp }> = [
  // Comments (line comments starting with # or %)
  { type: "comment", regex: /^(#.*|%.*)/ },

  // Strings (single or double quoted)
  { type: "string", regex: /^"(?:[^"\\]|\\.)*"|^'(?:[^'\\]|\\.)*'/ },

  // Numbers (integers and floats)
  { type: "number", regex: /^-?\d+\.?\d*(?:[eE][+-]?\d+)?/ },

  // Variables (start with uppercase or underscore)
  { type: "variable", regex: /^[A-Z_][a-zA-Z0-9_]*/ },

  // Special atoms (true, false, nil, etc.)
  { type: "atom", regex: /^(true|false|nil|null|none|empty)/ },

  // Keywords
  {
    type: "keyword",
    regex:
      /^(import|from|module|namespace|let|mut|if|else|match|and|or|not|bind|unify|type|decl|doc|test|expect|include|use|as|fn|return|match!|if!|and!|or!|not!|assert|assert_eq|print|println|debug|dump|trace|breakpoint|macro|case|of|where|->|=>|::|..|@@|@|\\|\/|\?|\!|\$|\%|\^|\&|\*|=|\+|-|<|>|\||~|`)/,
  },

  // Functions (lowercase followed by parentheses or specific patterns)
  { type: "function", regex: /^[a-z][a-zA-Z0-9_]*(?=\s*\()/ },

  // Atoms (lowercase identifiers)
  { type: "atom", regex: /^[a-z][a-zA-Z0-9_]*/ },

  // Brackets
  { type: "bracket", regex: /^[\[\]\(\)\{\}]/ },

  // Operators
  { type: "operator", regex: /^[+\-*/=<>!:&|]+/ },

  // Punctuation
  { type: "punctuation", regex: /^[.,;:'"@#]/ },

  // Whitespace
  { type: "whitespace", regex: /^\s+/ },

  // Newlines
  { type: "newline", regex: /^(\r\n|\r|\n)/ },

  // Plain text (fallback)
  { type: "plain", regex: /^./ },
];

// Tokenize a single line
export function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < line.length) {
    const remaining = line.slice(pos);
    let matched = false;

    for (const { type, regex } of patterns) {
      const match = remaining.match(regex);
      if (match) {
        tokens.push({
          type,
          value: match[0],
          start: pos,
          end: pos + match[0].length,
        });
        pos += match[0].length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Fallback for unmatched characters
      tokens.push({
        type: "plain",
        value: remaining[0],
        start: pos,
        end: pos + 1,
      });
      pos++;
    }
  }

  return tokens;
}

// Tokenize entire text
export function tokenize(text: string): Token[][] {
  const lines = text.split(/(\r\n|\r|\n)/);
  const result: Token[][] = [];

  for (const line of lines) {
    if (line.match(/^(\r\n|\r|\n)$/)) {
      result.push([
        { type: "newline", value: line, start: 0, end: line.length },
      ]);
    } else {
      result.push(tokenizeLine(line));
    }
  }

  return result;
}

// Get CSS class for token type
export function getTokenClass(type: TokenType): string {
  const classMap: Record<TokenType, string> = {
    keyword: "syntax-keyword",
    function: "syntax-function",
    variable: "syntax-variable",
    atom: "syntax-atom",
    number: "syntax-number",
    string: "syntax-string",
    comment: "syntax-comment",
    punctuation: "syntax-punctuation",
    operator: "syntax-operator",
    bracket: "syntax-bracket",
    newline: "syntax-newline",
    whitespace: "syntax-whitespace",
    plain: "syntax-plain",
  };
  return classMap[type] || "syntax-plain";
}

// Highlight text and return HTML
// export function highlightText(text: string): string {
//   const lines = tokenize(text);
//   let html = "";
//
//   for (let i = 0; i < lines.length; i++) {
//     const lineTokens = lines[i];
//     for (const token of lineTokens) {
//       const className = getTokenClass(token.type);
//       const escaped = escapeHtml(token.value);
//       html += `<span class="${className}">${escaped}</span>`;
//     }
//     if (i < lines.length - 1) {
//       html += "\n";
//     }
//   }
//
//   return html;
// }

export function highlightText(text: string): string {
  const lines = tokenize(text);
  let html = "";

  for (let i = 0; i < lines.length; i++) {
    const lineTokens = lines[i];
    for (const token of lineTokens) {
      const className = getTokenClass(token.type);
      const escaped = escapeHtml(token.value);
      html += `<span class="${className}">${escaped}</span>`;
    }
    // Use actual newline character to match textarea behavior with white-space: pre-wrap
    // instead of <br> tags which would cause double line spacing
    if (i < lines.length - 1) {
      html += "\n";
    }
  }

  return html;
}

// Escape HTML special characters
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
