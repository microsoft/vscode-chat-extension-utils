/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	BasePromptElementProps,
	PromptElement,
	PromptMetadata,
	PromptPiece,
	PromptSizing,
	TextChunk,
} from '@vscode/prompt-tsx';
import * as vscode from 'vscode';

export interface IFileTreeProps extends BasePromptElementProps {
	/**
	 * Root URI to represent.
	 */
	root: vscode.Uri;
	/**
	 * If set to a subpath of the `root`, the file tree will focus on this this
	 * URI and expand its children more eagerly than other URIs within the root.
	 * This matters when the size of the file tree would exceed the token budget.
	 */
	focusOn?: vscode.Uri;
	/**
	 * An identifying token that can be used to identify the tree in {@link FileTreeMetadata}.
	 */
	id?: unknown;
	/**
	 * Function to use to test whether the given URIs are ignored. It should
	 * filter the input list of URIs and *return any URIs that should be ignored*.
	 */
	ignore?: (uris: vscode.Uri[]) => vscode.Uri[] | Promise<vscode.Uri[]>;
}

export type ParsedTextFileTree = { name: string; children?: ParsedTextFileTree[] };
export type ParsedUriFileTree = { uri: vscode.Uri; children?: ParsedUriFileTree[] };

/**
 * This represents a file tree at the given URI or URIs in an indented format,
 * such as:
 *
 * ```
 * src/
 *   foo.js
 *   bar.js
 *   baz/
 *     qux.js
 * package.json
 * README.md
 * ```
 *
 * You can pass an `ignore` function to use to filter paths in the tree.
 *
 * This element *is* responsive to the token budget, so you should generally
 * use this with a `flexGrow` value. See
 * https://github.com/microsoft/vscode-prompt-tsx?tab=readme-ov-file#flex-behavior
 *
 * The FileTree can also `focusOn` a specific subpath within the root URI. In
 * this case, it will start expanding outwards from the given subpath, but it
 * still will include the path from the root to that subpath. For example,
 * in the above file tree with a `focusOn` the `src` directory, it might
 * include the contents of `src` only if it has a very small budget:
 *
 * ```
 * src/
 *   foo.js
 *   bar.js
 *   baz/
 * ```
 */
export class FileTree extends PromptElement<IFileTreeProps> {
	/**
	 * Parses a tree in the format of the `FileTree` element and returns the
	 * resulting list of URIs. This is useful if you give the filetree to
	 * the a model as ask it for results.
	 *
	 * @param includeDirectories If set to true, directories will be included in the result.
	 * If false or not given, only the files will be returned.
	 */
	public static parseUris(root: vscode.Uri, tree: string): ParsedUriFileTree[] {
		const text = this.parseText(tree);
		function mapNode(parent: vscode.Uri, node: ParsedTextFileTree): ParsedUriFileTree {
			const uri = vscode.Uri.joinPath(parent, node.name);
			if (!node.children) {
				return { uri };
			}
			return { uri, children: node.children.map(c => mapNode(uri, c)) };
		}

		return text.map(t => mapNode(root, t));
	}

	/**
	 * Parses a tree in the format of the `FileTree` element and returns the
	 * resulting structure. This is useful if you give the filetree to
	 * the a model as ask it for results.
	 */
	public static parseText(tree: string): ParsedTextFileTree[] {
		const lines = tree.split('\n');
		const stack: ParsedTextFileTree[] = [{ name: '', children: [] }];
		const result: ParsedTextFileTree[] = stack[0].children!;
		const indentMap = new Map<ParsedTextFileTree, string>();

		for (const line of lines) {
			if (!line.trim()) {
				continue;
			}

			const nameIndex = line.search(/\S/);
			if (nameIndex === -1) {
				continue;
			}

			const indent = line.slice(0, nameIndex);
			let parent = stack[stack.length - 1];
			while (stack.length > 1 && indent.length <= indentMap.get(parent)!.length) {
				stack.pop();
				parent = stack[stack.length - 1];
			}

			const node: ParsedTextFileTree = { name: line.slice(nameIndex).trim() };
			indentMap.set(node, indent);
			if (node.name.endsWith('/')) {
				node.children = [];
				node.name = node.name.slice(0, -1);
			}

			parent.children ??= [];
			parent.children.push(node);
			stack.push(node);
		}

		return result;
	}

	render(): PromptPiece {
		return (
			<>
				```
				<br />
				<FileTreeFragment {...this.props} />
				```
				<br />
			</>
		);
	}
}

const ROOT_PRIORITY = 0x7fffffff;

export interface IFileTreeFragmentProps extends IFileTreeProps {
	/** Starting indentation level (defaults to 0) */
	indent?: number;
}

/**
 * Like the {@link FileTree}, but can start at a customizable indentation level
 * and lacks surrounding code fences to allow for composition.
 */
export class FileTreeFragment extends PromptElement<IFileTreeFragmentProps> {
	async render(
		_state: void,
		sizing: PromptSizing,
		_progress?: unknown,
		token?: vscode.CancellationToken,
	) {
		const root = await this.fileTree(sizing, token);
		return (
			<>
				<meta value={new FileTreeMetadata(root, this.props.id)} local />
				{[...root.toSubtree()]}
			</>
		);
	}

	private async fileTree(sizing: PromptSizing, token?: vscode.CancellationToken): Promise<Node> {
		const { root, focusOn = root, ignore } = this.props;
		if (!focusOn.path.toLowerCase().startsWith(root.path.toLowerCase())) {
			throw new Error('focusOn must be within the root URI');
		}

		// Even though we stay within the budget, we still set the priority of each
		// node to be the inverse of its position in the tree so that if pruning
		// occurs it will happen in the right order.
		let priority = ROOT_PRIORITY;
		const rootNode: Node = new Node(
			root,
			undefined,
			-1 + (this.props.indent || 0),
			vscode.FileType.Directory,
			priority--,
		);
		let remaining = sizing.tokenBudget;

		// If focusOn is a subpath, descend into it and use that as the first queue item.
		let firstQueueItem = rootNode;
		if (focusOn.path.length > root.path.length) {
			for (const segment of focusOn.path.slice(root.path.length + 1).split('/')) {
				const next = new Node(
					vscode.Uri.joinPath(firstQueueItem.uri, segment),
					firstQueueItem,
					firstQueueItem.indent + 1,
					vscode.FileType.Directory,
					priority--,
				);

				firstQueueItem.children!.push(next);
				remaining -= await sizing.countTokens(next.text, token);
				firstQueueItem = next;
			}
		}

		const queue = [{ node: firstQueueItem, ascend: true }];
		L: for (let i = 0; i < queue.length && !token?.isCancellationRequested; i++) {
			const { node, ascend } = queue[i];
			const children = (await vscode.workspace.fs.readDirectory(node.uri)).map(([name, type]) => ({
				uri: vscode.Uri.joinPath(node.uri, name),
				type,
			}));

			// 1. Filter out ignored URIs.
			const ignored = new Set();
			if (ignore) {
				for (const uri of await ignore(children.map(c => c.uri))) {
					ignored.add(uri.toString());
				}
			}
			const childNodes = children
				.filter(
					c =>
						(c.type === vscode.FileType.Directory || c.type === vscode.FileType.File) &&
						!ignored.has(c.uri.toString()) &&
						!node.children!.some(c2 => c2.uri.toString() === c.uri.toString()),
				)
				.map(({ uri, type }) => new Node(uri, node, node.indent + 1, type, priority--));
			const childrenCost = await Promise.all(
				childNodes.map(n => sizing.countTokens(n.text, token)),
			);

			// 2. Add each child so long as we have the budget for it.
			for (let k = 0; k < childNodes.length && !token?.isCancellationRequested; k++) {
				remaining -= childrenCost[k];
				if (remaining < 0) {
					break L;
				}

				const child = childNodes[k];
				node.children!.push(child);
				if (child.children) {
					queue.push({ node: child, ascend: false });
				}
			}

			// 3. If we're ascending to the root, add the parent to the queue after
			// the children (so that we bias towards expanding the focus children first).
			if (ascend && node.parent) {
				queue.push({ node: node.parent, ascend: true });
			}
		}

		return rootNode;
	}
}

export class FileTreeMetadata extends PromptMetadata {
	constructor(
		private readonly root: Node,
		public readonly id: unknown,
	) {
		super();
	}

	/** Gets all URIs represented in the file tree, including directories. */
	public uris() {
		return this.root.uris(false);
	}

	/** Gets all file URIs represented in the file tree. */
	public files() {
		return this.root.uris(true);
	}
}

class Node {
	/** Defined only for directories */
	public readonly children?: Node[];

	constructor(
		public readonly uri: vscode.Uri,
		public readonly parent: Node | undefined,
		public readonly indent: number,
		kind: vscode.FileType,
		public readonly priority: number,
	) {
		this.children = kind === vscode.FileType.Directory ? [] : undefined;
	}

	public get text() {
		return '\t'.repeat(this.indent) + basename(this.uri) + (this.children ? '/' : '') + '\n';
	}

	public *toSubtree(): Generator<TextChunk> {
		if (this.priority < ROOT_PRIORITY) {
			yield <TextChunk priority={this.priority}>{this.text}</TextChunk>;
		}
		if (this.children) {
			for (const child of this.children.sort((a, b) => a.uri.path.localeCompare(b.uri.path))) {
				yield* child.toSubtree();
			}
		}
	}

	public *uris(filesOnly: boolean): Generator<vscode.Uri> {
		if (filesOnly && !this.children) {
			yield this.uri;
		}

		if (this.children) {
			for (const child of this.children) {
				yield* child.uris(filesOnly);
			}
		}
	}
}

const basename = (uri: vscode.Uri) => {
	const i = uri.path.lastIndexOf('/');
	return i === -1 ? uri.path : uri.path.slice(i + 1);
};
