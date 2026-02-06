import {
	IExecuteFunctions,
	IHookFunctions,
	INodeExecutionData,
	IHttpRequestOptions,
} from 'n8n-workflow';
import { randomUUID } from 'crypto';
import { signData } from './bunqApiHelpers';

/**
 * Type for Bunq API context - supports both execution and hook contexts
 */
type BunqApiContext = IExecuteFunctions | IHookFunctions;

/**
 * Options for Bunq HTTP requests
 */
export interface IBunqHttpRequestOptions {
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	url: string;
	body?: string;
	sessionToken?: string;
	privateKey?: string;
	/**
	 * Service name to use in User-Agent header.
	 * Different service names can be used for different contexts:
	 * - 'n8n-bunq-integration': For general API operations (default)
	 * - 'n8n-bunq-webhook': For webhook-related operations
	 * This helps identify the source of API calls in Bunq logs.
	 */
	serviceName?: string;
	additionalHeaders?: Record<string, string>;
}

/**
 * Canonical HTTP client for all Bunq API requests
 * Handles automatic header management, request signing, and robust error logging
 */
export class BunqHttpClient {
	private context: BunqApiContext;
	private environment: string;

	/**
	 * Create a new BunqHttpClient
	 * @param context - The n8n execution or hook context
	 * @param environment - The Bunq environment ('sandbox' or 'production') for error logging and tracking
	 */
	constructor(context: BunqApiContext, environment: string) {
		this.context = context;
		this.environment = environment;
	}

	/**
	 * Make a request to the Bunq API with automatic header management and error handling
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async request(options: IBunqHttpRequestOptions): Promise<any> {
		const {
			method,
			url,
			body,
			sessionToken,
			privateKey,
			serviceName = 'n8n-bunq-integration',
			additionalHeaders = {},
		} = options;

		// Generate request ID for tracking
		const requestId = randomUUID();

		// Build headers with automatic management
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-cache',
			'User-Agent': serviceName,
			'X-Bunq-Language': 'en_US',
			'X-Bunq-Region': 'nl_NL',
			'X-Bunq-Client-Request-Id': requestId,
			...additionalHeaders,
		};

		// Add authentication header if session token is provided
		if (sessionToken) {
			headers['X-Bunq-Client-Authentication'] = sessionToken;
		}

		// Add signature header only when there is a request body
		if (body && privateKey) {
			const signature = signData(body, privateKey);
			headers['X-Bunq-Client-Signature'] = signature;
		}

		// Build HTTP request options
		const httpRequestOptions: IHttpRequestOptions = {
			method,
			url,
			headers,
		};

		if (body) {
			httpRequestOptions.body = body;
		}

		try {
			// Make the HTTP request
			const response = await this.context.helpers.httpRequest(httpRequestOptions);
			return response;
		} catch (error: unknown) {
			// Enhance error message with response details if available
			if (error && typeof error === 'object' && 'response' in error) {
				const errorWithResponse = error as {
					response?: {
						status?: number;
						headers?: Record<string, string>;
						data?: unknown;
						statusText?: string;
					};
					config?: {
						url?: string;
						method?: string;
						headers?: Record<string, string>;
					};
					message?: string;
				};

				if (errorWithResponse.response) {
					const statusCode = errorWithResponse.response.status;
					const responseId =
						errorWithResponse.response.headers?.['x-bunq-client-response-id'] || 'N/A';
					const callTime =
						errorWithResponse.response.headers?.['date'] || new Date().toUTCString();
					const endpoint = errorWithResponse.config?.url || url;

					// Log error details for 4xx and 5xx errors
					if (statusCode && statusCode >= 400) {
						this.context.logger.error('Bunq API Error', {
							environment: this.environment,
							requestId,
							responseId,
							callTime,
							endpoint,
							statusCode,
							statusText: errorWithResponse.response.statusText,
							responseData: errorWithResponse.response.data,
						});
					}

					const errorDetails = {
						environment: this.environment,
						requestId,
						responseId,
						callTime,
						endpoint,
						statusCode,
						statusText: errorWithResponse.response.statusText,
						data: errorWithResponse.response.data,
						method: errorWithResponse.config?.method || method,
					};

					// Safely stringify error details, handling circular references
					let errorDetailsString: string;
					try {
						errorDetailsString = JSON.stringify(errorDetails, null, 2);
					} catch {
						// If circular reference error, create a safe version with just primitives
						errorDetailsString = JSON.stringify(
							{
								environment: this.environment,
								requestId,
								responseId,
								callTime,
								endpoint,
								statusCode,
								statusText: errorWithResponse.response.statusText,
								data:
									typeof errorWithResponse.response.data === 'object'
										? '[Complex Object]'
										: errorWithResponse.response.data,
								method: errorWithResponse.config?.method || method,
							},
							null,
							2,
						);
					}

					const originalMessage = errorWithResponse.message || 'API request failed';
					if (error instanceof Error) {
						error.message = `${originalMessage}\n\nAPI Response Details:\n${errorDetailsString}`;
					}
				}
			}

			throw error;
		}
	}

	/**
	 * Handle errors in execute context with continueOnFail support
	 * This method should be used in node execute() methods to handle errors appropriately
	 */
	handleExecuteError(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		error: any,
		items: INodeExecutionData[],
		continueOnFail: boolean,
	): INodeExecutionData[] | never {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		const errorResponse = error?.response;

		if (continueOnFail) {
			const returnData: INodeExecutionData[] = items.map((_, i) => ({
				json: {
					error: errorMessage,
					statusCode: errorResponse?.status,
					responseData: errorResponse?.data,
				},
				pairedItem: {
					item: i,
				},
			}));
			return returnData;
		}
		throw error;
	}
}
