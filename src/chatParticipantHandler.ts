/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, renderPrompt } from '@vscode/prompt-tsx';
import * as vscode from 'vscode';
import { ToolCallRound, ToolResultMetadata, ToolUserPrompt, TsxToolUserMetadata } from './toolsPrompt';
import { AsyncIterableSource } from './util/vs/base/common/async';

export interface AdHocChatTool extends vscode.LanguageModelChatTool {
    run(): string;
}

// export function replacePattern(textStream: AsyncIterable<string>, pattern: RegExp, replacement: string): AsyncIterable<string>;
// export function handlePattern(textStream: AsyncIterable<string>, pattern: RegExp, patternHandler: (match: string) => void): AsyncIterable<string>;
// export function streamPatternMatcher(textStream: AsyncIterable<string>, pattern: RegExp): AsyncIterable<{ text: string } | { match: RegExpMatchArray }>;

export interface ChatHandlerOptions {
    /**
     * Instructions/"personality" for the chat participant prompt. This is what makes this chat participant different from others.
     */
    prompt: string | PromptElement;

    /**
     * If not specified, the user-selected model on ChatRequest will be used.
     */
    model?: vscode.LanguageModelChat;

    /**
     * An optional list of tools to use for this request.
     */
    tools?: ReadonlyArray<vscode.LanguageModelChatTool | AdHocChatTool>;

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
    }
}

export interface ChatHandlerResult {
    result: Promise<vscode.ChatResult>;
    stream: AsyncIterable<vscode.LanguageModelTextPart | vscode.LanguageModelToolResult>;
}

/**
 * Send a chat request, do the tool calling loop if needed, and return a stream and a ChatResult. Caller handles the response stream.
 */
export function sendChatParticipantRequest(request: vscode.ChatRequest, context: vscode.ChatContext, options: ChatHandlerOptions, token: vscode.CancellationToken): ChatHandlerResult {
    const stream = new AsyncIterableSource<vscode.LanguageModelTextPart | vscode.LanguageModelToolResult>();
    const resultPromise = _sendChatParticipantRequest(stream, request, context, options, token);
    return {
        result: resultPromise,
        stream: stream.asyncIterable,
    };
}

async function _sendChatParticipantRequest(stream: AsyncIterableSource<vscode.LanguageModelTextPart | vscode.LanguageModelToolResult>, request: vscode.ChatRequest, context: vscode.ChatContext, options: ChatHandlerOptions, token: vscode.CancellationToken): Promise<vscode.ChatResult> {
    let model = options.model ?? request.model;
    if (options.tools?.length && model.vendor === 'copilot' && model.family.startsWith('o1')) {
        // The o1 models do not currently support tools
        const models = await vscode.lm.selectChatModels({
            vendor: 'copilot',
            family: 'gpt-4o'
        });
        model = models[0];
    }

    // Use all tools, or tools with the tags that are relevant.
    const tools = options.tools;
    const requestOptions: vscode.LanguageModelChatRequestOptions = {
        justification: options.requestJustification,
    };

    // Render the initial prompt
    const result = await renderPrompt(
        ToolUserPrompt,
        {
            context,
            request,
            toolCallRounds: [],
            toolCallResults: {},
            libUserPrompt: options.prompt
        },
        { modelMaxPromptTokens: model.maxInputTokens },
        model);
    let messages = result.messages;
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
                stream.emitOne(part);
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
                toolCalls
            });
            const result = (await renderPrompt(
                ToolUserPrompt,
                {
                    context,
                    request,
                    toolCallRounds,
                    toolCallResults: accumulatedToolResults,
                    libUserPrompt: options.prompt
                },
                { modelMaxPromptTokens: model.maxInputTokens },
                model));
            messages = result.messages;
            const toolResultMetadata = result.metadatas.getAll(ToolResultMetadata);
            if (toolResultMetadata?.length) {
                // Cache tool results for later, so they can be incorporated into later prompts without calling the tool again
                toolResultMetadata.forEach(meta => accumulatedToolResults[meta.toolCallId] = meta.result);
            }

            // This loops until the model doesn't want to call any more tools, then the request is done.
            return runWithTools();
        }
    };

    await runWithTools();

    stream.resolve();
    return {
        metadata: {
            // Return tool call metadata so it can be used in prompt history on the next request
            toolCallsMetadata: {
                toolCallResults: accumulatedToolResults,
                toolCallRounds
            }
        } satisfies TsxToolUserMetadata,
    };
}
