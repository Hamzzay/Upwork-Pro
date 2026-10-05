// One live call to check the key, the model name and the routing. Run: npm run probe
import { runClaude } from '../src/llm/claude-runner';

runClaude({ model: process.env.LLM_MODEL || 'glm-5.3-flash[1m]', system: 'Be terse.', prompt: 'Reply with the word ok' })
  .then((r) => console.log(r.text, Object.keys(r.raw.modelUsage ?? {})))
  .catch((e) => { console.error(e.message); process.exit(1); });
