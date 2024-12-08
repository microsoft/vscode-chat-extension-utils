# @vscode/chat-extension-utils

This extension helps you build chat extensions for Visual Studio Code by simplifying request flows and providing elements to make building prompts easier. See our [chat extension guide](https://code.visualstudio.com/api/extension-guides/chat) for more information.

- [Participant Request Handlers](#participant-request-handlers)
- [Components](#components)
  - [File Context](#file-context)
  - [History](#history)
  - [Tags](#tags)
  - [Tool Calls](#tool-calls)
  - [File Tree](#file-tree)

### Links

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

### Participant Request Handlers

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
	 * sendChatParticipantRequest returns a response stream, and the caller can handle streaming the response, or this option can
	 * be used to enable sendChatParticipantRequest to stream the response back to VS Code. In that case, the chat participant
	 * code doesn't have to handle the stream to return a chat response to VS Code.
	 */
	responseStreamOptions?: {
		/**
		 * The chat participant's stream, passed to the {@link vscode.ChatRequestHandler}.
		 */
		stream: vscode.ChatResponseStream;

		/**
		 * If true, sendChatParticipantRequest will automatically send references to the response stream.
		 * @see {@link vscode.ChatResponseReferencePart}.
		 */
		references?: boolean;

		/**
		 * If true, sendChatParticipantRequest will automatically send the text response to the response stream.
		 * @see {@link vscode.ChatResponseMarkdownPart}.
		 */
		responseText?: boolean;
	};

	/**
	 * Provide this from {@link vscode.ExtensionContext} so that sendChatParticipantRequest can check whether your extension is
	 * running in debug mode. If it is, then a trace of the rendered prompt will be served. This trace is useful for seeing the
	 * final prompt and understanding how it was rendered.
	 *
	 * If {@link ChatHandlerOptions.responseStreamOptions.stream} is also provided, a link to the trace will be added to the
	 * response. Otherwise, the link to the trace will be logged to the console.
	 */
	extensionMode?: vscode.ExtensionMode;
}
```

### Components

#### File Context

The `FilesContext` component includes the contents of the files provided to it, centered around the given ranges. It expands the files line-by-line until the budget is exhausted or the entire file contents are included. This component is particularly useful for displaying relevant portions of files in a prompt, allowing for a focused view on specific ranges within the files.

Because this element is responsive to its budget, you will generally want to use it in tandem with [prompt-tsx's flex features](https://github.com/microsoft/vscode-prompt-tsx?tab=readme-ov-file#flex-behavior).

##### Props

- `files`: An object or array of objects containing:
  - the `document` (a `vscode.TextDocument`, `Uri`, `Location`, or `string` to include) and
  - an optional `range` (a `vscode.Range` to focus on within the document),
  - an optional `label` string if you'd prefer not to use the file path as the label and,
  - an optional `expand` boolean (defaults to true) to control whether contents outside the file `range` may be included.

##### Behavior

- The component starts by wrapping each file in markdown-style code fences, including their parts.
- It then iteratively adds lines from each file, alternating between lines above and below the specified range, until the token budget is exhausted or the entire file is included.

##### Usage Example

```tsx
import { FilesContext } from '@vscode/chat-extension-utils';

const files = [
	{ document: myDocument, range: new vscode.Range(0, 0, 10, 0) },
	// ...other files
];

<FilesContext files={files} />;
```

#### History

The `History` component shows a list of history messages with more recent messages at a higher priority than older messages. This component is useful for displaying a chronological list of chat messages, where newer messages are given more importance.

Generally, you will want to assign the `older` priority as one of the lowest priorities in your prompt, and the `newer` priority greater than other ambient context so that the chat 'remembers' recent messages.

This elements create `UserMessage` and `AssistantMessages` directly and should _not_ be wrapped in a message type.

##### Props

- `history`: An array of chat history messages.
- `newer`: Priority value for the last `n` messages.
- `older`: Priority value for any older messages.
- `passPriority`: A boolean to require consumers to pass priority so that the two values work.
- _(optional)_ `n`: Number of messages to put at the "newer" priority, defaults to 2.
- _(optional)_ `renderTurn`: An optional function to render a chat request/response. By default, messages are rendered using simple markdown, and only markdown responses are rendered.

##### Behavior

- The component splits the history into two parts: newer messages and older messages.
- Newer messages are given a higher priority, while older messages are given a lower priority.
- The component uses the `PrioritizedList` to ensure that messages are displayed in the correct order based on their priority.

##### Usage Example

```tsx
import { History } from '@vscode/chat-extension-utils';

interface IMyPromptProps extends BasePromptElementProps {
	history: ChatContext['history'];
	userQuery: string;
}

export class MyPrompt extends PromptElement<IMyPromptProps> {
	render() {
		return (
			<>
				<SystemMessage priority={100}>
					Here are your base instructions. They have the highest priority because you want to make
					sure they're always included!
				</SystemMessage>

				{/* Recent history messages are preferred over any workspace context we have below */}
				{/* The remainder of the history has the lowest priority since it's less relevant */}
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
```

#### Tags

The `Tag` component wraps your content in an XML-like `<tag>` of the given name, ensuring that the tag wrappers survive as long as any content survives.

##### Props

- `name`: name of the tag.

##### Usage Example

```tsx
import { Tag } from '@vscode/chat-extension-utils';

<Tag name="example">
	<SomeOtherComponent />
</Tag>;
```

#### Tool Calls

The `ToolCall` component can be included in your prompt to call a tool and include its invocation result in the prompt. This element is responsive to the token budget, ensuring that the tool call results fit within the allowed token limit.

##### Props

- `call`: The tool call to be invoked.
- `invocationToken`: A token representing the invocation context.
- `result` _(optional)_: A known result, if any. Bypasses the `invokeTool` call.

##### Behavior

- The component invokes the specified tool call and includes its result in the prompt.
- It ensures that the result fits within the token budget by checking the token count before including the result.
- If the result exceeds the token budget, it may be truncated or adjusted to fit within the limit.

##### Usage Example

To use this component, you generally first build your prompt and make a request, including the available tools. For example:

```tsx
const options: vscode.LanguageModelChatRequestOptions = {
	tools: vscode.lm.tools.map((tool): vscode.LanguageModelChatTool => {
		return {
			name: tool.name,
			description: tool.description,
			inputSchema: tool.inputSchema ?? {},
		};
	}),
};

// ...
const response = makeRequestWithOptions(options);
```

If the response contains `vscode.LanguageModelToolCallPart`, then you should re-send the prompt with a `ToolCall` element for each of those.

```tsx
import { ToolCall } from '@vscode/chat-extension-utils';

interface IProps {
  toolCalls: vscode.LanguageModelToolCallPart[];
  chatRequest: vscod.ChatRequest;
  // ...
}

class MyElement extends PromptElement<IProps> {
	render() {
		return (
			<UserMessage>
				// ...
			</UserMessage>
			{this.props.toolCalls.map(call => (
				<ToolCall call={call} invocationToken={chatRequest.toolInvocationToken} />
			))}
		);
	}
}
```

This element will automatically call `vscode.lm.invokeTool` and include the result appropriately.

#### File Tree

This represents a file tree at the given URI or URIs in an indented format, such as:

```
src/
  foo.js
  bar.js
  baz/
    qux.js
package.json
README.md
```

You can pass an `ignore` function to use to filter paths in the tree.

Because this element is responsive to its budget, you will generally want to use it in tandem with [prompt-tsx's flex features](https://github.com/microsoft/vscode-prompt-tsx?tab=readme-ov-file#flex-behavior).

The FileTree can also `focusOn` a specific subpath within the root URI. In this case, it will start expanding outwards from the given subpath, but it still will include the path from the root to that subpath. For example, in the above file tree with a `focusOn` the `src` directory, it might include the contents of `src` only if it has a very small budget:

```
src/
  foo.js
  bar.js
  baz/
```

##### Props

- `root`: The root URI to represent.
- `focusOn`: _(optional)_ If set to a subpath of the `root`, the file tree will focus on this URI and expand its children more eagerly than other URIs within the root.
- `ignore`: _(optional)_ A function to filter the input list of URIs and return any URIs that should be ignored.

##### Behavior

- The component starts by displaying the root directory and its contents.
- If `focusOn` is provided, it will expand the specified subpath more eagerly.
- The component respects the token budget and will prune the tree if necessary to fit within the budget.

##### Usage Example

```tsx
import { FileTree } from '@vscode/chat-extension-utils';

const rootUri = vscode.Uri.file('/my-cool-project');
const focusUri = vscode.Uri.file('/my-cool-project/packages/neato');

<FileTree
	root={rootUri}
	focusOn={focusUri}
	ignore={uris => uris.filter(u => u.path.includes('node_modules'))}
/>;
```

If you provide a FileTree to the model and ask for one in return, you can use `FileTree.parseText` and `FileTree.parseUris` to inspect and convert a file tree back into file names or URIs respectively.

## Development

When working on the library itself, you may want to use the local version in a chat extension. To do this you can use `npm link`:

- In this repository, run `npm link`.
- In the chat extension repository, run `npm link @vscode/chat-extension-utils`.
- But if your chat extension uses `@vscode/prompt-tsx`, there's a problem: that library uses `instanceof` checks on prompt elements, but there are two copies of the library in play, breaking this. To work around that, you can import the prompt element types from `@vscode/chat-extension-utils` instead of `@vscode/prompt-tsx` in your chat extension:

```ts
import { UserMessage } from '@vscode/chat-extension-utils/dist/promptTsx';
```

Note that this won't work with a published version of the library, so revert it before pushing the changes to your extension!
