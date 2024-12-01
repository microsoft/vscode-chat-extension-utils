/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { HTMLTracer } from '@vscode/prompt-tsx';
import * as vscode from 'vscode';
import { Lazy } from './util/vs/base/common/lazy';

export class HTMLTracerWrapper {
	private tracer = new Lazy(() => new HTMLTracer());
	private address: string | undefined;

	getTracer(extensionMode: vscode.ExtensionMode | undefined): HTMLTracer | undefined {
		return extensionMode === vscode.ExtensionMode.Development ? this.tracer.value : undefined;
	}

	async serveHTML(): Promise<string> {
		if (!this.address) {
			this.address = (await this.tracer.value.serveHTML()).address;
		}

		return this.address;
	}
}