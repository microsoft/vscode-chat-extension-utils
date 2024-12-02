/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { join } from 'path';
import * as ts from 'typescript';

const VS_ROOT = join(__dirname, '../../vscode/src');
const TARGET = join(__dirname, '../src/util/vs');

/**
 * Returns the absolute file path where the given file should be placed.
 */
function determineTargetPath(absoluteVSCodeFilePath: string): string {
	const vsRelative = path.relative(VS_ROOT, absoluteVSCodeFilePath);

	const segements = vsRelative.split(path.sep);

	if (segements[0] === 'typings' || segements[0] === 'vs') {
		segements.shift();
	}

	return join(TARGET, segements.join(path.sep));
}

/**
 * Returns the relative path of `importedFilePath` to `currentFilePath` in a format suitable for import statements.
 */
function createRelativeImportPath(currentFilePath: string, importedFilePath: string): string {
	const relativePath = path.relative(path.dirname(currentFilePath), importedFilePath);
	const result = relativePath.startsWith('.') ? relativePath : './' + relativePath;
	return result.replace(/\.ts$/, '');
}

async function doIt(filepaths: string[]) {
	try {
		await fs.promises.access(VS_ROOT);
	} catch {
		console.error(`❌ VS Code root not found at ${VS_ROOT}`);
		process.exit(1);
	}

	try {
		await fs.promises.rm(join(TARGET), { recursive: true });
	} catch {
		// ignore
	}

	type Edit = ts.TextRange & { newText: string };
	type File = { sourceFilePath: string; targetFilePath: string; contents: string };

	const seen = new Map<string, File>(); // indexed by sourceFilePath
	const stack = [...filepaths.map(p => join(VS_ROOT, p))];

	while (stack.length > 0) {
		const filepath = stack.pop()!;
		if (seen.has(filepath)) {
			continue;
		}

		const edits: Edit[] = [];
		const source = String(await fs.promises.readFile(filepath));

		const destinationFilePath = determineTargetPath(filepath);
		const info = ts.preProcessFile(source, true, true);
		for (const importedFile of info.importedFiles) {
			let absolutePath: string | undefined;
			if (importedFile.fileName.startsWith('.')) {
				absolutePath = join(filepath, '..', importedFile.fileName.replace(/\.js$/, '.ts'));
			} else if (importedFile.fileName.includes('/')) {
				absolutePath = join(VS_ROOT, importedFile.fileName.replace(/\.js$/, '.ts'));
			}

			if (absolutePath) {
				stack.push(absolutePath);

				edits.push({
					...importedFile,
					newText: createRelativeImportPath(destinationFilePath, determineTargetPath(absolutePath)),
				});
			}

			// console.log(`${filepath} <<<imports<<< ${absolutePath}`);
		}

		let newSource = source;

		for (const edit of edits.sort((a, b) => b.pos - a.pos)) {
			newSource = newSource.slice(0, edit.pos + 1) + edit.newText + newSource.slice(edit.end + 1);
		}

		if (filepath.endsWith('src/vs/nls.ts')) {
			newSource = 'declare var document: any;\n\n' + newSource;
		}
		newSource = "//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'\n\n" + newSource;

		seen.set(filepath, {
			sourceFilePath: filepath,
			targetFilePath: destinationFilePath,
			contents: newSource,
		});
	}

	for (const [_, file] of seen) {
		const targetFilepath = file.targetFilePath;

		await fs.promises.mkdir(join(targetFilepath, '..'), { recursive: true });
		await fs.promises.writeFile(targetFilepath, file.contents);
	}

	console.log(
		`✅ done, copied ${filepaths.length} files and ${seen.size - filepaths.length} dependencies`,
	);
}

doIt([
	// ********************************************
	// add modules from `base` here and
	// run `npx tsx script/copySources.ts`
	// ********************************************
	'vs/base/common/lazy.ts',
]).catch(err => {
	console.error(err);
});
