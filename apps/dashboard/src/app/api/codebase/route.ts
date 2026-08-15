import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  // SECURITY: this endpoint exposes the entire repository file tree. It is
  // gated to non-production environments only — in production it returns 404
  // regardless of caller. Disable the route entirely by setting
  // `NEXT_PUBLIC_ENABLE_CODEBASE_API=false` if you need it off in dev too.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ success: false, error: 'not found' }, { status: 404 });
  }
  if (process.env.NEXT_PUBLIC_ENABLE_CODEBASE_API === 'false') {
    return NextResponse.json({ success: false, error: 'disabled' }, { status: 404 });
  }

  const rootDir = path.resolve(process.cwd(), '../../'); // dashboard is in apps/dashboard, so prism is ../../

  const EXCLUDED = new Set([
    'node_modules', '.git', '.next', '__pycache__', '.venv', 'venv',
    '.pio', '.firmware-check', '.fwcheck', '.pytest_cache', '.mypy_cache',
    'dist', 'build', 'uploads', 'chroma_db', 'mlruns',
  ]);

  function scanDir(dir: string, base: string = ''): Array<Record<string, unknown>> {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries.flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(base, entry.name);
      let stats: fs.Stats;
      try {
        stats = fs.statSync(fullPath);
      } catch {
        return [];
      }
      if (entry.isDirectory()) {
        const rec: Record<string, unknown> = {
          type: 'directory',
          name: entry.name,
          path: relPath,
          size: 0,
        };
        if (!EXCLUDED.has(entry.name)) {
          rec.modified = stats.mtime.toISOString();
          rec.children = scanDir(fullPath, relPath);
          rec.size = stats.size;
        }
        return [rec];
      }
      return [{
        type: 'file',
        name: entry.name,
        path: relPath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
      }];
    });
  }

  try {
    const tree = scanDir(rootDir);
    return NextResponse.json({ success: true, tree, rootPath: rootDir });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
