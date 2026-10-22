import 'server-only';
import path from 'node:path';
import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';

// all-MiniLM-L6-v2: 384-dimensional sentence embeddings, runs locally on CPU (no API key).
// Must match scripts/lib.mjs so stored and query vectors live in the same space.
env.cacheDir = path.join(process.cwd(), '.cache', 'models');

// pipeline() has a huge overloaded type; call it through a simple signature instead
const loadPipeline = pipeline as unknown as (
  task: 'feature-extraction', model: string, options: { dtype: string },
) => Promise<FeatureExtractionPipeline>;

const globalForModel = globalThis as unknown as { extractor?: Promise<FeatureExtractionPipeline> };

function getExtractor() {
  globalForModel.extractor ??= loadPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });
  return globalForModel.extractor;
}

/** Mean-pooled, L2-normalised embedding of `text`, formatted as a pgvector literal. */
export async function embedText(text: string): Promise<string> {
  const extractor = await getExtractor();
  const out = await extractor(text, { pooling: 'mean', normalize: true });
  const vec = Array.from(out.data as Float32Array);
  return `[${vec.map((x) => x.toFixed(6)).join(',')}]`;
}
