/**
 * Safely extract a human-readable message from an arbitrary thrown or caught value.
 * This helper performs a runtime guard before reading `.message`, which keeps
 * error handling safe even when non-`Error` values are thrown.
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
