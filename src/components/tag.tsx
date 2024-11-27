/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, TextChunk } from '@vscode/prompt-tsx';

export interface ITagProps extends BasePromptElementProps {
	name: string;
}

/**
 * A simple element that wraps your content in an XML-like `<tag>` of the given
 * name. It manages priorities to ensure that the tag wrappers survive as
 * long as any content survives.
 */
export class Tag extends PromptElement<ITagProps> {
	render() {
		// todo@connor4312: add a mechanism such that the closing tag is always present with the opening tag
		return (
			<>
				<TextChunk>{`<${this.props.name}>\n`}</TextChunk>
				<TagInner priority={1}>{this.props.children}</TagInner>
				<TextChunk>{`</${this.props.name}>`}</TextChunk>
			</>
		);
	}
}

class TagInner extends PromptElement {
	render() {
		return <>{this.props.children}</>;
	}
}
