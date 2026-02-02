import {
	IHookFunctions,
	IWebhookFunctions,
	IWebhookResponseData,
	INodeType,
	INodeTypeDescription,
	NodeApiError,
} from 'n8n-workflow';
import {
	getBunqBaseUrl,
	signData,
	ensureBunqSession,
} from '../../utils/bunqApiHelpers';


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
				displayName: 'Callback Categories',
				name: 'categories',
				type: 'multiOptions',
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
				default: ['MUTATION'],
				required: true,
				description: 'The types of events you want to receive webhook notifications for',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const categories = this.getNodeParameter('categories') as string[];

				try {
					// Get credentials and session
					const credentials = await this.getCredentials('bunqApi');
					const environment = credentials.environment as string;
					const baseUrl = getBunqBaseUrl(environment);

					// Ensure session exists using shared helper
					const sessionData = await ensureBunqSession.call(
						this,
						credentials.apiKey as string,
						credentials.privateKey as string,
						credentials.publicKey as string,
						environment,
						'n8n-bunq-webhook',
						false,
					);

					if (!sessionData.sessionToken || !sessionData.userId) {
						return false;
					}

					// Get existing notification filters
					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/user/${sessionData.userId}/notification-filter-url`,
						headers: {
							'Content-Type': 'application/json',
							'Cache-Control': 'no-cache',
							'User-Agent': 'n8n-bunq-webhook',
							'X-Bunq-Language': 'en_US',
							'X-Bunq-Region': 'nl_NL',
							'X-Bunq-Client-Authentication': sessionData.sessionToken,
						},
					});

					// Check if our webhook exists with the correct categories
					if (response.Response && Array.isArray(response.Response)) {
						for (const item of response.Response) {
							if (item.NotificationFilterUrl) {
								const filters = item.NotificationFilterUrl.notification_filters || [];
								// Check if all our categories are registered with our webhook URL
								const hasAllCategories = categories.every((cat) =>
									filters.some(
										(f: { category: string; notification_target: string }) =>
											f.category === cat && f.notification_target === webhookUrl,
									),
								);
								if (hasAllCategories) {
									return true;
								}
							}
						}
					}
				} catch (error) {
					// If we can't check, assume it doesn't exist
					// This can happen if the session is invalid or the API is unreachable
					const message = error instanceof Error ? error.message : 'Unknown error';
					this.logger.debug(`Failed to check webhook existence: ${message}`);
					return false;
				}

				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const categories = this.getNodeParameter('categories') as string[];

				// Get credentials
				const credentials = await this.getCredentials('bunqApi');
				const environment = credentials.environment as string;
				const baseUrl = getBunqBaseUrl(environment);

				// Ensure session exists using shared helper
				const sessionData = await ensureBunqSession.call(
					this,
					credentials.apiKey as string,
					credentials.privateKey as string,
					credentials.publicKey as string,
					environment,
					'n8n-bunq-webhook',
					false,
				);

				if (!sessionData.sessionToken || !sessionData.userId) {
					throw new NodeApiError(this.getNode(), { error: 'Session creation failed' }, {
						message: 'Failed to create Bunq session',
						description: 'Could not establish a session with the Bunq API',
					});
				}

				// Build notification filters array
				const notificationFilters = categories.map((category) => ({
					category,
					notification_target: webhookUrl,
				}));

				const payload = JSON.stringify({
					notification_filters: notificationFilters,
				});

				// Sign the payload
				const signature = signData(payload, credentials.privateKey as string);

				try {
					// Register the webhook with Bunq
					await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/user/${sessionData.userId}/notification-filter-url`,
						headers: {
							'Content-Type': 'application/json',
							'Cache-Control': 'no-cache',
							'User-Agent': 'n8n-bunq-webhook',
							'X-Bunq-Language': 'en_US',
							'X-Bunq-Region': 'nl_NL',
							'X-Bunq-Client-Authentication': sessionData.sessionToken,
							'X-Bunq-Client-Signature': signature,
						},
						body: payload,
					});

					return true;
				} catch (error) {
					throw new NodeApiError(
						this.getNode(),
						{ error: error instanceof Error ? error.message : 'Unknown error' },
						{
							message: 'Failed to register webhook with Bunq',
							description: 'Could not create notification filter in Bunq API',
						},
					);
				}
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');

				try {
					// Get credentials
					const credentials = await this.getCredentials('bunqApi');
					const environment = credentials.environment as string;
					const baseUrl = getBunqBaseUrl(environment);

					// Ensure session exists using shared helper
					const sessionData = await ensureBunqSession.call(
						this,
						credentials.apiKey as string,
						credentials.privateKey as string,
						credentials.publicKey as string,
						environment,
						'n8n-bunq-webhook',
						false,
					);

					if (!sessionData.sessionToken || !sessionData.userId) {
						// If we can't get a session, assume webhook is already deleted
						return true;
					}

					// Get existing notification filters
					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/user/${sessionData.userId}/notification-filter-url`,
						headers: {
							'Content-Type': 'application/json',
							'Cache-Control': 'no-cache',
							'User-Agent': 'n8n-bunq-webhook',
							'X-Bunq-Language': 'en_US',
							'X-Bunq-Region': 'nl_NL',
							'X-Bunq-Client-Authentication': sessionData.sessionToken,
						},
					});

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

					// Update filters (removing ours)
					const payload = JSON.stringify({
						notification_filters: filtersToKeep,
					});

					const signature = signData(payload, credentials.privateKey as string);

					await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/user/${sessionData.userId}/notification-filter-url`,
						headers: {
							'Content-Type': 'application/json',
							'Cache-Control': 'no-cache',
							'User-Agent': 'n8n-bunq-webhook',
							'X-Bunq-Language': 'en_US',
							'X-Bunq-Region': 'nl_NL',
							'X-Bunq-Client-Authentication': sessionData.sessionToken,
							'X-Bunq-Client-Signature': signature,
						},
						body: payload,
					});

					return true;
				} catch (error) {
					// If deletion fails, don't throw - webhook might already be gone
					// Log for debugging but consider deletion successful
					const message = error instanceof Error ? error.message : 'Unknown error';
					this.logger.debug(`Failed to delete webhook (may already be deleted): ${message}`);
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
