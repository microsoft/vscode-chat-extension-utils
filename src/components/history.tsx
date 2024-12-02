/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	AssistantMessage,
	BasePromptElementProps,
	PrioritizedList,
	PromptElement,
	PromptPiece,
	UserMessage,
} from '@vscode/prompt-tsx';
import {
	ChatContext,
	ChatRequestTurn,
	ChatResponseAnchorPart,
	ChatResponseMarkdownPart,
	ChatResponseTurn,
	Uri,
} from 'vscode';

export interface IHistoryProps extends BasePromptElementProps {
	history: ChatContext['history'];
	/**
	 * Optional function to render a chat request/response. By default messages
	 * are rendered using simple markdown, and only markdown responses are rendered.
	 */
	renderTurn?: (turn: ChatRequestTurn | ChatResponseTurn) => PromptPiece;
	/**
	 * Number of messages to put at the "newer" priority, defaults to 2.
	 */
	n?: number;
	/**
	 * Priority value for the last `n` messages
	 */
	newer: number;
	/**
	 * Priority value for any older messages.
	 */
	older: number;
	/**
	 * Require consumers to pass priority so that the two values work:
	 * https://github.com/microsoft/vscode-prompt-tsx?tab=readme-ov-file#passing-priority
	 */
	passPriority: true; // require this prop be set!
}

/**
 * This shows a list of history messages with more recent history messages
 * at a higher priority than older messages.
 *
 * `prompt-tsx` has a `passPriority` attribute which allows an element to act
 * as a 'pass-through' container, so that its children are pruned as if they
 * were direct children of the parent. With this component, the elements:
 *
 * ```
 * <HistoryMessages history={history.slice(0, -2)} priority={0} />
 * <HistoryMessages history={history.slice(-2)} priority={80} />
 * ```
 *
 * ...can equivalently be expressed as:
 *
 * ```
 * <History history={history} passPriority older={0} recentPriority={80} />
 * ```
 */
export class History extends PromptElement<IHistoryProps> {
	render(): PromptPiece {
		const { n = 2, older, newer, history } = this.props;
		return (
			<>
				<HistoryMessages history={history.slice(0, -n)} priority={older} />
				<HistoryMessages history={history.slice(-n)} priority={newer} />
			</>
		);
	}
}

export interface IHistoryMessagesProps extends BasePromptElementProps {
	history: ChatContext['history'];
	/**
	 * Optional function to render a chat request/response. By default messages
	 * are rendered using simple markdown, and only markdown responses are rendered.
	 */
	renderTurn?: (turn: ChatRequestTurn | ChatResponseTurn) => PromptPiece;
}

/**
 * The History element simply lists user and assistant messages from the chat
 * context. If things like tool calls or file trees are relevant for, your
 * case, you can make this element more complex to handle those cases.
 */
export class HistoryMessages extends PromptElement<IHistoryMessagesProps> {
	render(): PromptPiece {
		return (
			<PrioritizedList priority={0} descending={false}>
				{this.props.history.map(this.props.renderTurn || defaultRenderTurn)}
			</PrioritizedList>
		);
	}
}

const defaultRenderTurn = (turn: ChatRequestTurn | ChatResponseTurn): PromptPiece => {
	if (turn instanceof ChatRequestTurn) {
		return <UserMessage>{turn.prompt}</UserMessage>;
	} else if (turn instanceof ChatResponseTurn) {
		return <AssistantMessage>{chatResponseToMarkdown(turn)}</AssistantMessage>;
	} else {
		return <></>;
	}
};

const chatResponseToMarkdown = (response: ChatResponseTurn) => {
	let str = '';
	for (const part of response.response) {
		if (part instanceof ChatResponseMarkdownPart) {
			str += part.value.value;
		} else if (part instanceof ChatResponseAnchorPart) {
			if (part.title) {
				str += `[${part.title}](`;
			}
			const uri = part.value instanceof Uri ? part.value : part.value.uri;
			if (uri.scheme === 'file') {
				str += uri.fsPath;
			} else {
				str += uri.toString();
			}
			if (part.title) {
				str += ')';
			}
		}
	}

	return str;
};
