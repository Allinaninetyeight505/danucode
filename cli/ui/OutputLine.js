import React from 'react';
import { Box, Text } from 'ink';

const e = React.createElement;

export default function OutputLine({ type, content }) {
  switch (type) {
    case 'user':
      return e(Box, { paddingLeft: 0 },
        e(Text, { color: 'green', bold: true }, '❯ '),
        e(Text, { color: 'white' }, content)
      );

    case 'text':
      return e(Box, { paddingLeft: 2 },
        e(Text, null, content)
      );

    case 'tool-start':
      return e(Box, { paddingLeft: 2 },
        e(Text, { color: 'cyan' }, content)
      );

    case 'tool-output':
      return e(Box, { paddingLeft: 4 },
        e(Text, { dimColor: true }, content)
      );

    case 'tool-end': {
      const isSuccess = content === '✓';
      return e(Box, { paddingLeft: 4 },
        e(Text, { color: isSuccess ? 'green' : 'red' }, content)
      );
    }

    case 'system':
      return e(Box, { paddingLeft: 2 },
        e(Text, { dimColor: true }, content)
      );

    case 'error':
      return e(Box, { paddingLeft: 2 },
        e(Text, { color: 'red' }, content)
      );

    default:
      return e(Box, { paddingLeft: 2 },
        e(Text, null, content)
      );
  }
}
