/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, UserMessage } from '@vscode/prompt-tsx';
import { expect } from 'chai';
import { rmSync } from 'fs';
import * as vscode from 'vscode';
import {
	FileTree,
	FileTreeMetadata,
	IFileTreeProps,
	ParsedTextFileTree,
} from '../../components/file-tree';
import { createFileTree, getResultText, getTestDir, renderTestPrompt } from './test-utils';

suite('FileTree', () => {
	const testDir = getTestDir();
	suiteSetup(async () => {
		createFileTree(testDir, {
			src: {
				'foo.js': '',
				'bar.js': '',
				baz: {
					'qux.js': '',
					'quux.js': '',
					corge: {
						'grault.js': '',
					},
				},
				grault: {
					'garply.js': '',
				},
			},
			test: {
				'test1.js': '',
				'test2.js': '',
			},
			'package.json': '',
			'README.md': '',
			docs: {
				'index.md': '',
				'setup.md': '',
			},
		});
	});

	suiteTeardown(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	const testCases: {
		budget: number;
		props: IFileTreeProps;
		expected: string;
		noFiles?: boolean;
	}[] = [
		{
			budget: 100,
			props: { root: vscode.Uri.file(testDir) },
			expected: `
\`\`\`
docs/
\tindex.md
\tsetup.md
package.json
README.md
src/
\tbar.js
\tbaz/
\tfoo.js
\tgrault/
test/
\ttest1.js
\ttest2.js
\`\`\`
      `,
		},
		{
			budget: 100_000,
			props: {
				root: vscode.Uri.file(testDir),
				ignore: uris => uris.filter(u => u.path.includes('corge')),
			},
			expected: `
\`\`\`
docs/
\tindex.md
\tsetup.md
package.json
README.md
src/
\tbar.js
\tbaz/
\t\tquux.js
\t\tqux.js
\tfoo.js
\tgrault/
\t\tgarply.js
test/
\ttest1.js
\ttest2.js
\`\`\`
      `,
		},
		{
			budget: 50,
			props: { root: vscode.Uri.file(testDir), focusOn: vscode.Uri.file(`${testDir}/src`) },
			expected: `
\`\`\`
src/
\tbar.js
\tbaz/
\t\tcorge/
\tfoo.js
\tgrault/
\`\`\`
      `,
		},
		{
			budget: 30,
			props: { root: vscode.Uri.file(testDir), focusOn: vscode.Uri.file(`${testDir}/src/baz`) },
			noFiles: true,
			expected: `
\`\`\`
src/
\tbaz/
\t\tcorge/
\`\`\`
      `,
		},
		{
			budget: 40,
			props: { root: vscode.Uri.file(testDir), focusOn: vscode.Uri.file(`${testDir}/src/baz`) },
			expected: `
\`\`\`
src/
\tbaz/
\t\tcorge/
\t\tquux.js
\t\tqux.js
\`\`\`
      `,
		},
		{
			budget: 50,
			props: { root: vscode.Uri.file(testDir), focusOn: vscode.Uri.file(`${testDir}/src/baz`) },
			expected: `
\`\`\`
src/
\tbaz/
\t\tcorge/
\t\t\tgrault.js
\t\tquux.js
\t\tqux.js
\`\`\`
      `,
		},
		{
			budget: 60,
			props: { root: vscode.Uri.file(testDir), focusOn: vscode.Uri.file(`${testDir}/src/baz`) },
			expected: `
\`\`\`
src/
\tbar.js
\tbaz/
\t\tcorge/
\t\t\tgrault.js
\t\tquux.js
\t\tqux.js
\`\`\`
      `,
		},
		{
			budget: 100_000,
			props: { root: vscode.Uri.file(testDir), focusOn: vscode.Uri.file(`${testDir}/src/baz`) },
			expected: `
\`\`\`
docs/
\tindex.md
\tsetup.md
package.json
README.md
src/
\tbar.js
\tbaz/
\t\tcorge/
\t\t\tgrault.js
\t\tquux.js
\t\tqux.js
\tfoo.js
\tgrault/
\t\tgarply.js
test/
\ttest1.js
\ttest2.js
\`\`\`
      `,
		},
	];

	for (const { budget, props, expected, noFiles } of testCases) {
		test(`budget ${budget}, focus ${props.focusOn?.path.split('/').pop() || 'none'}`, async () => {
			const p = await renderTestPrompt({
				ctor: class extends PromptElement {
					render() {
						return (
							<UserMessage>
								<FileTree {...props} />
							</UserMessage>
						);
					}
				},
				props: {},
				budget,
			});

			if (getResultText(p).trim() !== expected.trim()) {
				console.log(getResultText(p).replaceAll('\t', '\\t').replaceAll('`', '\\`'));
			}

			const text = getResultText(p).trim();
			expect(text).to.equal(expected.trim());

			const meta = p.metadata.get(FileTreeMetadata);
			if (noFiles) {
				expect([...meta!.files()]).to.have.length(0);
			} else {
				expect([...meta!.files()]).to.have.length.above(0);
			}
			// expect no pruning to have happened.
			for (const file of meta!.files()) {
				expect(text).to.include(file.path.split('/').pop());
			}
		});
	}

	suite('parse', () => {
		test('parses empty', () => {
			expect(FileTree.parseText('')).to.deep.equal([]);
		});

		test('parses single', () => {
			expect(FileTree.parseText('src')).to.deep.equal([{ name: 'src' }]);
		});

		test('parses simple', () => {
			expect(FileTree.parseText('src\n\tbar.js')).to.deep.equal([
				{ name: 'src', children: [{ name: 'bar.js' }] },
			]);
		});

		test('parses URIs', () => {
			const root = vscode.Uri.file('/root');
			expect(FileTree.parseUris(root, 'src\n\tbar.js')).to.deep.equal([
				{
					uri: vscode.Uri.joinPath(root, 'src'),
					children: [{ uri: vscode.Uri.joinPath(root, 'src', 'bar.js') }],
				},
			]);
		});

		test('parses full', () => {
			const input = `
docs/
\tindex.md
\tsetup.md
package.json
README.md
src/
\tbar.js
\tbaz/
\t\tcorge/
\t\t\tgrault.js
\t\tquux.js
\t\tqux.js
\tfoo.js
\tgrault/
\t\tgarply.js
test/
\ttest1.js
\ttest2.js
`;

			const expected: ParsedTextFileTree[] = [
				{ name: 'docs', children: [{ name: 'index.md' }, { name: 'setup.md' }] },
				{ name: 'package.json' },
				{ name: 'README.md' },
				{
					name: 'src',
					children: [
						{ name: 'bar.js' },
						{
							name: 'baz',
							children: [
								{ name: 'corge', children: [{ name: 'grault.js' }] },
								{ name: 'quux.js' },
								{ name: 'qux.js' },
							],
						},
						{ name: 'foo.js' },
						{ name: 'grault', children: [{ name: 'garply.js' }] },
					],
				},
				{ name: 'test', children: [{ name: 'test1.js' }, { name: 'test2.js' }] },
			];

			expect(FileTree.parseText(input)).to.deep.equal(expected);
			expect(
				FileTree.parseText(input.replaceAll('\t', '  ').replaceAll('\n', '\r\n')),
			).to.deep.equal(expected);
		});
	});
});
