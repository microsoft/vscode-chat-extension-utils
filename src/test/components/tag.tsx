/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, UserMessage } from '@vscode/prompt-tsx';
import { expect } from 'chai';
import { Tag } from '../../components/tag';
import { getResultText, renderTestPrompt } from './test-utils';

suite('Tag', () => {
	const atBudgets = [
		{ budget: 1000, text: '<hello>\nQui culpa do consectetur amet.\n</hello>' },
		{ budget: 30, text: '<hello>\nconsectetur amet.\n</hello>' },
		{ budget: 10, text: '</hello>' },
	];

	for (const { budget, text } of atBudgets) {
		test(`budget ${budget}`, async () => {
			const p = await renderTestPrompt({
				ctor: class extends PromptElement {
					render() {
						return (
							<UserMessage>
								<Tag name="hello">
									{'Qui '}
									{'culpa '}
									{'do '}
									{'consectetur '}
									{'amet.'}
								</Tag>
							</UserMessage>
						);
					}
				},
				props: {},
				budget,
			});

			expect(getResultText(p)).to.equal(text);
		});
	}
});
