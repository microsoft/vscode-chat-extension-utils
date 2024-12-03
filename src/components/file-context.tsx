/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	BasePromptElementProps,
	Chunk,
	PromptElement,
	PromptPiece,
	PromptReference,
	PromptSizing,
} from '@vscode/prompt-tsx';
import { ChatPromptReference, Location, Range, TextDocument, Uri, workspace } from 'vscode';

/**
 * File information to include.
 *
 * Note: {@link ChatPromptReference} is generally assignable to this interface, excluding
 * the `unknown` value, e.g. `{ value: ref.value as Exclude<typeof ref.value, unknown> }`
 */
export interface IFilesToInclude {
	/** Document or file to include. */
	value: TextDocument | Uri | Location | string;
	/** Range to focus on. */
	range?: Range;
	/** Optional explicit label for the file, shown before its contents. */
	label?: string;
	/** Whether to expand outwards from the given range if there's space for it. Defaults to true. */
	expand?: boolean;
}

export interface IFilesContextProps extends BasePromptElementProps {
	files: IFilesToInclude[] | IFilesToInclude;
}

/**
 * This component includes the contents of the files provided to it, centered
 * around the given ranges. It expands the files line-by-line until the budget
 * it's given is exhausted, or when the entire file contents is included.
 *
 * This is best used with `flexGrow`, see the example in
 * `./examples/file-contents.tsx` for a demonstration.
 */
export class FilesContext extends PromptElement<
	{ files: IFilesToInclude[] | IFilesToInclude } & BasePromptElementProps
> {
	async render(_state: void, sizing: PromptSizing): Promise<PromptPiece> {
		const files = await this.getExpandedFiles(sizing);
		return (
			<>
				{files.map(f => (
					<Chunk>
						<references value={[new PromptReference(f.toLocation())]} />
						{f.toString()}
					</Chunk>
				))}
			</>
		);
	}

	/**
	 * The idea here is:
	 *
	 * 1. We wrap each file in markdown-style code fences, so get the base
	 *    token consumption of each of those.
	 * 2. Keep looping through the files. Each time, add one line from each file
	 *    until either we're out of lines (anyHadLinesToExpand=false) or until
	 *    the next line would cause us to exceed our token budget.
	 *
	 * This always will produce files that are under the budget because
	 * tokenization can cause content on multiple lines to 'merge', but it will
	 * never exceed the budget.
	 *
	 * (`tokenLength(a) + tokenLength(b) <= tokenLength(a + b)` in all current
	 * tokenizers.)
	 */
	private async getExpandedFiles(sizing: PromptSizing) {
		const fileInput = this.props.files instanceof Array ? this.props.files : [this.props.files];
		const allInputs = await Promise.all(fileInput.map(f => FileContextTracker.create(f)));
		const files = allInputs.filter(f => !!f);

		let tokenCount = 0;
		// count the base amount of tokens used by the files:
		for (const file of files) {
			tokenCount += await file.baseTokenCount(sizing);
		}

		while (true) {
			let anyHadLinesToExpand = false;
			for (const file of files) {
				const nextLine = file.nextLine();
				if (nextLine === undefined) {
					continue;
				}

				anyHadLinesToExpand = true;
				const nextTokenCount = await sizing.countTokens(nextLine);
				if (tokenCount + nextTokenCount > sizing.tokenBudget) {
					return files;
				}

				file.expand();
				tokenCount += nextTokenCount;
			}

			if (!anyHadLinesToExpand) {
				return files;
			}
		}
	}
}

class FileContextTracker {
	private prefix: string;
	private suffix = '\n```\n';
	private lines: string[] = [];

	private aboveLine: number;
	private belowLine: number;
	private nextLineIs: 'above' | 'below' | 'none' = 'above';

	private readonly minLine: number = 0; // inclusive
	private readonly maxLine: number; // inclusive

	public static async create(f: IFilesToInclude) {
		if (typeof f.value === 'string') {
			return new FileContextTracker(
				new StringTextDocument(
					f.value,
					Uri.from({
						scheme: 'untitled',
						path: crypto.randomUUID(),
					}),
				),
				f,
			);
		} else if (f.value instanceof Uri || f.value instanceof Location) {
			const uri = f.value instanceof Location ? f.value.uri : f.value;
			try {
				const contents = await workspace.fs.readFile(uri);
				const text = new TextDecoder().decode(contents);
				return new FileContextTracker(new StringTextDocument(text, uri), f);
			} catch {
				return new FileContextTracker(new StringTextDocument('Failed to read file', uri), f);
			}
		} else if (!!f.value && 'uri' in f.value && 'isUntitled' in f.value) {
			return new FileContextTracker(f.value as TextDocument, f);
		} else {
			return undefined;
		}
	}

	constructor(
		private readonly document: ITextDocument,
		{ range, label, expand, value }: IFilesToInclude,
	) {
		this.prefix = `# ${label || this.document.uri.fsPath}\n\`\`\`\n`;

		const actualRange = range || (value instanceof Location ? value.range : undefined);
		if (expand === false && actualRange) {
			this.minLine = actualRange.start.line;
			this.maxLine = actualRange.end.line + 1;
		} else {
			this.maxLine = this.document.lineCount;
		}

		this.aboveLine = this.belowLine = actualRange
			? actualRange.start.line + Math.floor((actualRange.end.line - actualRange.start.line) / 2)
			: 0;
	}

	/** Counts the length of the base prefix/suffix. */
	public async baseTokenCount(sizing: PromptSizing) {
		const before = await sizing.countTokens(this.prefix);
		const after = await sizing.countTokens(this.suffix);
		return before + after;
	}

	/** Gets the next line that will be added on the following `expand` call. */
	public nextLine(): string | undefined {
		switch (this.nextLineIs) {
			case 'above':
				return this.document.lineAt(this.aboveLine).text + '\n';
			case 'below':
				return this.document.lineAt(this.belowLine).text + '\n';
			case 'none':
				return undefined;
		}
	}

	/** Adds in the 'next line' */
	public expand() {
		if (this.nextLineIs === 'above') {
			this.lines.unshift(this.document.lineAt(this.aboveLine).text);
			if (this.belowLine < this.maxLine - 1) {
				this.belowLine++;
				this.nextLineIs = 'below';
			} else if (this.aboveLine > this.minLine) {
				this.aboveLine--;
			} else {
				this.nextLineIs = 'none';
			}
		} else if (this.nextLineIs === 'below') {
			this.lines.push(this.document.lineAt(this.belowLine).text);
			if (this.aboveLine > this.minLine) {
				this.aboveLine--;
				this.nextLineIs = 'above';
			} else if (this.belowLine < this.maxLine - 1) {
				this.belowLine++;
			} else {
				this.nextLineIs = 'none';
			}
		}
	}

	toLocation() {
		return new Location(this.document.uri, new Range(this.aboveLine, 0, this.belowLine, 0));
	}

	/** Gets the file content as a string. */
	toString() {
		return this.prefix + this.lines.join('\n') + this.suffix;
	}
}

interface ITextDocument {
	readonly lineCount: number;
	readonly uri: Uri;
	lineAt(line: number): { text: string };
}

class StringTextDocument implements ITextDocument {
	private readonly lines: string[];

	public get lineCount() {
		return this.lines.length;
	}

	constructor(
		contents: string,
		public readonly uri: Uri,
	) {
		this.lines = contents.split('\n');
	}

	lineAt(line: number) {
		return { text: this.lines[line] || '' };
	}
}
