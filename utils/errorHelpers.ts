/**
 * Safely extract a human-readable message from an unknown catch-clause value.
 * TypeScript 4.4+ (strict mode) types catch variables as `unknown`, so direct
 * access to `.message` is a type error without a guard.
 */
export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === 'string') {
		return error;
	}

	if (
		typeof error === 'object' &&
		error !== null &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message;
	}

	return 'Unknown error';
}
