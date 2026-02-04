# n8n-nodes-bunq

This is an n8n community node. It lets you use the Bunq API in your n8n workflows, including support for request signing with device private keys and webhook-based triggers.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)  
[Compatibility](#compatibility)  
[Usage](#usage)  
[Resources](#resources)  
[Version history](#version-history)  

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

This package includes the following nodes:

### Bunq Trigger
A trigger node that starts your workflow when Bunq sends a webhook notification. The trigger automatically registers and manages webhooks with the Bunq API.

**Features:**
- Automatic webhook registration/deregistration with Bunq API
- Support for multiple callback categories (event types)
- Secure session management with automatic token refresh
- Clean webhook cleanup on workflow deactivation

**Available Callback Categories:**
- **Billing**: Notifications for all bunq invoices
- **bunq.me Tab**: Notifications for updates on bunq.me Tab payments
- **Card Transaction Failed**: Notifications for failed card transactions
- **Card Transaction Successful**: Notifications for successful card transactions
- **Chat**: Notifications for received chat messages
- **Draft Payment**: Notifications for creation and updates of draft payments
- **iDEAL**: Notifications for iDEAL deposits towards a bunq account
- **Mutation**: Notifications for any action that affects a monetary account's balance
- **OAuth**: Notifications for revoked OAuth connections
- **Payment**: Notifications for payments created from or received on a bunq account
- **Request**: Notifications for incoming requests and updates on outgoing requests
- **Schedule Result**: Notifications for when a scheduled payment is executed
- **Schedule Status**: Notifications about the status of a scheduled payment
- **Share**: Notifications for any updates or creation of Connects
- **SOFORT**: Notifications for SOFORT deposits towards a bunq account
- **Support**: Notifications for messages received through support chat
- **Tab Result**: Notifications for updates on Tab payments

### Bunq Session
A utility node to create and manage Bunq API sessions, including installation, device registration, and session token management.

### Sign Request
A utility node that signs request bodies using RSA-SHA256 with your Bunq private key, useful for making authenticated API calls to Bunq.

### Failed Callback List
A node that retrieves a list of failed callbacks (webhook notifications) from the Bunq API. This node helps you monitor and troubleshoot webhook failures in your automations.

**Features:**
- Lists all failed webhook notification attempts
- Shows failure details including error messages and response codes
- Returns event types and categories for each failed notification
- Useful for debugging webhook integration issues

### Retry Failed Callback
A node that requests a retry for previously failed callbacks via the Bunq API. This allows you to manually trigger the retry of failed webhook events.

**Features:**
- Retry specific failed notifications by their IDs
- Can process multiple notification IDs in a single request
- Provides confirmation of retry attempts
- Helps recover from temporary webhook failures

## Credentials

To use these nodes, you need to set up Bunq API credentials in n8n:

### Prerequisites
1. A Bunq account (production or sandbox)
2. An API key from your Bunq account
3. An RSA key pair (private and public keys in PEM format)

### Setting up credentials in n8n

1. In n8n, go to **Credentials** → **New**
2. Search for "Bunq API" and select it
3. Fill in the following fields:
   - **Environment**: Choose "Sandbox" for testing or "Production" for live transactions
   - **API Key**: Your Bunq API key
   - **Private Key (PEM)**: Your RSA private key in PEM format
   - **Public Key (PEM)**: Your RSA public key in PEM format
4. Click **Save**

### Getting your API Key

**Sandbox:**
- Visit the [Bunq Sandbox](https://www.bunq.com/developer)
- Create a sandbox account
- Generate a sandbox API key

**Production:**
- Log in to your Bunq app
- Go to Profile → Security & Settings → Developers
- Generate an API key

### Generating RSA Keys

You can generate an RSA key pair using OpenSSL:

```bash
# Generate private key
openssl genrsa -out private.pem 2048

# Extract public key
openssl rsa -in private.pem -pubout -out public.pem
```

Then copy the contents of `private.pem` and `public.pem` into the respective credential fields.

## Compatibility

- **Minimum n8n version**: 1.55.0
- **Tested with**: n8n v1.55.0+
- **Bunq API version**: v1

## Usage

### Using the Bunq Trigger

1. Add the **Bunq Trigger** node to your workflow
2. Select or create your Bunq API credentials
3. Choose one or more **Callback Categories** that you want to receive notifications for
4. Activate your workflow

The trigger node will:
- Automatically register a webhook with the Bunq API
- Start listening for incoming webhook events
- Pass the webhook payload to the next node in your workflow
- Clean up the webhook when the workflow is deactivated

**Example workflow:**
```
Bunq Trigger (MUTATION) → IF Node → [Process payment data]
```

When a mutation (balance change) occurs in your Bunq account, the trigger fires and your workflow processes the event.

### Using Bunq Session

The Bunq Session node helps you establish and maintain a valid session with the Bunq API. It handles:
- Installation creation
- Device registration  
- Session token creation and renewal

Most workflows won't need this node directly, as the Bunq Trigger handles sessions automatically.

### Using Sign Request

The Sign Request node signs request bodies using your Bunq private key. This is useful when making custom API calls to Bunq that require request signing.

### Using Failed Callback List

The Failed Callback List node retrieves failed webhook notifications from your Bunq account, helping you monitor and troubleshoot webhook delivery issues.

1. Add the **Failed Callback List** node to your workflow
2. Select or create your Bunq API credentials
3. Execute the node to retrieve all failed notifications

The node will return information about each failed notification including:
- The notification filters that were attempted
- The category and event type
- The error message and response code
- The object ID that triggered the notification

**Example workflow:**
```
Schedule Trigger → Failed Callback List → IF (has failures) → Send Alert Email
```

This workflow can check for failed callbacks periodically and alert you when failures occur.

### Using Retry Failed Callback

The Retry Failed Callback node allows you to manually retry webhook notifications that previously failed to deliver.

1. Add the **Retry Failed Callback** node to your workflow
2. Select or create your Bunq API credentials
3. Enter the comma-separated IDs of the notifications you want to retry
4. Execute the node to trigger the retry

**Example workflow:**
```
Failed Callback List → Extract IDs → Retry Failed Callback → Log Success
```

This workflow retrieves failed callbacks and automatically retries them.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [Bunq API Documentation](https://doc.bunq.com)
* [Bunq Callbacks (Webhooks) Documentation](https://doc.bunq.com/basics/callbacks-webhooks)

## Version history

### 0.2.0
- Added Failed Callback List node to retrieve failed webhook notifications
- Added Retry Failed Callback node to retry failed webhook deliveries
- Enhanced webhook monitoring and error recovery capabilities

### 0.1.0
- Initial release
- Bunq Session node for session management
- Sign Request node for request signing
- Bunq Trigger node for webhook-based triggers with support for all Bunq callback categories
