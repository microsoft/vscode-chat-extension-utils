/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	BasePromptElementProps,
	PromptElement,
	SystemMessage,
	UserMessage,
} from '@vscode/prompt-tsx';
import { ChatContext } from 'vscode';
import { History, HistoryMessages } from '../components/history';

interface IMyPromptProps extends BasePromptElementProps {
	history: ChatContext['history'];
	userQuery: string;
}

/**
 * Including conversation history in your prompt is important as it allows the
 * user to ask followup questions to previous messages. However, you want to
 * make sure its priority is treated appropriately because history can
 * grow very large over time.
 *
 * We've found that the pattern which makes the most sense is usually to prioritize, in order:
 *
 * 1. The base prompt instructions, then
 * 1. The current user query, then
 * 1. The last couple turns of chat history, then
 * 1. Any supporting data, then
 * 1. As much of the remaining history as you can fit.
 *
 * For this reason, we split the history in two parts in the prompt, where
 * recent prompt turns are prioritized above general contextual information.
 */
export class MyPrompt extends PromptElement<IMyPromptProps> {
	render() {
		return (
			<>
				<SystemMessage priority={100}>
					Here are your base instructions. They have the highest priority because you want to make
					sure they're always included!
				</SystemMessage>

				{/* The remainder of the history has the lowest priority since it's less relevant */}
				<HistoryMessages history={this.props.history.slice(0, -2)} priority={0} />
				{/* The last 2 history messages are preferred over any workspace context we have vlow */}
				<HistoryMessages history={this.props.history.slice(-2)} priority={80} />

				{/* _INSTEAD OF_ the last two elements, you could instead use the <History> wrapper with passPriority: */}
				<History history={this.props.history} newer={80} older={0} passPriority />

				{/* The user query is right behind the system message in priority */}
				<UserMessage priority={90}>{this.props.userQuery}</UserMessage>
				<UserMessage priority={70}>
					With a slightly lower priority, you can include some contextual data about the workspace
					or files here...
				</UserMessage>
			</>
		);
	}
}
