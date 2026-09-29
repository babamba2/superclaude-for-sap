#!/usr/bin/env node

/**
 * SessionStart Hook: Project Memory Detection
 * Auto-detects project environment and injects SAP-specific context.
 * Adapted from OMC project-memory-session.mjs.
 *
 * Reads project memory from .sc4sap/project-memory.json if available.
 *
 * Registered with matcher "*", so it also runs after compaction (source
 * "compact") — that is how project memory survives a compact. PreCompact
 * cannot inject context (it accepts only a top-level `decision`).
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { readStdin } from './lib/stdin.mjs';

// Read JSON file safely
function readJsonFile(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

// Format project memory for context injection
function formatProjectMemory(memory) {
  if (!memory) return '';
  const parts = [];

  if (memory.techStack?.languages?.length) {
    parts.push(`Languages: ${memory.techStack.languages.join(', ')}`);
  }
  if (memory.techStack?.frameworks?.length) {
    parts.push(`Frameworks: ${memory.techStack.frameworks.join(', ')}`);
  }
  if (memory.sapModules?.length) {
    parts.push(`SAP Modules: ${memory.sapModules.join(', ')}`);
  }
  if (memory.recentTransports?.length) {
    parts.push(`Recent Transports: ${memory.recentTransports.slice(0, 5).join(', ')}`);
  }
  if (memory.recentObjects?.length) {
    parts.push(`Recent Objects: ${memory.recentObjects.slice(0, 10).map(o => o.name).join(', ')}`);
  }
  if (memory.userDirectives?.length) {
    parts.push(`User Directives:\n${memory.userDirectives.map(d => `  - ${d}`).join('\n')}`);
  }
  if (memory.customNotes?.length) {
    parts.push(`Notes:\n${memory.customNotes.map(n => `  - ${n}`).join('\n')}`);
  }

  return parts.join('\n');
}

async function main() {
  try {
    const input = await readStdin();
    let data = {};
    try { data = JSON.parse(input); } catch {}

    const directory = data.cwd || data.directory || process.cwd();

    // Load project memory
    const memoryPath = join(directory, '.sc4sap', 'project-memory.json');
    const memory = readJsonFile(memoryPath);

    if (!memory) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    const summary = formatProjectMemory(memory);
    if (!summary) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    console.log(JSON.stringify({
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `<project-memory-context>\n\n[PROJECT MEMORY]\n\n${summary}\n\n</project-memory-context>\n\n---\n`
      }
    }));
  } catch (error) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main();
