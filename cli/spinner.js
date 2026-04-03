import chalk from 'chalk';

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

export function createSpinner() {
  let interval = null;
  let frame = 0;
  let startTime = 0;
  let phrase = '';
  let phraseChangeAt = 0;

  function pickPhrase() {
    phrase = PHRASES[Math.floor(Math.random() * PHRASES.length)];
  }

  function start() {
    stop();
    startTime = Date.now();
    frame = 0;
    pickPhrase();
    phraseChangeAt = startTime + 4000;

    interval = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      frame = (frame + 1) % FRAMES.length;

      // Change phrase every ~4 seconds
      if (Date.now() > phraseChangeAt) {
        pickPhrase();
        phraseChangeAt = Date.now() + 4000;
      }

      const spinner = chalk.green(FRAMES[frame]);
      const time = chalk.dim(`${elapsed}s`);
      const text = chalk.dim(phrase);
      const escHint = elapsed > 3 ? chalk.dim(' · Esc to cancel') : '';

      process.stdout.write(`\r\x1b[2K  ${spinner} ${text} ${time}${escHint}`);
    }, 80);
  }

  function stop() {
    if (interval) {
      clearInterval(interval);
      interval = null;
      process.stdout.write('\r\x1b[2K');
    }
  }

  function elapsed() {
    return ((Date.now() - startTime) / 1000).toFixed(1);
  }

  return { start, stop, elapsed };
}
