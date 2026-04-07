import {
	IHookFunctions,
	IWebhookFunctions,
	IWebhookResponseData,
	INodeType,
	INodeTypeDescription,
	NodeApiError,
} from 'n8n-workflow';
import {
	ensureBunqSession,
} from '../../utils/bunqApiHelpers';
import { BunqHttpClient } from '../../utils/BunqHttpClient';

/**
 * Extract error message from unknown error type
 */
function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Unknown error';
}

// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool
export class BunqTrigger implements INodeType {
	usableAsTool: boolean = false;
	description: INodeTypeDescription = {
		displayName: 'Bunq Trigger',
		name: 'bunqTrigger',
		icon: 'file:../../assets/Bunq-logo.svg',
		group: ['trigger'],
		version: 1,
		description: 'Starts the workflow when Bunq sends a webhook notification',
		defaults: {
			name: 'Bunq Trigger',
		},
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'bunqApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Callback Category',
				name: 'category',
				type: 'options',
				options: [
					{
						name: 'Billing',
						value: 'BILLING',
						description: 'Notifications for all bunq invoices',
					},
					{
						name: 'bunq.me Tab',
						value: 'BUNQME_TAB',
						description: 'Notifications for updates on bunq.me Tab payments',
					},
					{
						name: 'Card Transaction Failed',
						value: 'CARD_TRANSACTION_FAILED',
						description: 'Notifications for failed card transactions',
					},
					{
						name: 'Card Transaction Successful',
						value: 'CARD_TRANSACTION_SUCCESSFUL',
						description: 'Notifications for successful card transactions',
					},
					{
						name: 'Chat',
						value: 'CHAT',
						description: 'Notifications for received chat messages',
					},
					{
						name: 'Draft Payment',
						value: 'DRAFT_PAYMENT',
						description: 'Notifications for creation and updates of draft payments',
					},
					{
						name: 'iDEAL',
						value: 'IDEAL',
						description: 'Notifications for iDEAL deposits towards a bunq account',
					},
					{
						name: 'Mutation',
						value: 'MUTATION',
						description: 'Notifications for any action that affects a monetary account\'s balance',
					},
					{
						name: 'OAuth',
						value: 'OAUTH',
						description: 'Notifications for revoked OAuth connections',
					},
					{
						name: 'Payment',
						value: 'PAYMENT',
						description: 'Notifications for payments created from or received on a bunq account',
					},
					{
						name: 'Request',
						value: 'REQUEST',
						description: 'Notifications for incoming requests and updates on outgoing requests',
					},
					{
						name: 'Schedule Result',
						value: 'SCHEDULE_RESULT',
						description: 'Notifications for when a scheduled payment is executed',
					},
					{
						name: 'Schedule Status',
						value: 'SCHEDULE_STATUS',
						description: 'Notifications about the status of a scheduled payment',
					},
					{
						name: 'Share',
						value: 'SHARE',
						description: 'Notifications for any updates or creation of Connects',
					},
					{
						name: 'SOFORT',
						value: 'SOFORT',
						description: 'Notifications for SOFORT deposits towards a bunq account',
					},
					{
						name: 'Support',
						value: 'SUPPORT',
						description: 'Notifications for messages received through support chat',
					},
					{
						name: 'Tab Result',
						value: 'TAB_RESULT',
						description: 'Notifications for updates on Tab payments',
					},
				],
				default: 'MUTATION',
				required: true,
				description: 'The type of event you want to receive webhook notifications for',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const category = this.getNodeParameter('category') as string;

				this.logger.debug(`Checking if webhook exists for category: ${category}`);

				try {
					// Ensure session exists using shared helper
					const sessionData = await ensureBunqSession.call(
						this,
						false,
					);

					if (!sessionData.sessionToken || !sessionData.userId) {
						this.logger.debug('No valid session found');
						return false;
					}

					this.logger.debug(`Session established for user ID: ${sessionData.userId}`);

					// Get existing notification filters using canonical HTTP client
					const client = new BunqHttpClient(this);
					const response = await client.request({
						method: 'GET',
						url: `/user/${sessionData.userId}/notification-filter-url`,
						sessionToken: sessionData.sessionToken,
					});

					this.logger.debug(`Retrieved notification filters from Bunq API`);

					// Check if our webhook exists with the correct category
					if (response.Response && Array.isArray(response.Response)) {
						for (const item of response.Response) {
							if (item.NotificationFilterUrl) {
								const filters = item.NotificationFilterUrl.notification_filters || [];
								// Check if our category is registered with our webhook URL
								const exists = filters.some(
									(f: { category: string; notification_target: string }) =>
										f.category === category && f.notification_target === webhookUrl,
								);
								if (exists) {
									this.logger.debug(`Webhook exists for category ${category} at ${webhookUrl}`);
									return true;
								}
							}
						}
					}

					this.logger.debug(`Webhook does not exist for category ${category}`);
				} catch (error) {
					// If we can't check, assume it doesn't exist
					// This can happen if the session is invalid or the API is unreachable
					// We treat this as a non-critical error and assume webhook needs to be created
					this.logger.debug(`Failed to check webhook existence: ${getErrorMessage(error)}`);
					return false;
				}

				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const category = this.getNodeParameter('category') as string;

				this.logger.info(`Creating webhook for category: ${category} at ${webhookUrl}`);

				// Ensure session exists using shared helper
				const sessionData = await ensureBunqSession.call(
					this,
					false,
				);

				if (!sessionData.sessionToken || !sessionData.userId) {
					this.logger.error('Failed to establish session with Bunq API');
					throw new NodeApiError(this.getNode(), { error: 'Session creation failed' }, {
						message: 'Failed to create Bunq session',
						description: 'Could not establish a session with the Bunq API',
					});
				}

				this.logger.debug(`Session established for user ID: ${sessionData.userId}`);

				const client = new BunqHttpClient(this);
				const notificationFilterUrl = `/user/${sessionData.userId}/notification-filter-url`;

				// Fetch existing filters so we don't overwrite them.
				// The Bunq API replaces the entire list on POST, so we must merge.
				const existingFilters: Array<{ category: string; notification_target: string }> = [];
				try {
					const existing = await client.request({
						method: 'GET',
						url: notificationFilterUrl,
						sessionToken: sessionData.sessionToken,
					});

					if (existing.Response && Array.isArray(existing.Response)) {
						for (const item of existing.Response) {
							if (item.NotificationFilterUrl) {
								const filters = item.NotificationFilterUrl.notification_filters || [];
								for (const f of filters) {
									// Skip any stale entry for the same category+URL to avoid duplicates
									if (!(f.category === category && f.notification_target === webhookUrl)) {
										existingFilters.push({ category: f.category, notification_target: f.notification_target });
									}
								}
							}
						}
					}
				} catch (error) {
					// Because the Bunq API replaces the full server-side list on POST, proceeding
					// without the current list would permanently delete all other existing filters.
					const errorMessage = getErrorMessage(error);
					this.logger.warn(
						`Could not fetch existing notification filters, aborting registration to avoid overwriting existing filters: ${errorMessage}`,
					);
					throw new NodeApiError(this.getNode(), { error: errorMessage }, {
						message:
							'Could not retrieve existing Bunq notification filters. Aborting webhook registration to avoid overwriting existing filters.',
						description: errorMessage,
					});
				}

				// Append the new filter and POST the merged list.
				// Retry once to reduce the chance of losing concurrent registrations by another trigger.
				const MAX_RETRIES = 1;
				for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
					const currentFilters =
						attempt === 0
							? existingFilters
							: await (async () => {
									// Re-fetch existing filters to pick up any concurrent registrations
									const refetched: Array<{ category: string; notification_target: string }> = [];
									try {
										const existing = await client.request({
											method: 'GET',
											url: notificationFilterUrl,
											sessionToken: sessionData.sessionToken,
										});
										if (existing.Response && Array.isArray(existing.Response)) {
											for (const item of existing.Response) {
												if (item.NotificationFilterUrl) {
													const filters = item.NotificationFilterUrl.notification_filters || [];
													for (const f of filters) {
														if (
															!(f.category === category && f.notification_target === webhookUrl)
														) {
															refetched.push({
																category: f.category,
																notification_target: f.notification_target,
															});
														}
													}
												}
											}
										}
									} catch (retryError) {
										this.logger.warn(
											`Could not re-fetch filters on retry: ${getErrorMessage(retryError)}`,
										);
									}
									return refetched;
								})();

					const mergedFilters = [...currentFilters, { category, notification_target: webhookUrl }];

					const payload = JSON.stringify({
						notification_filters: mergedFilters,
					});

					try {
						this.logger.debug(
							`Registering webhook with Bunq API (attempt ${attempt + 1}/${MAX_RETRIES + 1}, total filters after merge: ${mergedFilters.length})...`,
						);
						await client.request({
							method: 'POST',
							url: notificationFilterUrl,
							body: payload,
							sessionToken: sessionData.sessionToken,
						});
					} catch (postError) {
						const message = getErrorMessage(postError);
						this.logger.error(`Failed to register webhook: ${message}`);
						throw new NodeApiError(
							this.getNode(),
							{ error: message },
							{
								message: 'Failed to register webhook with Bunq',
								description: 'Could not create notification filter in Bunq API',
							},
						);
					}

					// Verify the filter was actually registered (to detect concurrent overwrites)
					try {
						const verified = await client.request({
							method: 'GET',
							url: notificationFilterUrl,
							sessionToken: sessionData.sessionToken,
						});
						let found = false;
						if (verified.Response && Array.isArray(verified.Response)) {
							for (const item of verified.Response) {
								if (item.NotificationFilterUrl) {
									const filters = item.NotificationFilterUrl.notification_filters || [];
									if (
										filters.some(
											(f: { category: string; notification_target: string }) =>
												f.category === category && f.notification_target === webhookUrl,
										)
									) {
										found = true;
										break;
									}
								}
							}
						}
						if (found) {
							this.logger.info(`Successfully registered webhook for category ${category}`);
							return true;
						}
						if (attempt < MAX_RETRIES) {
							this.logger.warn(
								`Filter not found after POST (possible concurrent overwrite), retrying...`,
							);
							continue;
						}
					} catch (verifyError) {
						this.logger.warn(
							`Could not verify filter registration: ${getErrorMessage(verifyError)}`,
						);
					}

					this.logger.info(`Successfully registered webhook for category ${category}`);
					return true;
				}

				// Unreachable: the loop always returns or throws, but TypeScript needs this
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');

				this.logger.info(`Deleting webhook at ${webhookUrl}`);

				try {
					// Ensure session exists using shared helper
					const sessionData = await ensureBunqSession.call(
						this,
						false,
					);

					if (!sessionData.sessionToken || !sessionData.userId) {
						// If we can't get a session during deletion, it likely means the API key
						// or credentials are no longer valid. Since the webhook can't be accessed
						// anyway, we consider this a successful deletion scenario.
						this.logger.info('No valid session available - webhook cannot be accessed (treating as deleted)');
						return true;
					}

					this.logger.debug(`Session established for user ID: ${sessionData.userId}`);

					// Get existing notification filters using canonical HTTP client
					const client = new BunqHttpClient(this);
					const response = await client.request({
						method: 'GET',
						url: `/user/${sessionData.userId}/notification-filter-url`,
						sessionToken: sessionData.sessionToken,
					});

					this.logger.debug('Retrieved existing notification filters');

					// Build a list of filters that are NOT for our webhook URL
					const filtersToKeep: Array<{ category: string; notification_target: string }> = [];
					if (response.Response && Array.isArray(response.Response)) {
						for (const item of response.Response) {
							if (item.NotificationFilterUrl) {
								const filters = item.NotificationFilterUrl.notification_filters || [];
								for (const filter of filters) {
									// Keep filters that are not for our webhook URL
									if (filter.notification_target !== webhookUrl) {
										filtersToKeep.push({
											category: filter.category,
											notification_target: filter.notification_target,
										});
									}
								}
							}
						}
					}

					this.logger.debug(`Keeping ${filtersToKeep.length} filters, removing webhook ${webhookUrl}`);

					// Update filters (removing ours) using canonical HTTP client
					const payload = JSON.stringify({
						notification_filters: filtersToKeep,
					});

					await client.request({
						method: 'POST',
						url: `/user/${sessionData.userId}/notification-filter-url`,
						body: payload,
						sessionToken: sessionData.sessionToken,
					});

					this.logger.info('Successfully deleted webhook');
					return true;
				} catch (error) {
					// If deletion fails, don't throw - webhook might already be gone
					// Log for debugging but consider deletion successful
					this.logger.debug(`Failed to delete webhook (may already be deleted): ${getErrorMessage(error)}`);
					return true;
				}
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();

		// Return the webhook payload to the workflow
		return {
			workflowData: [this.helpers.returnJsonArray([req.body])],
		};
	}
}
