import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  // Native / WASM packages that must run in Node, not be bundled
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'pg', 'bcryptjs'],
};

export default nextConfig;
