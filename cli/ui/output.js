let outputCallback = null;
let lineId = 0;

export function setOutputCallback(cb) {
  outputCallback = cb;
}

export function output(type, content) {
  if (outputCallback) {
    outputCallback({ id: lineId++, type, content });
  } else {
    // Fallback to console.log if Ink isn't initialized
    console.log(content);
  }
}

export function outputText(content) { output('text', content); }
export function outputTool(name, detail) { output('tool-start', `● ${name}  ${detail || ''}`); }
export function outputToolResult(content) { output('tool-output', content); }
export function outputToolDone(success) { output('tool-end', success ? '✓' : '✗'); }
export function outputSystem(content) { output('system', content); }
export function outputError(content) { output('error', content); }
export function outputUser(content) { output('user', content); }
