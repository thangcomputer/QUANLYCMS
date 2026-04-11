import { exec } from 'child_process';
import { writeFileSync } from 'fs';

exec('npx vite build', (error, stdout, stderr) => {
  const result = {
    error: error ? error.message : null,
    stdout,
    stderr
  };
  writeFileSync('test_output.json', JSON.stringify(result, null, 2));
});
