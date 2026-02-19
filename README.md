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

### Bunq Monetary Accounts
A node that retrieves a list of Monetary Accounts from the Bunq API with type filtering. Each account is returned as a separate n8n item for easy processing in workflows.

**Features:**
- Multiselect option to choose which account types to retrieve
- Returns each account as a separate n8n item
- Automatic session management
- Support for all Bunq monetary account types

**Account Types:**
- **Bank**: Classic personal or business bank accounts
- **Savings**: Regular or auto-savings accounts (including VAT accounts)
- **Joint**: Shared accounts with other bunq users (legal co-owners)

### Bunq Payments
A node that retrieves payments from a specific Monetary Account in the Bunq API with support for pagination and date filtering.

**Features:**
- Fetch payments for any monetary account by ID
- Full pagination support for large datasets
- Date filtering to retrieve payments from the last X days
- Option to return all results or limit to a specific number
- Configurable page size (up to 200 items per page)
- Returns each payment as a separate n8n item

**Parameters:**
- **Monetary Account ID**: The ID of the account to retrieve payments from
- **Limit** (optional): Maximum number of payments to return. If not specified, all payments are returned.
- **Last X Days** (optional): Filter to only return payments from the last X days
- **Items Per Page** (optional): Number of items to fetch per API request (max 200)

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

## Credentials

To use these nodes, you need to set up Bunq API credentials in n8n. You can choose between two authentication methods:

### Authentication Methods

#### Option 1: API Key Authentication (Recommended for personal use)
Best for: Personal projects, server-to-server communication, and automated scripts.

**Prerequisites:**
1. A Bunq account (production or sandbox)
2. An API key from your Bunq account
3. An RSA key pair (private and public keys in PEM format)

**Setting up API Key credentials:**

1. In n8n, go to **Credentials** → **New**
2. Search for "Bunq API" and select it
3. Fill in the following fields:
   - **Environment**: Choose "Sandbox" for testing or "Production" for live transactions
   - **API Key**: Your Bunq API key
   - **Private Key (PEM)**: Your RSA private key in PEM format
   - **Public Key (PEM)**: Your RSA public key in PEM format
4. Click **Save**

#### Option 2: OAuth2 Authentication (Required for public applications)
Best for: Third-party applications that need user-specific access with fine-grained permissions.

**Prerequisites:**
1. A Bunq account (production or sandbox)
2. OAuth client credentials from Bunq Developer portal
3. An RSA key pair (private and public keys in PEM format)

**Setting up OAuth2 credentials:**

1. **Create an OAuth client in Bunq:**
   - Log in to your Bunq app
   - Go to Profile → Security & Settings → Developers → OAuth
   - Create a new OAuth client with a redirect URL (e.g., `https://your-domain.com/oauth/callback`)
   - Note down your **Client ID** and **Client Secret**
   
2. **Obtain an OAuth Access Token:**
   
   The OAuth flow must be completed outside of n8n to obtain an access token. You have two options:
   
   **Option A: Use the Bunq mobile app** (Easiest)
   - In the Bunq app, go to your OAuth client settings
   - Use the QR code flow to authorize your application
   - The access token will be returned to your redirect URL
   
   **Option B: Manual API call** (Advanced)
   
   a. Direct users to the authorization URL:
   ```
   https://oauth.bunq.com/auth?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI&state=RANDOM_STATE
   ```
   (Use `https://oauth.sandbox.bunq.com/auth` for sandbox)
   
   b. After user authorization, Bunq redirects to your redirect_uri with a `code` parameter
   
   c. Exchange the authorization code for an access token with a POST request:
   ```bash
   curl -X POST https://api.oauth.bunq.com/v1/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=authorization_code" \
     -d "code=YOUR_AUTHORIZATION_CODE" \
     -d "redirect_uri=YOUR_REDIRECT_URI" \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "client_secret=YOUR_CLIENT_SECRET"
   ```
   (Use `https://api-oauth.sandbox.bunq.com/v1/token` for sandbox)
   
   d. The response will contain an `access_token` - save this token
   
3. **Configure credentials in n8n:**
   
   - In n8n, go to **Credentials** → **New**
   - Search for "Bunq OAuth2 API" and select it
   - Fill in the following fields:
     - **Environment**: Choose "Sandbox" for testing or "Production" for live transactions
     - **OAuth Access Token**: The access token you obtained in step 2
     - **Private Key (PEM)**: Your RSA private key in PEM format
     - **Public Key (PEM)**: Your RSA public key in PEM format
   - Click **Save**

**Note:** OAuth access tokens from Bunq do not expire, but can be revoked by the user. If a token is revoked, you'll need to repeat the OAuth flow to obtain a new one.

### Getting your API Key (for API Key authentication)

**Sandbox:**
- Visit the [Bunq Sandbox](https://www.bunq.com/developer)
- Create a sandbox account
- Generate a sandbox API key

**Production:**
- Log in to your Bunq app
- Go to Profile → Security & Settings → Developers
- Generate an API key

### Getting OAuth Credentials (for OAuth2 authentication)

**Sandbox:**
- Visit the [Bunq Developer Portal](https://developer.bunq.com)
- Create a sandbox account
- Create an OAuth client and retrieve your Client ID and Client Secret

**Production:**
- Log in to your Bunq app
- Go to Profile → Security & Settings → Developers → OAuth
- Create an OAuth client
- Retrieve your Client ID and Client Secret

### Generating RSA Keys (required for both methods)

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

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [Bunq API Documentation](https://doc.bunq.com)
* [Bunq Callbacks (Webhooks) Documentation](https://doc.bunq.com/basics/callbacks-webhooks)

## Version history

### 0.1.0
- Initial release
- Bunq Session node for session management
- Sign Request node for request signing
- Bunq Trigger node for webhook-based triggers with support for all Bunq callback categories
- Bunq Monetary Accounts node for retrieving monetary accounts with type filtering
- Bunq Payments node for retrieving payments with pagination and date filtering
