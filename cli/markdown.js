import chalk from 'chalk';

/**
 * Render markdown text with chalk formatting for terminal display.
 * Handles headings, bold, italic, inline code, code blocks, lists, blockquotes, and hr.
 */
export function renderMarkdown(text) {
  const lines = text.split('\n');
  const result = [];
  let inCodeBlock = false;
  let codeLanguage = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block detection
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (inCodeBlock) {
        codeLanguage = line.trim().slice(3).trim();
        if (codeLanguage) {
          result.push(chalk.gray(`  ${codeLanguage}`));
        }
      }
      continue;
    }

    if (inCodeBlock) {
      result.push(chalk.gray(`  ${line}`));
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      result.push(chalk.dim('─'.repeat(40)));
      continue;
    }

    // Headings
    const h1Match = line.match(/^#{1}\s+(.+)$/);
    if (h1Match) {
      result.push(chalk.bold(h1Match[1]));
      continue;
    }

    const h2Match = line.match(/^#{2}\s+(.+)$/);
    if (h2Match) {
      result.push(chalk.bold(h2Match[1]));
      continue;
    }

    const h3Match = line.match(/^#{3}\s+(.+)$/);
    if (h3Match) {
      result.push(chalk.bold.dim(h3Match[1]));
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const content = line.slice(1).trim();
      result.push(chalk.dim(`│ ${content}`));
      continue;
    }

    // List item (keep as-is)
    if (line.trim().startsWith('-')) {
      result.push(renderInline(line));
      continue;
    }

    // Regular line with inline formatting
    result.push(renderInline(line));
  }

  return result.join('\n');
}

/**
 * Apply inline formatting: bold, italic, code (but not block-level formatting).
 * Handles **bold**, *italic*, `code`, and [link text](url).
 */
export function renderInline(text) {
  if (!text) return text;

  // Process inline code first (backticks)
  text = text.replace(/`([^`]+)`/g, (match, code) => {
    return chalk.cyan(code);
  });

  // Process links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
    return chalk.blue(label) + chalk.dim(` (${url})`);
  });

  // Process bold (**text**)
  text = text.replace(/\*\*([^\*]+)\*\*/g, (match, bold) => {
    return chalk.bold(bold);
  });

  // Process italic (*text*), but only if not already inside bold
  text = text.replace(/\*([^\*]+)\*/g, (match, italic) => {
    // Skip if this is part of a bold marker we already processed
    return chalk.italic(italic);
  });

  return text;
}
