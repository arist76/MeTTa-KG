// MeTTa syntax highlighter for CodeJar
// Ported from the original CodeMirror StreamLanguage tokenizer

const keywords: Record<string, true> = {
  if: true,
  "if-error": true,
  "if-equal": true,
  "==": true,
  let: true,
  not: true,
  else: true,
  case: true,
  then: true,
  while: true,
  for: true,
  def: true,
  return: true,
  and: true,
  or: true,
  empty: true,
  match: true,
  println: true,
  trace: true,
  assertEqualToResult: true,
  "car-atom": true,
  collapse: true,
  superpose: true,
  bind: true,
  import: true,
  "add-reduct": true,
  pragma: true,
  "remove-atom": true,
  "cdr-atom": true,
  "cons-atom": true,
  "new-space": true,
  quote: true,
  assertEqual: true,
  "add-atom": true,
  "get-type": true,
  "get-metatype": true,
  "mod-space": true,
  unify: true,
  Nil: true,
  True: true,
  False: true,
  Bool: true,
  Number: true,
  $_: true,
  "&self": true,
  "pow-math": true,
  "sqrt-math": true,
  "abs-math": true,
  "log-math": true,
  "trunc-math": true,
  "ceil-math": true,
  "floor-math": true,
  "round-math": true,
  "sin-math": true,
  "asin-math": true,
  "cos-math": true,
  "acos-math": true,
  "tan-math": true,
  "atan-math": true,
  "isnan-math": true,
  "isinf-math": true,
  PI: true,
  EXP: true,
  "print-mods": true,
  "register-module": true,
  "git-module": true,
  "random-int": true,
  "random-float": true,
  flip: true,
  "new-state": true,
  "change-state": true,
  "get-state": true,
  "get-type-space": true,
  "min-atom": true,
  "max-atom": true,
  "size-atom": true,
  "index-atom": true,
  "unique-atom": true,
  "subtraction-atom": true,
  "intersection-atom": true,
  "union-atom": true,
  "=alpha": true,
  assertAlphaEqualToResult: true,
  assertAlphaEqual: true,
  "filter-atom": true,
  "map-atom": true,
  "foldl-atom": true,
  unquote: true,
  "noreduce-eq": true,
  "first-from-pair": true,
  "match-type-or": true,
  ERROR: true,
};

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function highlightMetta(editor: HTMLElement) {
  const code = editor.textContent ?? "";
  let html = "";
  let i = 0;

  while (i < code.length) {
    const rest = code.slice(i);
    let m: RegExpMatchArray | null;

    // Comments
    if ((m = rest.match(/^;.*/))) {
      html += `<span class="token comment">${esc(m[0])}</span>`;
      i += m[0].length;
      continue;
    }

    // Strings
    if ((m = rest.match(/^"[^"]*"/))) {
      html += `<span class="token string">${esc(m[0])}</span>`;
      i += m[0].length;
      continue;
    }

    // Numbers
    if ((m = rest.match(/^\d+/))) {
      html += `<span class="token number">${esc(m[0])}</span>`;
      i += m[0].length;
      continue;
    }

    // Variables ($...)
    if ((m = rest.match(/^\$[a-zA-Z0-9-]+/))) {
      html += `<span class="token variable">${esc(m[0])}</span>`;
      i += m[0].length;
      continue;
    }

    // Keywords and identifiers
    if ((m = rest.match(/^[a-zA-Z][a-zA-Z0-9-]*/))) {
      const word = m[0];
      if (keywords[word]) {
        html += `<span class="token keyword">${esc(word)}</span>`;
      } else {
        html += `<span class="token variable">${esc(word)}</span>`;
      }
      i += word.length;
      continue;
    }

    // Operators
    if ((m = rest.match(/^[+\-*/=><%]/))) {
      html += `<span class="token operator">${esc(m[0])}</span>`;
      i += m[0].length;
      continue;
    }

    // Brackets
    if ((m = rest.match(/^[(){}[\]]/))) {
      html += `<span class="token bracket">${esc(m[0])}</span>`;
      i += m[0].length;
      continue;
    }

    // Everything else (whitespace, punctuation)
    html += esc(code[i]);
    i++;
  }

  editor.innerHTML = html;
}
