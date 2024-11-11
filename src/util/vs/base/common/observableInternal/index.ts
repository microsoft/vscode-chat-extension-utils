//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is a facade for the observable implementation. Only import from here!

export { observableValueOpts } from './api';
export { autorun, autorunDelta, autorunHandleChanges, autorunOpts, autorunWithStore, autorunWithStoreHandleChanges } from './autorun';
export { asyncTransaction, disposableObservableValue, globalTransaction, observableValue, subtransaction, transaction, TransactionImpl, type IChangeContext, type IChangeTracker, type IObservable, type IObserver, type IReader, type ISettable, type ISettableObservable, type ITransaction, } from './base';
export { derived, derivedDisposable, derivedHandleChanges, derivedOpts, derivedWithSetter, derivedWithStore } from './derived';
export { ObservableLazy, ObservableLazyPromise, ObservablePromise, PromiseResult, } from './promise';
export { derivedWithCancellationToken, waitForState } from './utilsCancellation';
export { constObservable, debouncedObservable, derivedConstOnceDefined, derivedObservableWithCache, derivedObservableWithWritableCache, keepObserved, latestChangedValue, mapObservableArrayCached, observableFromEvent, observableFromEventOpts, observableFromPromise, observableFromValueWithChangeEvent, observableSignal, observableSignalFromEvent, recomputeInitiallyAndOnChange, runOnChange, runOnChangeWithStore, signalFromObservable, ValueWithChangeEventFromObservable, wasEventTriggeredRecently, type IObservableSignal, } from './utils';
export { type DebugOwner } from './debugName';

import {
	ConsoleObservableLogger,
	setLogger
} from './logging';

// Remove "//" in the next line to enable logging
const enableLogging = false
	// || Boolean("true") // done "weirdly" so that a lint warning prevents you from pushing this
	;

if (enableLogging) {
	setLogger(new ConsoleObservableLogger());
}
