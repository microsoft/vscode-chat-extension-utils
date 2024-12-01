/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ChatMessage, HTMLTracer, PromptElement, PromptRenderer, toVsCodeChatMessages } from '@vscode/prompt-tsx';
import type { ReadableStreamController } from 'stream/web';
import * as vscode from 'vscode';
import {
	AdHocChatTool,
	PromptElementAndProps,
	ToolCallRound,
	ToolResultMetadata,
	ToolUserPrompt, ToolUserProps,
	TsxToolUserMetadata,
} from './toolsPrompt';

// export function replacePattern(textStream: AsyncIterable<string>, pattern: RegExp, replacement: string): AsyncIterable<string>;
// export function handlePattern(textStream: AsyncIterable<string>, pattern: RegExp, patternHandler: (match: string) => void): AsyncIterable<string>;
// export function streamPatternMatcher(textStream: AsyncIterable<string>, pattern: RegExp): AsyncIterable<{ text: string } | { match: RegExpMatchArray }>;

// ❗ This needs to be updated in README when changing.
export interface ChatHandlerOptions<T extends PromptElement = PromptElement> {
	/**
	 * Instructions/"personality" for the chat participant prompt. This is what makes this chat participant different from others.
	 */
	prompt?: string | PromptElementAndProps<T>;

	/**
	 * If not specified, the user-selected model on ChatRequest will be used.
	 */
	model?: vscode.LanguageModelChat;

	/**
	 * An optional list of tools to use for this request.
	 */
	tools?: ReadonlyArray<vscode.LanguageModelChatTool | AdHocChatTool<object>>;

	/**
	 * See {@link vscode.LanguageModelChatRequestOptions.justification}
	 */
	requestJustification?: string;

	/**
	 * sendChatParticipantRequest returns a response stream, and the caller can handle streaming the response,
	 * or use this option to enable sendChatParticipantRequest to stream the response back to VS Code.
	 */
	responseStreamOptions?: {
		stream: vscode.ChatResponseStream;
		references?: boolean;
		responseText?: boolean;
	};

	/**
	 * If you provide this from {@link vscode.ExtensionContext}, then a trace of the rendered prompt will be served.
	 * If {@link ChatHandlerOptions.responseStreamOptions.stream} is provided, a link to the trace will be added to the response.
	 * Otherwise, the link will be logged to the console.
	 */
	extensionMode?: vscode.ExtensionMode;
}

export interface ChatHandlerResult {
	result: Promise<vscode.ChatResult>;
	stream: AsyncIterable<vscode.LanguageModelTextPart | vscode.LanguageModelToolResult>;
}

/**
 * Send a chat request, do the tool calling loop if needed, and return a stream and a ChatResult. Caller handles the response stream.
 */
export function sendChatParticipantRequest(
	request: vscode.ChatRequest,
	context: vscode.ChatContext,
	options: ChatHandlerOptions,
	token: vscode.CancellationToken,
): ChatHandlerResult {
	let promise: Promise<vscode.ChatResult>;

	const readable = new ReadableStream<
		vscode.LanguageModelTextPart | vscode.LanguageModelToolResult
	>({
		start(controller) {
			promise = _sendChatParticipantRequest(controller, request, context, options, token);
			return promise;
		},
	});

	return {
		result: promise!,
		stream: readable,
	};
}

async function _sendChatParticipantRequest(
	stream: ReadableStreamController<vscode.LanguageModelTextPart | vscode.LanguageModelToolResult>,
	request: vscode.ChatRequest,
	context: vscode.ChatContext,
	options: ChatHandlerOptions,
	token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
	let model = options.model ?? request.model;
	if (options.tools?.length && model.vendor === 'copilot' && model.family.startsWith('o1')) {
		// The o1 models do not currently support tools
		const models = await vscode.lm.selectChatModels({
			vendor: 'copilot',
			family: 'gpt-4o',
		});
		model = models[0];
	}

	// Use all tools, or tools with the tags that are relevant.
	const tools = options.tools;
	const requestOptions: vscode.LanguageModelChatRequestOptions = {
		justification: options.requestJustification,
	};

	// Render the initial prompt
	const result = await renderToolUserPrompt(
		model,
		{
			context,
			request,
			toolCallRounds: [],
			toolCallResults: {},
			libUserPrompt: options.prompt,
			tools,
		},
		options.responseStreamOptions?.stream,
		options.extensionMode === vscode.ExtensionMode.Development);
	let messages = toVsCodeChatMessages(result.messages);
	result.references.forEach(ref => {
		if (ref.anchor instanceof vscode.Uri || ref.anchor instanceof vscode.Location) {
			if (options.responseStreamOptions?.references) {
				options.responseStreamOptions?.stream.reference(ref.anchor);
			}
		}
	});

	const toolReferences = [...request.toolReferences];
	const accumulatedToolResults: Record<string, vscode.LanguageModelToolResult> = {};
	const toolCallRounds: ToolCallRound[] = [];
	const runWithTools = async (): Promise<void> => {
		// If a toolReference is present, force the model to call that tool
		const requestedTool = toolReferences.shift();
		if (requestedTool) {
			requestOptions.toolMode = vscode.LanguageModelChatToolMode.Required;
			requestOptions.tools = vscode.lm.tools.filter(tool => tool.name === requestedTool.name);
		} else {
			requestOptions.toolMode = undefined;
			requestOptions.tools = tools ? [...tools] : undefined;
		}

		// Send the request to the LanguageModelChat
		const response = await model.sendRequest(messages, requestOptions, token);

		// Stream text output and collect tool calls from the response
		const toolCalls: vscode.LanguageModelToolCallPart[] = [];
		let responseStr = '';
		for await (const part of response.stream) {
			if (part instanceof vscode.LanguageModelTextPart) {
				stream.enqueue(part);
				responseStr += part.value;

				if (options.responseStreamOptions?.responseText) {
					options.responseStreamOptions.stream.markdown(part.value);
				}
			} else if (part instanceof vscode.LanguageModelToolCallPart) {
				toolCalls.push(part);
			}
		}

		if (toolCalls.length) {
			// If the model called any tools, then we do another round- render the prompt with those tool calls (rendering the PromptElements will invoke the tools)
			// and include the tool results in the prompt for the next request.
			toolCallRounds.push({
				response: responseStr,
				toolCalls,
			});
			const result = await renderToolUserPrompt(
				model,
				{
					context,
					request,
					toolCallRounds,
					toolCallResults: accumulatedToolResults,
					libUserPrompt: options.prompt,
					tools,
				},
				options.responseStreamOptions?.stream,
				options.extensionMode === vscode.ExtensionMode.Development);
			messages = toVsCodeChatMessages(result.messages);
			const toolResultMetadata = result.metadata.getAll(ToolResultMetadata);
			if (toolResultMetadata?.length) {
				// Cache tool results for later, so they can be incorporated into later prompts without calling the tool again
				toolResultMetadata.forEach(meta => (accumulatedToolResults[meta.toolCallId] = meta.result));
			}

			// This loops until the model doesn't want to call any more tools, then the request is done.
			return runWithTools();
		}
	};

	await runWithTools();

	return {
		metadata: {
			// Return tool call metadata so it can be used in prompt history on the next request
			toolCallsMetadata: {
				toolCallResults: accumulatedToolResults,
				toolCallRounds,
			},
		} satisfies TsxToolUserMetadata,
	};
}

async function renderToolUserPrompt(chat: vscode.LanguageModelChat, props: ToolUserProps, stream: vscode.ChatResponseStream | undefined, serveTrace: boolean) {
	const renderer = new PromptRenderer({ modelMaxPromptTokens: chat.maxInputTokens }, ToolUserPrompt, props, {
		tokenLength: async (text, _token) => {
			return chat.countTokens(text);
		},
		countMessageTokens: async (message: ChatMessage) => {
			return chat.countTokens(message.content);
		}
	});
	const tracer = new HTMLTracer();
	renderer.tracer = tracer;
	const result = await renderer.render();
	if (serveTrace) {
		const server = await tracer.serveHTML();
		if (stream) {
			const md = new vscode.MarkdownString('$(info) [View prompt trace](' + server.address + ')');
			md.supportThemeIcons = true;
			stream.markdown(md);
		} else {
			console.log('Prompt trace address:', server.address);
		}
	}

	return result;
}