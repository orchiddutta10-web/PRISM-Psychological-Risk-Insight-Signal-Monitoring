import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const rootDir = path.resolve(process.cwd(), '../../'); // dashboard is in apps/dashboard, so prism is ../../
  
  function scanDir(dir: string, base: string = ''): any {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.map(entry => {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(base, entry.name);
      const stats = fs.statSync(fullPath);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next' || entry.name === '__pycache__') {
          return { type: 'directory', name: entry.name, path: relPath, size: 0, children: [] };
        }
        return {
          type: 'directory',
          name: entry.name,
          path: relPath,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          children: scanDir(fullPath, relPath),
        };
      } else {
        return {
          type: 'file',
          name: entry.name,
          path: relPath,
          size: stats.size,
          modified: stats.mtime.toISOString(),
        };
      }
    });
  }

  try {
    const tree = scanDir(rootDir);
    return NextResponse.json({ success: true, tree, rootPath: rootDir });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
