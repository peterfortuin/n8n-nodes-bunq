/**
 * Safely extract a human-readable message from an unknown catch-clause value.
 * TypeScript 4.4+ (strict mode) types catch variables as `unknown`, so direct
 * access to `.message` is a type error without a guard.
 */
export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Unknown error';
}
