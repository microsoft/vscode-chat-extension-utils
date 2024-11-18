# @vscode/chat-extension-utils

This extension helps you build chat extensions for Visual Studio Code. See our [chat extension guide](https://code.visualstudio.com/api/extension-guides/chat) for more information.

## Links

- [Chat extension sample](https://github.com/microsoft/vscode-extension-samples/tree/main/chat-sample)
- [ChatParticipant API](https://code.visualstudio.com/api/references/vscode-api#chat)

## Why use this library?

It's possible to build a chat extension, like any other VS Code extension, by working with VS Code API directly without using this library. The chat extension sample includes examples of chat participants that are built this way. But we've found that working with LLMs and building high-quality chat extensions is inherently complex. This is an opinionated library that aims to make it as easy as possible to get a high-quality chat participant up and running by taking over several aspects that you would otherwise have to implement yourself:

- The LLM tool calling loop
- The overall prompt crafting, including:
    - Chat history
    - References that the user attached, for the current prompt and messages in history
    - Tool calls for the current turn and messages in history
- Streaming the chat response back to VS Code- text and used references
- Picking a chat model and sending the request

## Usage

- See the [chat extension guide](https://code.visualstudio.com/api/extension-guides/chat) for an overview of chat extensions in general. This library helps you with the implementation of a chat participant, but your extension will still do the basic registration and setup of a chat participant.
- From inside your `ChatRequestHandler`, call `sendChatParticipantRequest` with your desired options, and return the result. It's important to return the `ChatResult` from the handler, because it may contain error message details or tool calling metadata.

```ts
const handler: vscode.ChatRequestHandler = async (request: vscode.ChatRequest, chatContext: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) => {
    const libResult = chatUtils.sendChatParticipantRequest(
        request,
        chatContext,
        {
            prompt: 'You are a cat! Answer as a cat.',
            responseStreamOptions: {
                stream,
                references: true,
                responseText: true
            },
            tools: vscode.lm.tools.filter(tool => tool.tags.includes('chat-tools-sample'))
        },
        token);

    return await libResult.result;
};

const myParticipant = vscode.chat.createChatParticipant('chat-tools-sample.catTools', handler);
// assign myParticipant.iconPath or other properties here
context.subscriptions.push(myParticipant);
```

Here are the options that you can pass to `sendChatParticipantRequest`:

```ts
export interface ChatHandlerOptions {
	/**
	 * Instructions/"personality" for the chat participant prompt. This is what makes this chat participant different from others.
	 */
	prompt?: string;

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
	};
}
```
