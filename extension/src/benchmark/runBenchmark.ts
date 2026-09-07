/**
 * PrivAI — Standalone Benchmark Runner
 *
 * Runs the benchmark suite, prints console tables, and exports
 * benchmark-results.json for consumption by the backend & dashboard.
 */

import { BenchmarkSuite } from './benchmarkSuite';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function main() {
  const suite = new BenchmarkSuite();
  const metrics = suite.run();

  suite.printReport(metrics);

  const jsonContent = JSON.stringify(metrics, null, 2);

  // 1. Write inside extension
  const extensionOutPath = path.resolve(__dirname, 'benchmark-results.json');
  fs.writeFileSync(extensionOutPath, jsonContent, 'utf-8');
  console.log(`[Benchmark] Saved results to: ${extensionOutPath}`);

  // 2. Write to backend data directory for dashboard consumption
  const backendDataDir = path.resolve(__dirname, '../../../backend/app/data');
  if (!fs.existsSync(backendDataDir)) {
    try {
      fs.mkdirSync(backendDataDir, { recursive: true });
    } catch {}
  }
  if (fs.existsSync(backendDataDir)) {
    const backendOutPath = path.join(backendDataDir, 'benchmark-results.json');
    fs.writeFileSync(backendOutPath, jsonContent, 'utf-8');
    console.log(`[Benchmark] Exported results to backend: ${backendOutPath}`);
  }
}

main();
