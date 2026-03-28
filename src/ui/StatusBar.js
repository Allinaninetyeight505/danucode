import React from 'react';
import { Box, Text } from 'ink';

const e = React.createElement;

const MODE_COLORS = {
  code: 'green',
  architect: 'blue',
  ask: 'cyan',
  debug: 'red',
};

export default function StatusBar({ mode, yolo, model, tokenCount, isProcessing, planMode }) {
  const modeColor = MODE_COLORS[mode] || 'green';
  const modelShort = model
    ? model.replace(/\.gguf$/, '').split('/').pop().slice(0, 30)
    : '';

  return e(Box, {
    borderStyle: 'single',
    borderTop: true,
    borderBottom: false,
    borderLeft: false,
    borderRight: false,
    paddingLeft: 1,
    paddingRight: 1,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 1,
  },
    // Permissions indicator
    yolo
      ? e(Text, { color: 'yellow' }, '⏵⏵ yolo')
      : e(Text, { dimColor: true }, '⏵ perms on'),

    e(Text, { dimColor: true }, '·'),

    // Plan mode badge
    planMode && e(Text, { color: 'magenta' }, 'plan mode'),
    planMode && e(Text, { dimColor: true }, '·'),

    // Mode badge (only show non-code modes explicitly, code is default)
    mode && mode !== 'code' && e(Text, { color: modeColor }, mode),
    mode && mode !== 'code' && e(Text, { dimColor: true }, '·'),

    // Model name
    modelShort
      ? e(Text, { dimColor: true }, modelShort)
      : null,

    // Token count
    tokenCount
      ? e(React.Fragment, null,
          e(Text, { dimColor: true }, '·'),
          e(Text, { dimColor: true }, `~${tokenCount}k tokens`)
        )
      : null,

    // Processing indicator
    isProcessing
      ? e(React.Fragment, null,
          e(Text, { dimColor: true }, '·'),
          e(Text, { color: 'yellow' }, 'processing')
        )
      : null
  );
}
