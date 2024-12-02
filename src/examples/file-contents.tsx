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
import { FilesContext, IFilesToInclude } from '../components/file-context';
import { History } from '../components/history';

interface IMyPromptProps extends BasePromptElementProps {
	history: ChatContext['history'];
	userQuery: string;
	files: IFilesToInclude[];
}

/**
 * In this example, we want to include the contents of all files the user is
 * currently looking at in their prompt. But, these files could be big, to the
 * point where including all of them would lead to their text being pruned!
 *
 * This example shows you how to use the `flexGrow` property to cooperatively
 * size the file contents to fit within the token budget. Each element receives
 * information about how much of the token budget it is suggested to consume in
 * its `PromptSizing` object, passed to both `prepare` and `render`.
 *
 * By default, each element has a `flexGrow` value of `0`. This means they're
 * all rendered concurrently and split the budget equally (unless modified by
 * a `flexBasis` value.) If you assign elements to a higher `flexGrow` value,
 * then they're rendered after everything else, and they're given any remaining
 * unused budget. This gives you a great way to create elements that size to
 * fit but not exceed your total budget.
 *
 * Let's use this to make the `FileContext` grow to fill the available space.
 * We'll assign it a `flexGrow` value of `1`, and then it will be rendered after
 * the instructions and query.
 *
 * History can be big, however, and we'd prefer to bring in more context rather
 * than more history. So, we'll assign the `History` element a `flexGrow` value
 * of `2` for the sole purpose of keeping its token consumption out of the
 * `FileContext` budget. However, we will set `flexReserve="/5"` to have it
 * 'reserve' 1/5th of the total budget from being given to the sizing of
 * earlier elements, just to make sure we have some amount of history in the
 * prompt.
 *
 * It's important to note that the `flexGrow` value, and `PromptSizing` in
 * general, allows **cooperative** use of the token budget. If the prompt is
 * over budget after everything is rendered, then pruning still happens as
 * usual. `flex*` values have no impact on the priority or pruning process.
 *
 * While we're using the active files and selections here, these same concepts
 * can be applied in other scenarios too.
 */
export class MyPrompt extends PromptElement<IMyPromptProps> {
	render() {
		return (
			<>
				<SystemMessage priority={100}>Here are your base instructions.</SystemMessage>
				{/* See `./history.tsx` for an explainer on the history element. */}
				<History
					history={this.props.history}
					passPriority
					older={0}
					newer={80}
					flexGrow={2}
					flexReserve="/5"
				/>
				<UserMessage priority={90}>{this.props.userQuery}</UserMessage>
				<FilesContext priority={70} flexGrow={1} files={this.props.files} />
			</>
		);
	}
}
