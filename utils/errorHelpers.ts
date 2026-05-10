/**
 * Safely extract a human-readable message from a caught or otherwise unknown error value.
 * Thrown values are not always `Error` instances, and some TypeScript configurations
 * type catch variables as `unknown`, so direct access to `.message` may require a guard.
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
