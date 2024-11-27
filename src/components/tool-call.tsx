/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	BasePromptElementProps,
	PromptElement,
	PromptMetadata,
	PromptPiece,
	PromptSizing,
	ToolMessage,
	ToolResult,
} from '@vscode/prompt-tsx';
import * as vscode from 'vscode';

export interface IToolCallElementProps extends BasePromptElementProps {
	call: vscode.LanguageModelToolCallPart;
	invocationToken: vscode.ChatParticipantToolToken | undefined;
	/** Optionally pre-fill the result from an existing call. */
	result?: vscode.LanguageModelToolResult;
}

/**
 * An element that can be included in your prompt to call a tool and include
 * its invocation result in the prompt. This element *is* responsive to the
 * token budget, so you should generally use this with a `flexGrow` value.
 * See https://github.com/microsoft/vscode-prompt-tsx?tab=readme-ov-file#flex-behavior
 *
 * To use this, you generally first build your prompt and make a request and
 * include the available tools, for example:
 *
 * ```
 * const options: vscode.LanguageModelChatRequestOptions = {
 *     justification: 'To collaborate on diagrams',
 * };
 *
 * options.tools = vscode.lm.tools.map((tool): vscode.LanguageModelChatTool => {
 *     return {
 *         name: tool.name,
 *         description: tool.description,
 *         inputSchema: tool.inputSchema ?? {}
 *     };
 * });
 *
 * // ...
 * const response = makeRequestWithOptions(options);
 * ```
 *
 * If the response contains {@link vscode.LanguageModelToolCallPart}, then you
 * should re-send the prompt with a {@link ToolCall} element for each of those.
 *
 * ```
 * class MyElement extends PromptElement<IProps> {
 *    render() {
 *       return (
 *         <UserMessage>
 *           // ...
 *         </UserMessage>
 *         {this.props.toolCalls.map(call => <ToolCall call={call} invokationToken={chatRequest.toolInvocationToken} />)}
 *      );
 *    }
 * }
 * ```
 *
 * This element will automatically call `vscode.lm.invokeTool` and include
 * the result appropriately.
 */
export class ToolCall extends PromptElement<IToolCallElementProps, void> {
	async render(
		_state: void,
		sizing: PromptSizing,
		_progress: unknown,
		token: vscode.CancellationToken,
	): Promise<PromptPiece | undefined> {
		const tool = vscode.lm.tools.find(t => t.name === this.props.call.name);
		if (!tool) {
			return <ToolMessage toolCallId={this.props.call.callId}>Tool not found</ToolMessage>;
		}

		const tokenizationOptions: vscode.LanguageModelToolTokenizationOptions = {
			tokenBudget: sizing.tokenBudget,
			countTokens: async (content: string) => sizing.countTokens(content),
		};

		const toolResult =
			this.props.result ||
			(await vscode.lm.invokeTool(
				this.props.call.name,
				{
					input: this.props.call.input,
					toolInvocationToken: this.props.invocationToken,
					tokenizationOptions,
				},
				token,
			));

		return (
			<ToolMessage toolCallId={this.props.call.callId}>
				<meta value={new ToolResultMetadata(this.props.call.callId, toolResult)} local />
				<ToolResult data={toolResult} />
			</ToolMessage>
		);
	}
}

/** Metadata returned for each tool call. */
export class ToolResultMetadata extends PromptMetadata {
	constructor(
		public readonly toolCallId: string,
		public readonly result: vscode.LanguageModelToolResult,
	) {
		super();
	}
}
