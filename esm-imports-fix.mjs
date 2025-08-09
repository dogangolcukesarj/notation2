/**
 * @file refactor-imports.mjs
 * @description A script to refactor TypeScript import paths for a modern Node.js ESM workspace.
 * This script performs two main tasks:
 * 1.  Simplifies Inter-Package Imports: It removes the '/lib' segment from imports
 * that reference other packages within the '@esarj' scope.
 * 2.  Ensures ESM Compliance: It appends the correct file extension (.js or /index.js) to all
 * relative import/export paths to make them explicit, as required by ESM.
 *
 * @usage node refactor-imports.mjs [target_directory]
 * @example node refactor-imports.mjs src
 */
import fs from 'fs/promises';
import path from 'path';

/**
 * Asynchronously refactors TypeScript import paths within a specified project directory.
 * It modifies files in place to align with modern ESM standards.
 */
async function refactorProjectImports() {
  // Use 'src' as the default directory and trim any whitespace from the argument.
  const targetDir = (process.argv[2] || 'src').trim();
  const fullTargetPath = path.resolve(process.cwd(), targetDir);

  // --- Path Validation ---
  try {
    const stats = await fs.stat(fullTargetPath);
    if (!stats.isDirectory()) {
      console.error(`Error: Provided path is not a directory: ${fullTargetPath}`);
      return;
    }
  } catch (error) {
    console.error(`Error: Directory not found at path: "${fullTargetPath}"`);
    console.error('Please ensure the path is correct and does not contain trailing spaces.');
    return;
  }
  // --- End Path Validation ---

  console.log(`Scanning directory: ${fullTargetPath}\n`);

  // Regex to find and simplify inter-package imports (e.g., '@esarj/lib-data/lib' -> '@esarj/lib-data').
  const libImportRegex = /from\s+['"](@esarj\/[^/]+)\/lib(\/[^'"]*)['"]/g;

  let totalFilesChanged = 0;
  let totalReplacementsMade = 0;
  let processedAtLeastOneFile = false;

  try {
    // Use fs.glob to efficiently find all TypeScript files, ignoring common build/dependency folders.
    const filesIterator = fs.glob('**/*.ts', {
      cwd: fullTargetPath,
      ignore: ['node_modules/**', '**/build/**', '**/lib/**'],
      nodir: true,
    });

    for await (const file of filesIterator) {
      processedAtLeastOneFile = true;
      const filePath = path.join(fullTargetPath, file);
      let content = await fs.readFile(filePath, 'utf-8');
      const originalContent = content;

      // Stage 1: Fix inter-package '/lib' paths.
      content = content.replace(libImportRegex, `from '$1$2'`);

      // Stage 2: Fix relative paths for ESM compliance by adding extensions.
      const lines = content.split('\n');
      const newLines = [];
      let relativePathsChangedInFile = false;

      for (const line of lines) {
        let newLine = line;

        // This regex robustly handles single-line, multi-line, and side-effect imports/exports
        // by looking for specific patterns (e.g., `import ... from`, `} from`, `import '...'`).
        // It captures the relative path in the first group.
        const importExportRegex = /(?:(?:^\s*(?:import|export).*|^\s*})\s*from|^\s*import)\s+['"](\.\.?(?:\/[^'"]*)?)['"]/;
        const match = line.match(importExportRegex);

        if (match) {
          const relativePath = match[1];

          // Only process paths that don't already have a file extension.
          if (relativePath && !path.extname(relativePath)) {
            const absolutePath = path.resolve(path.dirname(filePath), relativePath);
            let newPath = '';

            // Concurrently check for the two main resolution possibilities:
            // 1. The path is a directory containing an 'index.ts' file.
            // 2. The path is a '.ts' file that needs its extension added.
            const [indexStats, fileStats] = await Promise.all([
              fs.stat(path.join(absolutePath, 'index.ts')).catch(() => null),
              fs.stat(`${absolutePath}.ts`).catch(() => null),
            ]);

            if (indexStats && indexStats.isFile()) {
              // Case 1: Path resolves to a directory with an index file.
              // Append '/index.js' to make the import explicit.
              // e.g., '../enums' becomes '../enums/index.js'
              newPath = `${relativePath.replace(/\/$/, '')}/index.js`;
            } else if (fileStats && fileStats.isFile()) {
              // Case 2: Path resolves to a TypeScript file.
              // Append '.js' extension.
              // e.g., './utils' becomes './utils.js'
              newPath = `${relativePath}.js`;
            }

            // If a valid new path was determined, update the line.
            if (newPath) {
              newLine = line.replace(`'${relativePath}'`, `'${newPath}'`).replace(`"${relativePath}"`, `"${newPath}"`);
              relativePathsChangedInFile = true;
            }
          }
        }
        newLines.push(newLine);
      }

      if (relativePathsChangedInFile) {
        content = newLines.join('\n');
      }

      // If the content has changed, write it back to the file and log the change.
      if (content !== originalContent) {
        totalFilesChanged++;
        // Count changes by comparing original and new lines.
        const changesInFile = content.split('\n').filter((line, i) => line !== originalContent.split('\n')[i]).length || 1;
        totalReplacementsMade += changesInFile;

        await fs.writeFile(filePath, content, 'utf-8');
        console.log(`- Refactored: ${file} (~${changesInFile} changes)`);
      }
    }

    if (!processedAtLeastOneFile) {
      console.log('No TypeScript files found to process.');
      return;
    }

    // --- Final Summary ---
    console.log('\n--- Refactoring Complete ---');
    if (totalFilesChanged > 0) {
      console.log(`✅ Success! Made ~${totalReplacementsMade} replacements in ${totalFilesChanged} files.`);
    } else {
      console.log('✅ No files needed updating. All imports seem to be correct.');
    }

  } catch (error) {
    console.error('An error occurred while running the script:', error);
  }
}

refactorProjectImports().catch(console.error);
