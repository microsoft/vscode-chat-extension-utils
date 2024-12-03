/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement } from '@vscode/prompt-tsx';
import { expect } from 'chai';
import {
	ChatContext,
	ChatRequestTurn,
	ChatResponseAnchorPart,
	ChatResponseMarkdownPart,
	ChatResponseTurn,
	LanguageModelChatMessageRole,
	MarkdownString,
	Uri,
} from 'vscode';
import { HistoryMessages } from '../../components/history';
import { getResultTextWithMessageTypes, renderTestPrompt } from './test-utils';

suite('HistoryMessages', () => {
	const fakeHistory: ChatContext['history'] = [
		new (ChatRequestTurn as any)('User message 1'),
		new (ChatResponseTurn as any)([
			new ChatResponseMarkdownPart('Response 1'),
			new ChatResponseAnchorPart(Uri.parse('https://example.com'), 'Some link'),
		]),
		new (ChatRequestTurn as any)('User message 2'),
		new (ChatResponseTurn as any)([
			new ChatResponseMarkdownPart(new MarkdownString('some *markdown*')),
			new ChatResponseAnchorPart(Uri.parse('https://example.org')),
		]),
	];

	test('renders history messages correctly', async () => {
		const p = await renderTestPrompt({
			ctor: class extends PromptElement {
				render() {
					return <HistoryMessages history={fakeHistory} />;
				}
			},
			props: {},
			budget: 1000,
		});

		const expectedText = [
			`${LanguageModelChatMessageRole.User}: User message 1`,
			`${LanguageModelChatMessageRole.Assistant}: Response 1[Some link](https://example.com/)`,
			`${LanguageModelChatMessageRole.User}: User message 2`,
			`${LanguageModelChatMessageRole.Assistant}: some *markdown*https://example.org/\n`,
		];
		expect(getResultTextWithMessageTypes(p)).to.equal(expectedText.join('\n'));
	});
});
