// @ts-check

import tseslint from 'typescript-eslint';
import header from 'eslint-plugin-header';
import stylisticTs from '@stylistic/eslint-plugin-ts';

// https://github.com/Stuk/eslint-plugin-header/issues/57
header.rules.header.meta.schema = false;

export default tseslint.config({
	files: ['src/**/*.ts*'],
	ignores: ['src/util/vs/**'],
	plugins: {
		'@typescript-eslint': tseslint.plugin,
		header: header,
		'@stylistic/ts': stylisticTs,
	},
	languageOptions: {
		parser: tseslint.parser,
		parserOptions: {
			projectService: true,
			tsconfigRootDir: import.meta.dirname,
		},
	},
	rules: {
		'constructor-super': 'error',
		curly: 'error',
		eqeqeq: 'error',
		'prefer-const': [
			'error',
			{
				destructuring: 'all',
			},
		],
		'no-buffer-constructor': 'error',
		'no-caller': 'error',
		'no-case-declarations': 'error',
		'no-debugger': 'error',
		'no-duplicate-case': 'error',
		'no-duplicate-imports': 'error',
		'no-eval': 'error',
		'no-async-promise-executor': 'error',
		'no-extra-semi': 'error',
		'no-new-wrappers': 'error',
		'no-redeclare': 'off',
		'no-sparse-arrays': 'error',
		'no-throw-literal': 'error',
		'no-unsafe-finally': 'error',
		'no-unused-labels': 'error',
		'no-restricted-globals': [
			'error',
			'name',
			'length',
			'event',
			'closed',
			'external',
			'status',
			'origin',
			'orientation',
			'context',
		], // non-complete list of globals that are easy to access unintentionally
		'no-var': 'error',
		'@stylistic/ts/semi': 'error',
		'@stylistic/ts/member-delimiter-style': 'error',
		'header/header': [
			'error',
			'block',
			[
				'---------------------------------------------------------------------------------------------',
				' *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.',
				' *--------------------------------------------------------------------------------------------',
			],
		],
	},
});
