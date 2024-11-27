/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, UserMessage } from '@vscode/prompt-tsx';
import { expect } from 'chai';
import * as vscode from 'vscode';
import { FilesContext } from '../../components/file-context';
import { getResultText, renderTestPrompt } from './test-utils';

suite('FilesContents', () => {
	let doc: vscode.TextDocument;
	suiteSetup(async () => {
		doc = await vscode.workspace.openTextDocument();

		const edit = new vscode.WorkspaceEdit();
		const lines = Array.from({ length: 1000 }, (_, i) => `${i}: lorem ipsum`).join('\n');
		edit.insert(doc.uri, new vscode.Position(0, 0), lines);
		await vscode.workspace.applyEdit(edit);
	});

	const assertIncludesLines = (
		m: { messages: vscode.LanguageModelChatMessage[] },
		start: number,
		end: number,
	) => {
		const text = getResultText(m);
		const lines = [...text.matchAll(/(\d+):/g)];
		expect(`${lines[0][1]}-${lines[lines.length - 1][1]}`).to.equal(`${start}-${end}`);
	};

	const atBudgets = [
		{ budget: 200, range: [494, 506] },
		{ budget: 400, range: [486, 514] },
		{ budget: 10000000, range: [0, 999] },
	];

	for (const { budget, range } of atBudgets) {
		test(`budget ${budget}`, async () => {
			const p = await renderTestPrompt({
				ctor: class extends PromptElement {
					render() {
						return (
							<UserMessage>
								<FilesContext files={[{ value: doc, range: new vscode.Range(490, 0, 510, 0) }]} />
							</UserMessage>
						);
					}
				},
				props: {},
				budget,
			});

			assertIncludesLines(p, range[0], range[1]);
		});
	}

	test(`does not expand if expansion is turned off`, async () => {
		const p = await renderTestPrompt({
			ctor: class extends PromptElement {
				render() {
					return (
						<UserMessage>
							<FilesContext
								files={{ value: doc, range: new vscode.Range(490, 0, 510, 0), expand: false }}
							/>
						</UserMessage>
					);
				}
			},
			props: {},
			budget: 100_000,
		});

		assertIncludesLines(p, 490, 510);
	});

	test(`reads a file URI and sets labels`, async () => {
		const p = await renderTestPrompt({
			ctor: class extends PromptElement {
				render() {
					return (
						<UserMessage>
							<FilesContext files={{ value: vscode.Uri.file(__filename), label: 'foo!' }} />
						</UserMessage>
					);
				}
			},
			props: {},
			budget: 100_000,
		});

		expect(getResultText(p)).to.include('# foo!\n');
		expect(getResultText(p)).to.include('reads a file URI');
	});
});
