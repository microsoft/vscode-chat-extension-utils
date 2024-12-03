/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	BasePromptElementProps,
	ITokenizer,
	PromptElementCtor,
	renderPrompt,
} from '@vscode/prompt-tsx';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import { EOL, tmpdir } from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

/** Simple tokenizer used for tests */
export const charTokenizer: ITokenizer = {
	async countMessageTokens(message) {
		return (await this.tokenLength(message.content)) + 3;
	},
	tokenLength(text) {
		return Math.ceil((text.length * 3) / 4);
	},
};

export const renderTestPrompt = <P extends BasePromptElementProps>(opts: {
	ctor: PromptElementCtor<P, any>;
	props: P;
	budget: number;
}) =>
	renderPrompt(
		opts.ctor,
		opts.props,
		{ modelMaxPromptTokens: opts.budget },
		charTokenizer,
		undefined,
		undefined,
		'vscode',
	);

export const getResultText = (r: { messages: vscode.LanguageModelChatMessage[] }) => {
	let text = '';
	for (const m of r.messages) {
		for (const content of m.content) {
			if (content instanceof vscode.LanguageModelTextPart) {
				text += content.value;
			}
		}
	}

	return text;
};

export const getResultTextWithMessageTypes = (r: {
	messages: vscode.LanguageModelChatMessage[];
}) => {
	let text = '';
	for (const m of r.messages) {
		text += `${m.role}: `;
		for (const content of m.content) {
			if (content instanceof vscode.LanguageModelTextPart) {
				text += content.value;
			}
		}
		text += '\n';
	}

	return text;
};

// https://github.com/microsoft/vscode-js-debug/blob/c57467fb349a2b99073424035b3785d8381357aa/src/test/createFileTree.ts#L17
export function createFileTree(rootDir: string, tree: IFileTree) {
	fs.mkdirSync(rootDir, { recursive: true });

	for (const key of Object.keys(tree)) {
		const value = tree[key];
		const targetPath = path.join(rootDir, key);

		let write: Buffer;
		if (typeof value === 'string') {
			write = Buffer.from(value);
		} else if (value instanceof Array) {
			write = Buffer.from(value.join(EOL));
		} else {
			createFileTree(targetPath, value);
			continue;
		}

		fs.mkdirSync(path.dirname(targetPath), { recursive: true });
		fs.writeFileSync(targetPath, write);
	}
}

export interface IFileTree {
	[directoryOrFile: string]: string | string[] | IFileTree;
}

export const getTestDir = () =>
	path.join(tmpdir(), 'tsx-elements-test-' + randomBytes(6).toString('hex'));
