
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const DEFAULT_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
];

function getModelCandidates() {
  const envList = (process.env.GEMINI_MODEL_CANDIDATES || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  const envPrimary = (process.env.GEMINI_MODEL || '').trim();

  return Array.from(new Set([
    ...envList,
    ...(envPrimary ? [envPrimary] : []),
    ...DEFAULT_MODELS,
  ]));
}

async function test() {
  console.log('Key length:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0);
  if (!process.env.GEMINI_API_KEY) return;

  try {
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const models = getModelCandidates();
    console.log('Model candidates:', models.join(', '));

    for (const modelName of models) {
      try {
        const model = ai.getGenerativeModel({ model: modelName });
        const r = await model.generateContent('Generate exactly 1 short sentence.');
        console.log('SUCCESS model:', modelName);
        console.log('SUCCESS output:', r.response.text());
        return;
      } catch (e) {
        console.error(`FAILED model ${modelName}:`, e.message);
      }
    }

    console.error('ERROR: no working model found from candidates.');
  } catch (e) {
    console.error('ERROR:', e.message);
  }
}
test();

