import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, Static, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import OutputLine from './OutputLine.js';
import StatusBar from './StatusBar.js';
import Spinner from './Spinner.js';
import { setOutputCallback } from './output.js';

const e = React.createElement;

export default function App({ config, yolo, projectName, version, onSubmit, onExit }) {
  const { exit } = useApp();
  const [outputLines, setOutputLines] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [tokenCount, setTokenCount] = useState(null);
  const [mode, setMode] = useState('code');
  const [planMode, setPlanMode] = useState(false);

  // Expose addLine so external callers (loop.js via output.js) can push lines
  const addLine = useCallback((line) => {
    setOutputLines(prev => [...prev, line]);
  }, []);

  // Wire the output channel as soon as the component mounts
  useEffect(() => {
    setOutputCallback(addLine);
    return () => setOutputCallback(null);
  }, [addLine]);

  // Escape key: cancel processing or trigger exit when idle
  useInput((input, key) => {
    if (key.escape) {
      if (isProcessing && onExit) {
        onExit('cancel');
      } else if (!isProcessing) {
        if (onExit) onExit('exit');
        else exit();
      }
    }
  });

  const handleSubmit = useCallback((value) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    setInputValue('');
    setIsProcessing(true);

    // Echo the user input into the output area
    setOutputLines(prev => [
      ...prev,
      { id: `user-${Date.now()}`, type: 'user', content: trimmed },
    ]);

    if (onSubmit) {
      Promise.resolve(onSubmit(trimmed, {
        setTokenCount,
        setMode,
        setPlanMode,
        addLine,
      })).finally(() => {
        setIsProcessing(false);
      });
    } else {
      setIsProcessing(false);
    }
  }, [onSubmit, addLine]);

  const model = config?.model ?? '';
  const promptColor = planMode ? 'magenta' : 'green';

  return e(Box, { flexDirection: 'column', height: '100%' },

    // Scrollable output area — items rendered here never re-render (Static)
    e(Static, { items: outputLines },
      (item) => e(OutputLine, { key: item.id, type: item.type, content: item.content })
    ),

    // Spinner shown only while processing
    isProcessing && e(Spinner, null),

    // Fixed bottom area
    e(Box, { flexDirection: 'column' },

      // Status bar
      e(StatusBar, {
        mode,
        yolo: !!yolo,
        model,
        tokenCount,
        isProcessing,
        planMode,
      }),

      // Prompt / input row
      e(Box, { flexDirection: 'row', paddingLeft: 1, paddingTop: 0 },
        e(Text, { color: promptColor, bold: true }, '❯ '),
        isProcessing
          ? e(Text, { dimColor: true }, inputValue || '')
          : e(TextInput, {
              value: inputValue,
              onChange: setInputValue,
              onSubmit: handleSubmit,
              placeholder: 'Type a message...',
            })
      )
    )
  );
}
