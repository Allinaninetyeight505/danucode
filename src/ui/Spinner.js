import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

const e = React.createElement;

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const PHRASES = [
  'Thinking...',
  'Pondering...',
  'Cogitating...',
  'Chewing on that...',
  'Working on it...',
  'Crunching tokens...',
  'Kia kaha...',
  'Sweet as, processing...',
  'Yeah nah, thinking...',
  'Choice bro, computing...',
  'She\'ll be right...',
  'Sorting it out...',
  'On to it...',
  'No worries, working...',
  'Good as gold...',
  'Buzzy, processing...',
];

function randomPhrase() {
  return PHRASES[Math.floor(Math.random() * PHRASES.length)];
}

export default function Spinner() {
  const [frame, setFrame] = useState(0);
  const [phrase, setPhrase] = useState(() => randomPhrase());
  const [elapsed, setElapsed] = useState(0);
  const [startTime] = useState(() => Date.now());

  // Spin the frame and update elapsed every 80ms
  useEffect(() => {
    const id = setInterval(() => {
      setFrame(f => (f + 1) % FRAMES.length);
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 80);
    return () => clearInterval(id);
  }, [startTime]);

  // Change phrase every 4 seconds
  useEffect(() => {
    const id = setInterval(() => {
      setPhrase(randomPhrase());
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const showEscHint = elapsed >= 3;

  return e(Box, { paddingLeft: 2, flexDirection: 'row', gap: 1 },
    e(Text, { color: 'green' }, FRAMES[frame]),
    e(Text, { dimColor: true }, phrase),
    e(Text, { dimColor: true }, `${elapsed}s`),
    showEscHint && e(Text, { dimColor: true }, '· Esc to cancel')
  );
}
