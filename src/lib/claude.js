// Story + example generation with the Claude API, called straight from the phone
// using the user's own API key (stored only on this device).
import Anthropic from '@anthropic-ai/sdk';
import { HSK_LABEL } from './data.js';

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (best)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (faster, cheaper)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest, cheapest)' },
];

function client(apiKey) {
  if (!apiKey) throw new Error('Add your Anthropic API key in Settings first.');
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

const tokenSchema = {
  type: 'object',
  properties: {
    t: { type: 'string', description: 'The token text: one word in simplified Chinese, or punctuation.' },
    p: { type: 'string', description: 'Pinyin with tone marks for this word in context; empty string for punctuation.' },
    g: { type: 'string', description: 'Short English gloss of the meaning in THIS context; empty for punctuation.' },
  },
  required: ['t', 'p', 'g'],
  additionalProperties: false,
};

const storySchema = {
  type: 'object',
  properties: {
    title: { type: 'array', items: tokenSchema },
    title_en: { type: 'string' },
    paragraphs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sentences: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tokens: { type: 'array', items: tokenSchema },
                en: { type: 'string', description: 'Natural English translation of the sentence.' },
              },
              required: ['tokens', 'en'],
              additionalProperties: false,
            },
          },
        },
        required: ['sentences'],
        additionalProperties: false,
      },
    },
    new_words: {
      type: 'array',
      description: 'Words used in the story that are NOT in the learner list.',
      items: {
        type: 'object',
        properties: { word: { type: 'string' }, pinyin: { type: 'string' }, meaning: { type: 'string' } },
        required: ['word', 'pinyin', 'meaning'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'title_en', 'paragraphs', 'new_words'],
  additionalProperties: false,
};

const SYSTEM = `You write graded readers for a learner of Mandarin Chinese.

Write in simplified Chinese. The learner should understand almost everything, so build the story from the words they already know (given as a list) plus the most basic function words and grammar of their level. Only introduce new words at the rate requested, choose new words that are useful and guessable from context, and reuse each new word more than once. Grammar must stay at or below the stated HSK level. Keep sentences short and natural, the way a good teacher would write; the story should still be engaging and have a clear beginning, middle and end.

Segment every sentence into words exactly as a dictionary would (e.g. 我们 | 明天 | 去 | 公园 | 。), one token per word or punctuation mark, with pinyin in tone marks for each word as it is read in context (apply tone changes such as 一 and 不 in the pinyin you give) and a short English gloss of the word's meaning in that context.`;

async function send(anthropic, model, params, withFallback) {
  // Server-side fallback: if a model declines, the API retries on a fallback model.
  const extra = withFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {};
  const stream = anthropic.beta.messages.stream({ model, max_tokens: 32000, ...extra, ...params });
  return stream.finalMessage();
}

async function run(apiKey, model, params) {
  const anthropic = client(apiKey);
  const useFallback = model !== 'claude-haiku-5-5';
  let msg;
  try {
    msg = await send(anthropic, model, params, useFallback);
  } catch (e) {
    // If the fallback option isn't accepted for this account, retry once without it.
    if (useFallback && e instanceof Anthropic.BadRequestError && /fallback/i.test(e.message)) {
      msg = await send(anthropic, model, params, false);
    } else throw e;
  }
  if (msg.stop_reason === 'refusal') throw new Error('Claude declined to write this. Try a different topic.');
  if (msg.stop_reason === 'max_tokens') throw new Error('The response was cut off. Try a shorter length.');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return { data: JSON.parse(text), usage: msg.usage };
  } catch {
    throw new Error('Could not read the response from Claude. Please try again.');
  }
}

export function friendlyError(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'Your API key was rejected. Check it in Settings.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'This API key does not have access to that model.';
  if (e instanceof Anthropic.RateLimitError) return 'Rate limited by the API. Wait a minute and try again.';
  if (e instanceof Anthropic.APIConnectionError) return 'No connection to the Claude API. Are you online?';
  if (e instanceof Anthropic.APIError) return `Claude API error (${e.status}): ${e.message}`;
  return e?.message || String(e);
}

export const LENGTHS = {
  short: { label: 'Short', hint: '~150 characters', chars: 150 },
  medium: { label: 'Medium', hint: '~350 characters', chars: 350 },
  long: { label: 'Long', hint: '~700 characters', chars: 700 },
};

export async function generateStory({ apiKey, model, level, knownWords, focusWords, topic, length, newWordPct }) {
  const L = LENGTHS[length] || LENGTHS.medium;
  const prompt = [
    `Learner level: ${HSK_LABEL(level)}.`,
    `Words the learner knows (${knownWords.length}): ${knownWords.join('、')}`,
    focusWords.length ? `Please make a point of using these words, which the learner is reviewing now: ${focusWords.join('、')}` : '',
    `Topic: ${topic?.trim() || 'your choice — something from everyday life with a small twist'}.`,
    `Length: about ${L.chars} Chinese characters, in a few short paragraphs.`,
    newWordPct > 0
      ? `New words: about ${newWordPct}% of the words may be outside the learner's list (at most HSK ${Math.min(7, level + 1)} level).`
      : `New words: avoid words outside the learner's list except unavoidable names or very basic function words.`,
    'Use a title of a few words.',
  ]
    .filter(Boolean)
    .join('\n\n');
  return run(apiKey, model, {
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: storySchema } },
    messages: [{ role: 'user', content: prompt }],
  });
}

const examplesSchema = {
  type: 'object',
  properties: {
    examples: {
      type: 'array',
      items: {
        type: 'object',
        properties: { zh: { type: 'string' }, py: { type: 'string' }, en: { type: 'string' } },
        required: ['zh', 'py', 'en'],
        additionalProperties: false,
      },
    },
  },
  required: ['examples'],
  additionalProperties: false,
};

export async function generateExamples({ apiKey, model, word, pinyin, defs, level, knownWords }) {
  const prompt = `Write 3 short, natural example sentences in simplified Chinese using the word ${word} (${pinyin}: ${defs.slice(0, 4).join('; ')}). Show different meanings or uses of the word where it has several. Keep the rest of each sentence at ${HSK_LABEL(level)} level, preferring these words the learner knows: ${knownWords.slice(0, 400).join('、')}. Give pinyin with tone marks (words separated by spaces) and an English translation for each.`;
  return run(apiKey, model, {
    output_config: { format: { type: 'json_schema', schema: examplesSchema } },
    messages: [{ role: 'user', content: prompt }],
  });
}
